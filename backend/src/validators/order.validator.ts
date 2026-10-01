import { z } from 'zod';
import {
  FILTERABLE_STATUSES,
  STAFF_ASSIGNABLE_STATUSES,
  type OrderStatus,
} from '../models/order-status';
import { objectIdSchema } from './common.validator';
import { qrHashSchema } from './seatHash.validator';

/**
 * `z.enum` needs a mutable non-empty tuple, while the status tables are readonly
 * arrays. Widening once here keeps the call sites readable and keeps the inferred
 * output type narrowed to `OrderStatus`.
 */
const staffAssignableStatus = [...STAFF_ASSIGNABLE_STATUSES] as [OrderStatus, ...OrderStatus[]];
const filterableStatus = [...FILTERABLE_STATUSES] as [OrderStatus, ...OrderStatus[]];

/**
 * Upper bound on distinct lines in one order. A cinema snack order with more
 * than this is a mistake or an attempt to make the server do unbounded work
 * building a snapshot.
 */
export const MAX_ORDER_LINES = 50;

/** 1..20 per line. Kept in step with the Order schema's own validator. */
export const MAX_ITEM_QUANTITY = 20;

const orderItemSchema = z
  .object({
    itemId: objectIdSchema,
    quantity: z.coerce
      .number()
      .int('Quantity must be an integer')
      .min(1, 'Quantity must be at least 1')
      .max(MAX_ITEM_QUANTITY, `Quantity per item is capped at ${MAX_ITEM_QUANTITY}`),
  })
  .strict();

/**
 * The ONLY things a client may state about an order: which seat it scanned, and
 * what it wants. There is deliberately no `price`, `totalAmount`, `name`,
 * `screenNumber` or `seatNumber` field - `.strict()` rejects the whole body if
 * one is sent, so a tampered price is a 400 rather than a silently ignored key.
 */
export const createOrderSchema = z
  .object({
    hash: qrHashSchema,
    items: z
      .array(orderItemSchema)
      .min(1, 'An order must contain at least one item')
      .max(MAX_ORDER_LINES, `An order can contain at most ${MAX_ORDER_LINES} distinct items`),
  })
  .strict()
  .superRefine((value, ctx) => {
    // A duplicate line is ambiguous: two prices, one line item. Collapse it into
    // one error rather than letting the server guess which quantity was meant.
    const seen = new Set<string>();
    for (let i = 0; i < value.items.length; i += 1) {
      const item = value.items[i];
      if (!item) continue;
      const key = item.itemId.toString();
      if (seen.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['items', i, 'itemId'],
          message: 'Duplicate item in order; combine the quantities into one line',
        });
      }
      seen.add(key);
    }
  });

/**
 * The KDS feed. Requires `theaterId` because an order list is always scoped to
 * one cinema - there is no "all orders" query by design.
 */
export const listOrdersQuerySchema = z
  .object({
    theaterId: objectIdSchema,
    screenNumber: z.coerce.number().int().min(1).max(999).optional(),
    status: z.enum(filterableStatus).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

/**
 * Staff status change.
 *
 * `status` is restricted to `STAFF_ASSIGNABLE_STATUSES`, which excludes
 * `PENDING_PAYMENT` and `PAID`. An order cannot be marked paid by patching it -
 * only payment verification can do that.
 */
export const updateOrderStatusSchema = z
  .object({
    status: z.enum(staffAssignableStatus, {
      message: `Status must be one of: ${STAFF_ASSIGNABLE_STATUSES.join(', ')}`,
    }),
  })
  .strict();

export const orderIdParamsSchema = z.object({ id: objectIdSchema }).strict();

export type CreateOrderBody = z.infer<typeof createOrderSchema>;
export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;
export type UpdateOrderStatusBody = z.infer<typeof updateOrderStatusSchema>;
export type OrderIdParams = z.infer<typeof orderIdParamsSchema>;
