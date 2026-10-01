import type { Request, Response } from 'express';
import * as orderService from '../services/order.service';
import { asyncHandler } from '../utils/asyncHandler';
import { apiCreated, apiSuccess } from '../utils/apiResponse';
import type { VerifyPaymentBody } from '../validators/payment.validator';

type Params = { id: string };

/**
 * POST /api/orders/:id/payments
 *
 * Opens a payment attempt and returns the id the client must present to
 * `POST /api/orders/:id/payments/verify`. Idempotent for a given order while
 * its payment is still pending.
 */
export const createPayment = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as Params;
  const payment = await orderService.createPayment(id);
  return apiCreated(res, payment);
});

/**
 * POST /api/orders/:id/payments/verify
 *
 * The only path to `PAID`. On the request that actually completes the order the
 * response carries the plaintext delivery PIN; a repeat call returns the order
 * with `alreadyCompleted: true` and no PIN, because only a hash is stored.
 */
export const verifyPayment = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as Params;
  const { paymentId } = req.body as VerifyPaymentBody;
  const result = await orderService.verifyPayment(id, paymentId);
  return apiSuccess(res, result);
});
