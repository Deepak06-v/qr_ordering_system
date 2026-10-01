import type { Request, Response } from 'express';
import * as orderService from '../services/order.service';
import { asyncHandler } from '../utils/asyncHandler';
import { apiCreated, apiSuccess } from '../utils/apiResponse';
import type {
  CreateOrderBody,
  ListOrdersQuery,
  UpdateOrderStatusBody,
} from '../validators/order.validator';

type Params = { id: string };

/** POST /api/orders - returns the order in PENDING_PAYMENT, no PIN yet. */
export const createOrder = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as CreateOrderBody;
  const order = await orderService.createOrder(body);
  return apiCreated(res, order);
});

/** GET /api/orders/:id - order state only. Never the QR hash or the PIN. */
export const getOrder = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as Params;
  const order = await orderService.getOrderById(id);
  return apiSuccess(res, order);
});

/** GET /api/orders - the KDS feed for one theater, newest first. */
export const listOrders = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListOrdersQuery;
  const result = await orderService.listOrders({
    theaterId: query.theaterId.toString(),
    ...(query.screenNumber !== undefined ? { screenNumber: query.screenNumber } : {}),
    ...(query.status !== undefined ? { status: query.status } : {}),
    limit: query.limit,
    skip: (query.page - 1) * query.limit,
  });
  return apiSuccess(res, result);
});

/** PATCH /api/orders/:id/status - staff status change. Cannot mark an order paid. */
export const updateOrderStatus = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as Params;
  const { status } = req.body as UpdateOrderStatusBody;
  const order = await orderService.updateOrderStatus(id, status);
  return apiSuccess(res, order);
});
