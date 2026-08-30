import { v2 as cloudinary } from 'cloudinary';
import multer from 'multer';
import { Request } from 'express';
import streamifier from 'streamifier';

// ─── Config ────────────────────────────────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ─── Multer – memory storage (buffer → Cloudinary) ─────────────────────────
const storage = multer.memoryStorage();

const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const allowedMimes = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
  ];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPEG, PNG, WebP, and PDF files are allowed.'));
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
});

// ─── Upload to Cloudinary ──────────────────────────────────────────────────
export interface CloudinaryResult {
  url: string;
  publicId: string;
  format: string;
  bytes: number;
  secureUrl: string;
}

export async function uploadToCloudinary(
  buffer: Buffer,
  folder: string,
  resourceType: 'image' | 'raw' = 'image',
  fileName?: string
): Promise<CloudinaryResult> {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: `nationmart/${folder}`,
        resource_type: resourceType,
        public_id: fileName,
        use_filename: !!fileName,
        unique_filename: true,
      },
      (error, result) => {
        if (error || !result) {
          reject(error || new Error('Cloudinary upload failed'));
        } else {
          resolve({
            url: result.url,
            secureUrl: result.secure_url,
            publicId: result.public_id,
            format: result.format,
            bytes: result.bytes,
          });
        }
      }
    );
    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
}

// ─── Delete from Cloudinary ────────────────────────────────────────────────
export async function deleteFromCloudinary(
  publicId: string,
  resourceType: 'image' | 'raw' = 'image'
): Promise<void> {
  await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
}

// ─── Upload License Document ───────────────────────────────────────────────
export async function uploadLicenseDocument(
  buffer: Buffer,
  mimetype: string,
  userId: string,
  licenseType: string
): Promise<CloudinaryResult> {
  const isPdf = mimetype === 'application/pdf';
  const folder = 'licenses';
  const fileName = `${userId}-${licenseType.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;
  return uploadToCloudinary(buffer, folder, isPdf ? 'raw' : 'image', fileName);
}

// ─── Upload Product Image ──────────────────────────────────────────────────
export async function uploadProductImage(
  buffer: Buffer,
  productId: string,
  index: number
): Promise<CloudinaryResult> {
  const folder = 'products';
  const fileName = `${productId}-image-${index}-${Date.now()}`;
  return uploadToCloudinary(buffer, folder, 'image', fileName);
}

// ─── Get Cloudinary URL with Transformations ───────────────────────────────
export function getOptimizedImageUrl(
  publicId: string,
  width = 800,
  height = 600,
  crop = 'fill'
): string {
  return cloudinary.url(publicId, {
    width,
    height,
    crop,
    quality: 'auto',
    fetch_format: 'auto',
    secure: true,
  });
}

export default cloudinary;
