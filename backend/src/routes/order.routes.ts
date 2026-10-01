import { Router } from 'express';
import * as controller from '../controllers/order.controller';
import { validate } from '../middleware/validation.middleware';
import { paymentRouter } from './payment.routes';
import {
  createOrderSchema,
  listOrdersQuerySchema,
  orderIdParamsSchema,
  updateOrderStatusSchema,
} from '../validators/order.validator';

export const orderRouter = Router();

/**
 * NOTE: these are development / admin endpoints. This product has no customer
 * accounts, so there is no customer authentication anywhere in the system.
 *
 * Two consequences worth stating plainly rather than hiding:
 *  - `GET /api/orders/:id` is reachable by anyone who knows an order id, so the
 *    id is acting as a bearer secret. Before launch it should be replaced with a
 *    short-lived, order-scoped token issued at payment confirmation.
 *  - `PATCH /api/orders/:id/status` can move an order to DELIVERED. Until staff
 *    authentication exists, it must sit behind a gateway that restricts it.
 */
orderRouter.post('/', validate({ body: createOrderSchema }), controller.createOrder);

// Registered before `/:id` so the literal path is not captured as an id.
orderRouter.get('/', validate({ query: listOrdersQuerySchema }), controller.listOrders);

orderRouter.get('/:id', validate({ params: orderIdParamsSchema }), controller.getOrder);

orderRouter.patch(
  '/:id/status',
  validate({ params: orderIdParamsSchema, body: updateOrderStatusSchema }),
  controller.updateOrderStatus,
);

// Mounted last: both paths start with `/:id`, so an earlier `/:id/payments`
// would be unreachable behind the GET route above.
orderRouter.use('/:id/payments', paymentRouter);
