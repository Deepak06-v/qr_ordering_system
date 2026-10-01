import { logger } from '../utils/logger';

/**
 * Phase 2 event catalogue. These are the wire contract the KDS client codes
 * against, so they are declared once, here.
 *
 * Note the naming replaces the Phase 1 placeholders (`order:paid`,
 * `order:status`), which were never emitted by anything.
 */
export const SOCKET_EVENTS = {
  /** server -> theater room: an order was paid and is now the kitchen's problem. */
  ORDER_NEW: 'order:new',
  /** server -> theater room: an order's status or items changed. */
  ORDER_UPDATED: 'order:updated',
  /** server -> theater room: an order was cancelled. */
  ORDER_CANCELLED: 'order:cancelled',

  /** client -> server: staff join the room for one theater's KDS. */
  KDS_JOIN: 'kds:join',
  /** server -> client: room membership ack. */
  KDS_JOINED: 'kds:joined',
  /** server -> client: the join was refused. */
  KDS_JOIN_FAILED: 'kds:join-failed',
} as const;

/**
 * Room for every order event belonging to one theater. Emitting here rather
 * than globally is what keeps one cinema's tickets off another's screen.
 */
export const theaterRoom = (theaterId: string): string => `theater:${theaterId}`;

/**
 * The narrow slice of Socket.io the rest of the app is allowed to touch.
 * Depending on this instead of the concrete server is what lets the order
 * service be tested with no network listener at all.
 */
export interface RealtimePublisher {
  emitToTheater(theaterId: string, event: string, payload: unknown): void;
}

let publisher: RealtimePublisher | null = null;

/** Called once at boot by `initRealtime`. */
export function setRealtimePublisher(next: RealtimePublisher | null): void {
  publisher = next;
}

export function getRealtimePublisher(): RealtimePublisher | null {
  return publisher;
}

function emitToTheater(theaterId: string, event: string, payload: unknown): void {
  if (!publisher) {
    // Reached in unit tests and in any entry point that never started the HTTP
    // server. Losing a realtime notification must never fail the order.
    logger.debug('Realtime publisher not attached, skipping emit', { event });
    return;
  }
  publisher.emitToTheater(theaterId, event, payload);
}

/** Shape shared by every order event, so a KDS client can render one component. */
export interface OrderEventPayload {
  orderId: string;
  orderNumber: string;
  theaterId: string;
  screenNumber: number;
  seatNumber: string;
  items: Array<{ name: string; quantity: number; price: number }>;
  totalAmount: number;
  status: string;
  createdAt: Date;
  /**
   * Present ONLY on `order:new`. Staff need the PIN to complete delivery, and
   * this event goes to the theater's KDS room - never to a customer response and
   * never to a log.
   */
  verificationPin?: string;
}

export function emitOrderNew(payload: OrderEventPayload): void {
  emitToTheater(payload.theaterId, SOCKET_EVENTS.ORDER_NEW, payload);
}

/**
 * The PIN is only ever needed for the initial ticket, so it is stripped from
 * every later event. Enforced here rather than left to call-site discipline:
 * `toEventPayload` happens not to pass one, but a future caller could, and
 * re-broadcasting a delivery PIN to a screen that already has it is exactly the
 * kind of leak that is cheap to prevent and awkward to notice later.
 */
function withoutPin(payload: OrderEventPayload): OrderEventPayload {
  const { verificationPin: _pin, ...rest } = payload;
  return rest;
}

export function emitOrderUpdated(payload: OrderEventPayload): void {
  emitToTheater(payload.theaterId, SOCKET_EVENTS.ORDER_UPDATED, withoutPin(payload));
}

export function emitOrderCancelled(payload: OrderEventPayload): void {
  emitToTheater(payload.theaterId, SOCKET_EVENTS.ORDER_CANCELLED, withoutPin(payload));
}
