import { z } from 'zod';
import { objectIdSchema } from './common.validator';

/**
 * The provider-issued payment identifier.
 *
 * Constrained to what a real gateway would return (alphanumeric, plus the
 * punctuation gateways actually use) so nothing exotic reaches the provider
 * adapter. `/api/payments/create` returns the exact value to send here.
 */
export const providerPaymentIdSchema = z
  .string()
  .trim()
  .min(1, 'paymentId is required')
  .max(128, 'paymentId must be at most 128 characters')
  .regex(/^[A-Za-z0-9_-]{1,128}$/, 'paymentId contains unsupported characters');

/**
 * Confirming a simulated charge.
 *
 * There is no card number, CVV, UPI id or OTP field here, and there must not be
 * one added: the MVP provider moves no money, so the correct amount of payment
 * data to collect is none.
 */
export const verifyPaymentSchema = z
  .object({
    paymentId: providerPaymentIdSchema,
  })
  .strict();

export const orderIdParamsSchema = z.object({ id: objectIdSchema }).strict();

export type VerifyPaymentBody = z.infer<typeof verifyPaymentSchema>;
export type PaymentOrderParams = z.infer<typeof orderIdParamsSchema>;
