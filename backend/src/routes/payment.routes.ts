import { Router } from 'express';
import * as controller from '../controllers/payment.controller';
import { validate } from '../middleware/validation.middleware';
import { orderIdParamsSchema, verifyPaymentSchema } from '../validators/payment.validator';

export const paymentRouter = Router({ mergeParams: true });

/**
 * NOTE: development / admin endpoints - there is no customer authentication in
 * this product yet. See the note in `order.routes.ts`; it applies identically
 * here, and the verify endpoint in particular must be gated before launch.
 */

paymentRouter.post('/', validate({ params: orderIdParamsSchema }), controller.createPayment);

paymentRouter.post(
  '/verify',
  validate({ params: orderIdParamsSchema, body: verifyPaymentSchema }),
  controller.verifyPayment,
);
