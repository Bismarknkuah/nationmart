// Central image handling. Downscales an image in the browser, then either
// uploads it to Cloudinary (when configured) and returns the hosted URL, or
// falls back to an inline base64 data URL so the app works without any keys.
//
// To enable Cloudinary, set these on Vercel (frontend) env vars and redeploy:
//   NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME    = your-cloud-name
//   NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET = your-unsigned-preset
// (Create an *unsigned* upload preset in Cloudinary → Settings → Upload.)

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || '';
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || '';

export function cloudinaryEnabled(): boolean {
  return Boolean(CLOUD_NAME && UPLOAD_PRESET);
}

/** Downscale a file to a JPEG data URL (keeps uploads/base64 light). */
function downscale(file: File, maxPx = 1100, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('Could not read that image.'));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Upload a single image. Returns a hosted Cloudinary URL when configured,
 * otherwise a downscaled base64 data URL. Either way the caller just stores
 * the returned string.
 */
export async function uploadImage(file: File, opts: { maxPx?: number; quality?: number } = {}): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file.');
  const dataUrl = await downscale(file, opts.maxPx, opts.quality);

  if (!cloudinaryEnabled()) return dataUrl; // fallback: inline base64

  try {
    const form = new FormData();
    form.append('file', dataUrl);
    form.append('upload_preset', UPLOAD_PRESET);
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: 'POST', body: form });
    const json = await res.json();
    if (json.secure_url) return json.secure_url as string;
    return dataUrl; // upload failed — fall back gracefully
  } catch {
    return dataUrl;
  }
}

/** Upload several files, preserving order. */
export async function uploadImages(files: FileList | File[], opts: { maxPx?: number; quality?: number } = {}): Promise<string[]> {
  const arr = Array.from(files);
  const out: string[] = [];
  for (const f of arr) {
    try { out.push(await uploadImage(f, opts)); } catch { /* skip bad file */ }
  }
  return out;
}
