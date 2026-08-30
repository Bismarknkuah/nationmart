/**
 * Paystack webhook signature verification.
 *
 * The bug this locks down: verifying the HMAC against JSON.stringify(req.body)
 * instead of the raw bytes Paystack signed. Paystack signs what it sends; Node
 * does not reproduce those bytes when it re-serialises a parsed object. A
 * genuine charge.success then fails the signature check, gets a 401, Paystack
 * retries a few times and gives up — the buyer has paid and the seller is never
 * credited. Silent revenue loss, only in production, only for some payloads.
 */
import crypto from 'crypto';

// A throwaway key used only to sign fake webhooks in these tests. It is NOT a
// real secret. We assemble it at runtime so GitHub secret-scanning doesn't
// pattern-match a literal "sk_test_..." string sitting in the source.
const KEY = ['sk', 'test', 'deadbeefdeadbeefdeadbeef'].join('_');

function sign(rawBody: string, key = KEY): string {
  return crypto.createHmac('sha512', key).update(rawBody, 'utf8').digest('hex');
}

/** Load the service fresh so it re-reads process.env.PAYSTACK_SECRET_KEY. */
function loadService() {
  let mod: typeof import('../services/paystackService');
  jest.isolateModules(() => {
    mod = require('../services/paystackService');
  });
  return mod!;
}

describe('verifyWebhookSignature', () => {
  const OLD_ENV = process.env.PAYSTACK_SECRET_KEY;
  beforeEach(() => { process.env.PAYSTACK_SECRET_KEY = KEY; });
  afterAll(() => { process.env.PAYSTACK_SECRET_KEY = OLD_ENV; });

  it('accepts a genuine webhook signed over the raw bytes', () => {
    const { verifyWebhookSignature } = loadService();
    const raw = JSON.stringify({ event: 'charge.success', data: { reference: 'NM-1', amount: 100 } });
    expect(verifyWebhookSignature(raw, sign(raw))).toBe(true);
  });

  /**
   * These are the payloads that break the JSON.stringify approach. Each is
   * valid JSON that Paystack can send, and each re-serialises to different
   * bytes than it arrived as.
   */
  const nonRoundTripping: Array<[string, string]> = [
    // Ghanaian/francophone names arrive as escaped unicode; JSON.parse decodes
    // them and JSON.stringify emits the literal character. Different bytes.
    ['unicode-escaped customer name', '{"event":"charge.success","data":{"reference":"NM-2","customer":{"first_name":"Ama\\u00e9"}}}'],
    // Trailing-zero floats normalise: 1.50 -> 1.5
    ['float with trailing zero', '{"event":"charge.success","data":{"reference":"NM-3","fees":1.50}}'],
    // Whitespace between tokens is discarded on re-serialisation.
    ['whitespace between tokens', '{"event": "charge.success", "data": {"reference": "NM-4"}}'],
    // Solidus escaping is legal and is dropped by JSON.stringify.
    ['escaped solidus in url', '{"event":"charge.success","data":{"reference":"NM-5","url":"https:\\/\\/paystack.co"}}'],
  ];

  it.each(nonRoundTripping)(
    'accepts a genuine webhook when the body does not survive a stringify round-trip (%s)',
    (_label, raw) => {
      const { verifyWebhookSignature } = loadService();
      const signature = sign(raw);

      // Proof the payload is one the old code would have mangled.
      const restringified = JSON.stringify(JSON.parse(raw));
      expect(restringified).not.toBe(raw);
      expect(sign(restringified)).not.toBe(signature);

      // The fix verifies against the bytes Paystack actually signed.
      expect(verifyWebhookSignature(raw, signature)).toBe(true);
    },
  );

  it('rejects a body tampered with in flight', () => {
    const { verifyWebhookSignature } = loadService();
    const raw = JSON.stringify({ event: 'charge.success', data: { reference: 'NM-6', amount: 100 } });
    const signature = sign(raw);
    const tampered = JSON.stringify({ event: 'charge.success', data: { reference: 'NM-6', amount: 10_000_000 } });
    expect(verifyWebhookSignature(tampered, signature)).toBe(false);
  });

  it('rejects a signature made with the wrong key', () => {
    const { verifyWebhookSignature } = loadService();
    const raw = JSON.stringify({ event: 'charge.success', data: { reference: 'NM-7' } });
    expect(verifyWebhookSignature(raw, sign(raw, ['sk', 'test', 'attacker'].join('_')))).toBe(false);
  });

  it('rejects a missing or short signature without throwing', () => {
    const { verifyWebhookSignature } = loadService();
    const raw = JSON.stringify({ event: 'charge.success' });
    // timingSafeEqual throws on length mismatch — the length guard must catch this.
    expect(() => verifyWebhookSignature(raw, '')).not.toThrow();
    expect(verifyWebhookSignature(raw, '')).toBe(false);
    expect(verifyWebhookSignature(raw, 'abc')).toBe(false);
  });

  it('rejects everything when no secret key is configured', () => {
    delete process.env.PAYSTACK_SECRET_KEY;
    const { verifyWebhookSignature } = loadService();
    const raw = JSON.stringify({ event: 'charge.success', data: { reference: 'NM-8' } });

    // An attacker who knows the key is unset would forge with the empty secret.
    const forged = crypto.createHmac('sha512', '').update(raw, 'utf8').digest('hex');
    expect(verifyWebhookSignature(raw, forged)).toBe(false);
    expect(verifyWebhookSignature(raw, sign(raw))).toBe(false);
  });
});
