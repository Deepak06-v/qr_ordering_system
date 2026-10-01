import { z } from 'zod';
import mongoose from 'mongoose';

/**
 * 24-character hex ObjectId. Anything else is rejected before it reaches Mongoose,
 * so a bad id can never turn into a CastError or a full collection scan.
 */
export const objectIdSchema = z
  .string()
  .trim()
  .min(1, 'Identifier is required')
  .refine((value) => mongoose.Types.ObjectId.isValid(value), {
    message: 'Must be a valid MongoDB ObjectId (24 hex characters)',
  })
  .transform((value) => new mongoose.Types.ObjectId(value));

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const booleanQuerySchema = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true')
  .optional();
