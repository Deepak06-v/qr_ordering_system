import { z } from 'zod';
import { objectIdSchema, paginationSchema, booleanQuerySchema } from './common.validator';

const theaterName = z
  .string()
  .trim()
  .min(1, 'Theater name is required')
  .max(200, 'Theater name must be at most 200 characters');

const timezone = z
  .string()
  .trim()
  .min(1, 'Timezone is required')
  .refine(
    (value) => {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: value });
        return true;
      } catch {
        return false;
      }
    },
    { message: 'Must be a valid IANA timezone, e.g. Asia/Kolkata' },
  );

const optionalTrimmedString = (max: number): z.ZodType<string | undefined> =>
  z
    .string()
    .trim()
    .max(max, `Must be at most ${max} characters`)
    .optional()
    .transform((value) => (value === '' ? undefined : value));

export const createTheaterSchema = z
  .object({
    name: theaterName,
    address: optionalTrimmedString(500),
    city: optionalTrimmedString(120),
    timezone: timezone.optional(),
    isActive: z.boolean().default(true),
  })
  .strict();

export const updateTheaterSchema = z
  .object({
    name: theaterName.optional(),
    address: optionalTrimmedString(500),
    city: optionalTrimmedString(120),
    timezone: timezone.optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export const theaterIdParamsSchema = z.object({ id: objectIdSchema });

export const listTheatersQuerySchema = z
  .object({
    page: paginationSchema.shape.page,
    limit: paginationSchema.shape.limit,
    isActive: booleanQuerySchema,
    city: z.string().trim().min(1).max(120).optional(),
    search: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

export type CreateTheaterInput = z.infer<typeof createTheaterSchema>;
export type UpdateTheaterInput = z.infer<typeof updateTheaterSchema>;
export type ListTheatersQuery = z.infer<typeof listTheatersQuerySchema>;
