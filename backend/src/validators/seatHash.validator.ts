import { z } from 'zod';
import { env } from '../config/env';
import { hashLengthForBytes } from '../utils/generateHash';
import { objectIdSchema } from './common.validator';

/**
 * A seat label such as `G3`, `A12` or `A-12`.
 * Deliberately narrow: seat labels end up inside ZIP entry filenames, so
 * path separators, dots and control characters are rejected.
 */
export const seatNumberSchema = z
  .string()
  .trim()
  .min(1, 'Seat number is required')
  .max(24, 'Seat number must be at most 24 characters')
  .regex(
    /^[A-Za-z0-9](?:[A-Za-z0-9\-_/]*[A-Za-z0-9])?$/,
    'Seat number may only contain letters, digits, hyphens, underscores and slashes',
  )
  .transform((value) => value.toUpperCase());

export const screenNumberSchema = z.coerce
  .number()
  .int('Screen number must be an integer')
  .min(1, 'Screen number must be a positive integer')
  .max(999, 'Screen number must be 999 or less');

/**
 * QR hash format guard. The URL path is matched on a fixed, base64url-only
 * character set, so no traversal or injection payload can ever get here.
 */
export const qrHashSchema = z
  .string()
  .trim()
  .regex(
    new RegExp(`^[A-Za-z0-9_-]{${hashLengthForBytes(env.QR_HASH_BYTES)},128}$`),
    'Invalid QR hash',
  );

export const createSeatHashSchema = z
  .object({
    theaterId: objectIdSchema,
    screenNumber: screenNumberSchema,
    seatNumber: seatNumberSchema,
  })
  .strict();

export const bulkCreateSeatHashSchema = z
  .object({
    theaterId: objectIdSchema,
    screenNumber: screenNumberSchema,
    seats: z
      .array(seatNumberSchema)
      .min(1, 'At least one seat is required')
      .max(env.BULK_SEAT_MAX, `A maximum of ${env.BULK_SEAT_MAX} seats can be created at once`),
  })
  .strict()
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    for (let i = 0; i < value.seats.length; i += 1) {
      const seat = value.seats[i];
      if (seat === undefined) continue;
      if (seen.has(seat)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['seats', i],
          message: `Duplicate seat "${seat}" in request`,
        });
      }
      seen.add(seat);
    }
  });

export const exportSeatHashSchema = z
  .object({
    theaterId: objectIdSchema,
    screenNumber: screenNumberSchema,
    includeInactive: z.boolean().default(false),
  })
  .strict();

/**
 * Remapping. Only the seat mapping may change - the hash is the physical sticker
 * and must never be replaced.
 */
export const remapSeatHashSchema = z
  .object({
    screenNumber: screenNumberSchema.optional(),
    seatNumber: seatNumberSchema.optional(),
    theaterId: objectIdSchema.optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.screenNumber !== undefined ||
      value.seatNumber !== undefined ||
      value.theaterId !== undefined,
    {
      message: 'Provide at least one of screenNumber, seatNumber or theaterId',
    },
  );

export const setSeatHashStatusSchema = z
  .object({
    isActive: z.boolean({ message: 'isActive must be a boolean' }),
    reason: z.string().trim().max(200).optional(),
  })
  .strict();

export const seatHashParamsSchema = z.object({ hash: qrHashSchema });

export const listSeatHashesQuerySchema = z
  .object({
    theaterId: objectIdSchema,
    screenNumber: screenNumberSchema.optional(),
    isActive: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(500).default(100),
  })
  .strict();

export type CreateSeatHashInput = z.infer<typeof createSeatHashSchema>;
export type BulkCreateSeatHashInput = z.infer<typeof bulkCreateSeatHashSchema>;
export type ExportSeatHashInput = z.infer<typeof exportSeatHashSchema>;
export type RemapSeatHashInput = z.infer<typeof remapSeatHashSchema>;
export type SetSeatHashStatusInput = z.infer<typeof setSeatHashStatusSchema>;
export type SeatHashParams = z.infer<typeof seatHashParamsSchema>;
export type ListSeatHashesQuery = z.infer<typeof listSeatHashesQuerySchema>;
