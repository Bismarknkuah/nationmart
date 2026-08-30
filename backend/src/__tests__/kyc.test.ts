import { scoreUserRisk, verifyGhanaCard } from '../services/kycService';

describe('fraud risk scoring', () => {
  test('verified active user with phone is low risk', () => {
    const r = scoreUserRisk({ ghanaCardStatus: 'verified', phone: '0240000000', accountStatus: 'active', createdAt: new Date('2024-01-01') }, {});
    expect(r.band).toBe('low');
    expect(r.score).toBeLessThan(30);
  });

  test('unverified pending user with reports is higher risk', () => {
    const r = scoreUserRisk(
      { ghanaCardStatus: 'unverified', phone: '', accountStatus: 'pending_review', createdAt: new Date() },
      { reports: 2, failedDeliveries: 3 },
    );
    expect(['medium', 'high']).toContain(r.band);
    expect(r.reasons.length).toBeGreaterThan(0);
  });
});

describe('Ghana Card format verification (no NIA configured)', () => {
  test('rejects malformed numbers', async () => {
    const r = await verifyGhanaCard('not-a-card');
    expect(r.valid).toBe(false);
  });

  test('accepts well-formed numbers on format (verified=false without NIA)', async () => {
    const r = await verifyGhanaCard('GHA-123456789-0');
    expect(r.valid).toBe(true);
    expect(r.verified).toBe(false);
  });
});
