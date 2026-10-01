import { request } from './client';
import type {
  CreateOrderRequest,
  MenuItem,
  Order,
  PaymentSession,
  ResolvedSeat,
  VerifyPaymentResponse,
} from './types';

/**
 * QR hashes are base64url (see the backend `SeatHash` schema). Validating the
 * shape before spending a round trip keeps a mistyped or mistyped-on-sticker URL
 * from bouncing off the API, and lets the UI show "invalid code" immediately.
 */
const HASH_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

export function isValidSeatHash(value: string): boolean {
  return HASH_PATTERN.test(value);
}

/**
 * Resolve the scanned sticker into a seat. The customer supplies nothing but
 * the hash: the theater, screen and seat all come from the response.
 */
export function resolveSeatHash(hash: string, signal?: AbortSignal): Promise<ResolvedSeat> {
  return request<ResolvedSeat>(`/api/seat-hashes/${encodeURIComponent(hash)}`, {
    ...(signal ? { signal } : {}),
  });
}

/** Menu for the resolved theater. Unavailable (sold out) items are hidden. */
export function listMenu(theaterId: string, signal?: AbortSignal): Promise<MenuItem[]> {
  return request<MenuItem[]>(`/api/menu/${encodeURIComponent(theaterId)}`, {
    ...(signal ? { signal } : {}),
  });
}

/**
 * Create an order in `PENDING_PAYMENT`.
 *
 * The seat, the prices and the total are all decided by the server from the
 * hash and MongoDB. Nothing price-like is ever sent from the client, and the
 * server body is `.strict()` so there is nowhere for one to land.
 *
 * No idempotency key is sent. The server's own protection is two-layered and
 * does not need one from us: it opens the order in a state that cannot be
 * fulfilled, and the following payment call is idempotent per order.
 */
export function createOrder(payload: CreateOrderRequest, signal?: AbortSignal): Promise<Order> {
  return request<Order>('/api/orders', {
    method: 'POST',
    body: payload,
    ...(signal ? { signal } : {}),
  });
}

/**
 * Open a payment attempt and get back the `paymentId` to present for
 * verification.
 *
 * Idempotent server-side: while this order has a payment in flight, a repeat
 * call returns the existing one rather than opening a second charge. That is
 * what makes a double tap - or a client that lost its response and retried -
 * safe, so the client needs no key of its own.
 */
export function createPayment(orderId: string, signal?: AbortSignal): Promise<PaymentSession> {
  return request<PaymentSession>(`/api/orders/${encodeURIComponent(orderId)}/payments`, {
    method: 'POST',
    ...(signal ? { signal } : {}),
  });
}

/**
 * Hand the payment id back for server-side verification.
 *
 * Success is whatever this response says it is - never a local callback. The
 * browser has no way to assert that money moved.
 */
export function verifyPayment(
  orderId: string,
  paymentId: string,
  signal?: AbortSignal,
): Promise<VerifyPaymentResponse> {
  return request<VerifyPaymentResponse>(
    `/api/orders/${encodeURIComponent(orderId)}/payments/verify`,
    {
      method: 'POST',
      body: { paymentId },
      ...(signal ? { signal } : {}),
    },
  );
}

/** Poll order fulfilment. Never returns the PIN - it is issued once. */
export function getOrder(orderId: string, signal?: AbortSignal): Promise<Order> {
  return request<Order>(`/api/orders/${encodeURIComponent(orderId)}`, {
    ...(signal ? { signal } : {}),
  });
}
