/**
 * Ghana Card (National ID) verification service.
 *
 * Format: GHA-XXXXXXXXX-X  (the prefix "GHA", 9 digits, a dash, 1 check digit)
 *
 * In production, set GHANA_CARD_VERIFY_URL + NIA_API_KEY to call the National
 * Identification Authority (NIA) / a licensed KYC aggregator (e.g. Smile ID,
 * Dojah, IdentityPass). When those are not configured, the service runs in
 * "auto" mode and verifies any structurally-valid card so the platform is fully
 * usable in development. Swapping in the real call is a one-function change.
 */

export const GHANA_CARD_REGEX = /^GHA-\d{9}-\d$/;

export interface GhanaCardCheck {
  valid: boolean;
  message: string;
}

export interface GhanaCardVerification {
  verified: boolean;
  status: 'verified' | 'rejected' | 'pending';
  message: string;
  provider: string;
}

/** Normalise user input to canonical uppercase form. */
export function normalizeGhanaCard(raw: string): string {
  return (raw || '').trim().toUpperCase().replace(/\s+/g, '');
}

/** Structural validation of the Ghana Card number. */
export function validateGhanaCardFormat(raw: string): GhanaCardCheck {
  const value = normalizeGhanaCard(raw);
  if (!value) return { valid: false, message: 'Ghana Card number is required.' };
  if (!GHANA_CARD_REGEX.test(value)) {
    return {
      valid: false,
      message: 'Invalid Ghana Card format. Expected GHA-XXXXXXXXX-X (e.g. GHA-123456789-0).',
    };
  }
  return { valid: true, message: 'Valid format.' };
}

/**
 * Verify a Ghana Card against the configured provider.
 * Falls back to auto-verification in development.
 */
export async function verifyGhanaCard(
  cardNumber: string,
  fullName?: string
): Promise<GhanaCardVerification> {
  const value = normalizeGhanaCard(cardNumber);
  const format = validateGhanaCardFormat(value);
  if (!format.valid) {
    return { verified: false, status: 'rejected', message: format.message, provider: 'local' };
  }

  const verifyUrl = process.env.GHANA_CARD_VERIFY_URL;
  const apiKey = process.env.NIA_API_KEY;

  // Production path: call the real KYC provider
  if (verifyUrl && apiKey) {
    try {
      const resp = await fetch(verifyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ pin: value, fullName }),
      });
      const data: any = await resp.json().catch(() => ({}));
      if (resp.ok && (data.verified === true || data.status === 'verified' || data.success === true)) {
        return { verified: true, status: 'verified', message: 'Verified by NIA provider.', provider: 'nia' };
      }
      return {
        verified: false,
        status: 'rejected',
        message: data.message || 'Ghana Card could not be verified with the NIA provider.',
        provider: 'nia',
      };
    } catch (err: any) {
      // Provider unreachable -> mark pending for manual review rather than hard-fail
      return {
        verified: false,
        status: 'pending',
        message: 'Verification service unavailable. Card queued for manual review.',
        provider: 'nia',
      };
    }
  }

  // Development / no-credentials path: auto-verify valid formats
  return {
    verified: true,
    status: 'verified',
    message: 'Ghana Card format accepted (development auto-verification).',
    provider: 'auto',
  };
}
