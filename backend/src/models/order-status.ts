/**
 * Order and payment status vocabulary, in a dependency-free module.
 *
 * This exists to break an import cycle: `models/Order.ts` re-exports the PIN
 * crypto from `services/pin.service.ts`, and that service needs to know which
 * statuses are still live. Keeping the constants here means neither file has to
 * import the other.
 */

export const ORDER_STATUSES = [
  /**
   * The order exists but no money has moved yet. Set by order creation and
   * cleared only by successful payment verification.
   *
   * Phase 1 defaulted `status` to PAID, which is unsafe: it would mark an unpaid
   * order as paid. This state makes "created but not yet paid" representable, so
   * nothing downstream has to infer it from a timestamp.
   */
  'PENDING_PAYMENT',
  'PAID',
  'PREPARING',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
] as const;

export const PAYMENT_STATUSES = ['PENDING', 'COMPLETED', 'FAILED', 'REFUNDED'] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** States in which the order is still live and its verification PIN still means something. */
export const ACTIVE_ORDER_STATUSES: readonly OrderStatus[] = [
  'PAID',
  'PREPARING',
  'OUT_FOR_DELIVERY',
];

/** States from which no further transition is allowed. */
export const TERMINAL_ORDER_STATUSES: readonly OrderStatus[] = ['DELIVERED', 'CANCELLED'];

/**
 * Allowed status transitions.
 *
 * `PENDING_PAYMENT` has no entry on purpose: it can only be left via payment
 * verification, never via `PATCH /api/orders/:id/status`, so a staff member (or
 * anyone who reaches an unauthenticated endpoint) cannot skip the payment step.
 */
export const ALLOWED_STATUS_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  PENDING_PAYMENT: [],
  PAID: ['PREPARING', 'CANCELLED'],
  PREPARING: ['OUT_FOR_DELIVERY', 'CANCELLED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'CANCELLED'],
  DELIVERED: [],
  CANCELLED: [],
};

/** Statuses a staff member may request via the status endpoint. */
export const STAFF_ASSIGNABLE_STATUSES: readonly OrderStatus[] = [
  'PREPARING',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
];

/**
 * Statuses the KDS feed may be filtered by.
 *
 * Deliberately wider than `STAFF_ASSIGNABLE_STATUSES`: the kitchen absolutely
 * needs to list `PAID` orders, because those are the tickets it has to make.
 * Filtering is a read concern; assignment is a write concern, and only the
 * latter is restricted.
 */
export const FILTERABLE_STATUSES: readonly OrderStatus[] = ORDER_STATUSES;

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED_STATUS_TRANSITIONS[from].includes(to);
}
