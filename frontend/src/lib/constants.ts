import type { OrderStatus } from '@/api/types';

/**
 * Order lifecycle. The PIN is the delivery mechanism, so status is deliberately
 * secondary copy - friendly, never technical.
 */
export const ORDER_STATUS_COPY: Record<OrderStatus, { label: string; customer: string }> = {
  // Reachable only between order creation and payment verification, so a
  // customer should never see it. Mapped anyway so a polling response that
  // arrives mid-payment cannot render an undefined label.
  PENDING_PAYMENT: { label: 'Awaiting payment', customer: 'Waiting for payment' },
  PAID: { label: 'Paid', customer: 'Payment confirmed' },
  PREPARING: { label: 'Preparing', customer: 'Being prepared' },
  OUT_FOR_DELIVERY: { label: 'Out for delivery', customer: 'On the way to your seat' },
  DELIVERED: { label: 'Delivered', customer: 'Delivered' },
  CANCELLED: { label: 'Cancelled', customer: 'This order was cancelled' },
};

/** Steps rendered on the success screen. CANCELLED is off the happy path. */
export const ORDER_STATUS_SEQUENCE: OrderStatus[] = [
  'PAID',
  'PREPARING',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
];

export function orderStatusCopy(status: OrderStatus): { label: string; customer: string } {
  return ORDER_STATUS_COPY[status] ?? ORDER_STATUS_COPY.PAID;
}

/** Per-item quantity ceiling. Matches the backend's `max: 20` on order items. */
export const MAX_ITEM_QUANTITY = 20;

/**
 * Distinct-line ceiling for one order.
 *
 * Deliberately stricter than the server's own `MAX_ORDER_LINES` of 50: a cinema
 * snack order past a dozen lines is a mistake, and the cap keeps the checkout
 * sheet readable on a 375px screen.
 */
export const MAX_CART_ITEMS = 12;

/** Motion budget. Nothing on the ordering path is allowed to exceed this. */
export const MOTION = {
  instant: 0.12,
  fast: 0.18,
  base: 0.24,
  springy: { type: 'spring', stiffness: 520, damping: 32, mass: 0.6 },
} as const;

/** Minimum interactive size. Below 44px, thumbs miss. */
export const TOUCH_TARGET_PX = 44;

/** How often the success screen re-checks fulfilment status. */
export const STATUS_POLL_INTERVAL_MS = 12_000;
