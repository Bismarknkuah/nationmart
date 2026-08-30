import { z } from 'zod';

// ─── Auth ──────────────────────────────────────────────────────────────────
export const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Must contain at least one number'),
  phone: z.string().optional(),
  role: z.enum(['buyer', 'seller', 'reseller', 'manufacturer']).default('buyer'),
  // Seller-specific
  companyName: z.string().optional(),
  businessRegistrationNumber: z.string().optional(),
  taxIdentificationNumber: z.string().optional(),
  region: z.string().optional(),
  address: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z
    .string()
    .min(8)
    .regex(/[A-Z]/)
    .regex(/[0-9]/),
});

// ─── Products ──────────────────────────────────────────────────────────────
export const createProductSchema = z.object({
  name: z.string().min(3).max(200),
  description: z.string().min(20).max(2000),
  category: z.enum(['timber', 'bamboo', 'plywood', 'engineered_wood', 'veneer', 'charcoal', 'other']),
  species: z.string().min(2).max(100),
  scientificName: z.string().optional(),
  price: z.number().positive('Price must be positive'),
  currency: z.enum(['GHS', 'USD']).default('GHS'),
  unit: z.string().default('per cubic metre'),
  minOrderQuantity: z.number().int().positive().default(1),
  availableStock: z.number().int().nonnegative(),
  region: z.string().min(2),
  harvestingLocation: z.string().optional(),
  dimensions: z
    .object({
      length: z.string().optional(),
      width: z.string().optional(),
      thickness: z.string().optional(),
    })
    .optional(),
  moistureContent: z.string().optional(),
  grading: z.string().optional(),
  flegtVerified: z.boolean().default(false),
  fscCertified: z.boolean().default(false),
  pefc: z.boolean().default(false),
  laceyActCompliant: z.boolean().default(false),
  eudrCompliant: z.boolean().default(false),
  exportMarkets: z.array(z.string()).default([]),
});

export const updateProductSchema = createProductSchema.partial();

// ─── Orders ────────────────────────────────────────────────────────────────
export const createOrderSchema = z.object({
  items: z
    .array(
      z.object({
        product: z.string().min(24).max(24), // MongoDB ObjectId
        quantity: z.number().int().positive(),
      })
    )
    .min(1, 'Order must have at least one item'),
  shippingAddress: z.object({
    street: z.string().min(5),
    city: z.string().min(2),
    state: z.string().optional(),
    country: z.string().min(2),
    postalCode: z.string().optional(),
  }),
  currency: z.enum(['GHS', 'USD']).default('GHS'),
  notes: z.string().max(500).optional(),
});

export const updateOrderStatusSchema = z.object({
  status: z.enum([
    'pending',
    'confirmed',
    'processing',
    'quality_check',
    'ready_for_shipping',
    'shipped',
    'customs_clearance',
    'delivered',
    'cancelled',
  ]),
  note: z.string().max(500).optional(),
  trackingNumber: z.string().optional(),
  carrier: z.string().optional(),
});

// ─── Licenses ──────────────────────────────────────────────────────────────
export const uploadLicenseSchema = z.object({
  type: z.enum([
    'TIDD',
    'Forestry Commission Cert.',
    'Tax Clearance',
    'Business Registration',
    'FLEGT License',
    'Phytosanitary Certificate',
    'Export Permit',
    'Environmental Impact Assessment',
    'Other',
  ]),
  licenseNumber: z.string().min(3).max(100),
  issuedBy: z.string().min(2).max(200),
  issuedDate: z.string().refine((v) => !isNaN(Date.parse(v)), 'Invalid date'),
  expiryDate: z.string().refine((v) => !isNaN(Date.parse(v)), 'Invalid date'),
});

// ─── Admin ─────────────────────────────────────────────────────────────────
export const reviewLicenseSchema = z.object({
  action: z.enum(['approve', 'reject']),
  rejectionReason: z.string().max(500).optional(),
});

// ─── Validate Middleware Helper ────────────────────────────────────────────
import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: result.error.flatten().fieldErrors,
      });
      return;
    }
    req.body = result.data;
    next();
  };
}
