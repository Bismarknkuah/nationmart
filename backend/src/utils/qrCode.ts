import QRCode from 'qrcode';
import crypto from 'crypto';

// ─── Generate QR Code as Base64 Data URL ──────────────────────────────────
export async function generateQRCodeDataUrl(content: string): Promise<string> {
  return QRCode.toDataURL(content, {
    errorCorrectionLevel: 'H',
    type: 'image/png',
    width: 300,
    margin: 2,
    color: { dark: '#3d2210', light: '#ffffff' },
  });
}

// ─── Generate QR Code as Buffer (for PDF embedding) ───────────────────────
export async function generateQRCodeBuffer(content: string): Promise<Buffer> {
  return QRCode.toBuffer(content, {
    errorCorrectionLevel: 'H',
    type: 'png',
    width: 200,
    margin: 1,
  });
}

// ─── Generate Product Passport ID ─────────────────────────────────────────
export function generateProductPassportId(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `NM-${timestamp}-${random}`;
}

// ─── Generate Product Passport QR URL ─────────────────────────────────────
export function getProductPassportUrl(passportId: string): string {
  const baseUrl = process.env.FRONTEND_URL || 'https://nationmart.gh';
  return `${baseUrl}/passport/${passportId}`;
}

// ─── Generate Order QR URL ─────────────────────────────────────────────────
export function getOrderTrackingUrl(orderNumber: string): string {
  const baseUrl = process.env.FRONTEND_URL || 'https://nationmart.gh';
  return `${baseUrl}/track/${orderNumber}`;
}

// ─── Generate Blockchain-style Hash for Traceability ─────────────────────
export function generateTraceabilityHash(data: object): string {
  const json = JSON.stringify(data);
  return crypto.createHash('sha256').update(json).digest('hex').substring(0, 16) + '…';
}

// ─── Verify Traceability Hash ─────────────────────────────────────────────
export function verifyTraceabilityHash(data: object, hash: string): boolean {
  const expected = crypto
    .createHash('sha256')
    .update(JSON.stringify(data))
    .digest('hex')
    .substring(0, 16);
  return hash.startsWith(expected);
}
