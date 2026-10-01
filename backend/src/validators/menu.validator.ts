import { z } from 'zod';
import { objectIdSchema } from './common.validator';

const MAX_PRICE_PAISE = 100_000_00; // ₹1,00,000

export const menuCategorySchema = z
  .string()
  .trim()
  .min(1, 'Category is required')
  .max(60, 'Category must be at most 60 characters')
  .transform((value) => value.toUpperCase());

/**
 * Money is transported as an integer number of paise and validated as an integer.
 * A client sending `250.5` or `"250.50"` is rejected outright rather than silently
 * rounded, so the cart total can never drift from the menu price.
 */
export const pricePaiseSchema = z
  .number({ message: 'Price must be a number of paise (integer)' })
  .int('Price must be an integer number of paise (e.g. 25000 for ₹250)')
  .min(0, 'Price cannot be negative')
  .max(MAX_PRICE_PAISE, 'Price exceeds the maximum allowed value')
  .safe();

export const createMenuItemSchema = z
  .object({
    theaterId: objectIdSchema,
    name: z.string().trim().min(1, 'Item name is required').max(120, 'Name is too long'),
    category: menuCategorySchema,
    description: z
      .string()
      .trim()
      .max(500, 'Description is too long')
      .optional()
      .transform((value) => (value === '' ? undefined : value)),
    price: pricePaiseSchema,
    imageUrl: z
      .string()
      .trim()
      .url('imageUrl must be a valid URL')
      .max(2048, 'imageUrl is too long')
      .optional()
      .or(z.literal('').transform(() => undefined)),
    isAvailable: z.boolean().default(true),
    displayOrder: z.coerce.number().int().min(0).max(100_000).default(0),
  })
  .strict();

export const updateMenuItemSchema = z
  .object({
    name: z.string().trim().min(1, 'Item name is required').max(120, 'Name is too long').optional(),
    category: menuCategorySchema.optional(),
    description: z
      .string()
      .trim()
      .max(500, 'Description is too long')
      .optional()
      .transform((value) => (value === '' ? undefined : value)),
    price: pricePaiseSchema.optional(),
    imageUrl: z
      .string()
      .trim()
      .url('imageUrl must be a valid URL')
      .max(2048, 'imageUrl is too long')
      .optional()
      .or(z.literal('').transform(() => undefined)),
    isAvailable: z.boolean().optional(),
    displayOrder: z.coerce.number().int().min(0).max(100_000).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export const menuItemIdParamsSchema = z.object({ id: objectIdSchema });

export const listMenuQuerySchema = z
  .object({
    category: menuCategorySchema.optional(),
    isAvailable: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .optional(),
    includeUnavailable: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .optional(),
  })
  .strict();

export const theaterIdParamsSchema = z.object({ theaterId: objectIdSchema });

export type CreateMenuItemInput = z.infer<typeof createMenuItemSchema>;
export type UpdateMenuItemInput = z.infer<typeof updateMenuItemSchema>;
export type ListMenuQuery = z.infer<typeof listMenuQuerySchema>;
