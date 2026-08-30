import { v2 as cloudinary } from 'cloudinary';

let configured = false;
function ready(): boolean {
  if (configured) return true;
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) return false;
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
  configured = true;
  return true;
}

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_BYTES = 5 * 1024 * 1024;

/** Validate a data URL's declared mime type and approximate byte size. */
export function validateImageDataUrl(dataUrl: string): { ok: boolean; error?: string } {
  if (!dataUrl) return { ok: true };
  if (!dataUrl.startsWith('data:')) return { ok: true }; // already a URL
  const m = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
  if (!m) return { ok: false, error: 'Malformed image data.' };
  if (!ALLOWED.includes(m[1])) return { ok: false, error: `Unsupported image type ${m[1]}.` };
  const bytes = Math.floor((m[2].length * 3) / 4);
  if (bytes > MAX_BYTES) return { ok: false, error: 'Image exceeds 5MB.' };
  return { ok: true };
}

/**
 * Store an image. With Cloudinary configured it uploads and returns the CDN URL;
 * otherwise it returns the original data URL (dev fallback). Virus scanning hook:
 * if VIRUS_SCAN_URL is set, the bytes are POSTed there first and rejected on a
 * positive result.
 */
export async function storeImage(dataUrl: string, folder = 'nationmart'): Promise<string> {
  const v = validateImageDataUrl(dataUrl);
  if (!v.ok) throw new Error(v.error);

  // Optional virus scan
  const scanUrl = process.env.VIRUS_SCAN_URL;
  const fetchFn: any = (globalThis as any).fetch;
  if (scanUrl && fetchFn && dataUrl.startsWith('data:')) {
    try {
      const res = await fetchFn(scanUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data: dataUrl }) });
      const out = await res.json();
      if (out?.infected) throw new Error('Upload rejected: malware detected.');
    } catch (e) {
      if ((e as Error).message.includes('malware')) throw e; // hard fail on detection
      // scanner unreachable → log and continue
      console.error('[virus-scan:skip]', (e as Error).message);
    }
  }

  if (!ready() || !dataUrl.startsWith('data:')) return dataUrl;
  const res = await cloudinary.uploader.upload(dataUrl, { folder, resource_type: 'image' });
  return res.secure_url;
}
