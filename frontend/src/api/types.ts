/**
 * Wire types for the backend API.
 *
 * Money is ALWAYS integer paise, matching the server contract: `25000` is
 * ₹250. A float rupee value must never appear here, and the client never
 * authoritatively totals anything - the server recalculates on order creation.
 */

/** Success envelope: `{ success: true, data }`. */
export interface ApiSuccess<T> {
  success: true;
  data: T;
}

/** Failure envelope: `{ success: false, error }`. */
export interface ApiFailure {
  success: false;
  error: {
    code: string;
    message: string;
    requestId?: string;
  };
}

export type ApiEnvelope<T> = ApiSuccess<T> | ApiFailure;

/** `GET /api/seat-hashes/:hash` - the only way a seat is ever established. */
export interface ResolvedSeat {
  hash: string;
  theaterId: string;
  screenNumber: number;
  seatNumber: string;
  theater: {
    id: string;
    name: string;
    city?: string;
    timezone: string;
    isActive: boolean;
  };
}

/** `GET /api/menu/:theaterId` */
export interface MenuItem {
  id: string;
  theaterId: string;
  name: string;
  category: string;
  description?: string;
  /** Integer paise. */
  price: number;
  /** Display-only convenience field from the server; never used for totals. */
  priceRupees: number;
  imageUrl?: string;
  isAvailable: boolean;
  displayOrder: number;
}

/**
 * Mirrors the backend `OrderStatus` union exactly.
 *
 * `PENDING_PAYMENT` is included because the server returns an order in that
 * state between step 1 and step 3 of the payment flow, and the UI has to
 * describe it truthfully.
 */
export type OrderStatus =
  | 'PENDING_PAYMENT'
  | 'PAID'
  | 'PREPARING'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CANCELLED';

export type PaymentStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';

export interface OrderLine {
  itemId: string;
  name: string;
  quantity: number;
  /** Integer paise, read from MongoDB by the server. */
  price: number;
}

/** Mirrors the backend `OrderDTO`. */
export interface Order {
  orderId: string;
  /** Staff-facing reference, e.g. `FM-1042`. Shown to the customer for queries. */
  orderNumber: string;
  theaterId: string;
  screenNumber: number;
  seatNumber: string;
  items: OrderLine[];
  /** Integer paise. Authoritative server-side total. */
  totalAmount: number;
  currency: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  createdAt: string;
  updatedAt: string;
  paidAt?: string;
}

/**
 * `POST /api/orders/:id/payments` - an open payment attempt.
 *
 * Mirrors the backend `CreatePaymentDTO`. The server makes this idempotent per
 * order: while a payment is still pending, a repeat call returns the existing
 * one instead of opening a second charge. That - not a client key - is what
 * makes a double tap safe, so the client sends no idempotency key at all.
 */
export interface PaymentSession {
  orderId: string;
  orderNumber: string;
  /** Provider-issued id, presented to the verify endpoint. */
  paymentId: string;
  amount: number;
  currency: string;
  status: 'PENDING';
  provider: string;
  /** True while the provider moves no money. Used to label the pay button. */
  simulated: boolean;
}

export interface CreateOrderRequest {
  /**
   * The scanned QR hash. The seat is derived from this, nothing else.
   *
   * This object is `.strict()`-validated server-side, so a stray field such as a
   * price is a 400 rather than a silently ignored key. Only these two keys.
   */
  hash: string;
  /** Item id + quantity only. Never price, never seat. */
  items: Array<{ itemId: string; quantity: number }>;
}

/** `POST /api/orders/:id/payments/verify` - verified server-side result. */
export interface VerifyPaymentResponse {
  order: Order;
  /**
   * Plaintext delivery PIN.
   *
   * Issued exactly once, on the response that actually completes the order. The
   * server keeps only a scrypt hash, so a repeat call returns
   * `alreadyCompleted: true` with no PIN. The client MUST persist this value -
   * it is the only time it will ever exist outside the scrypt hash.
   */
  verificationPin?: string;
  /** True when the call found the order already paid and returned it as-is. */
  alreadyCompleted: boolean;
}

/** `GET /api/banners` - promotional banners for the carousel. */
export interface PromoBanner {
  id: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  price?: number;
  productId?: string;
  active: boolean;
  displayOrder: number;
}
