import { http, HttpResponse } from 'msw';
import {
  menu,
  order,
  OTHER_HASH,
  payment,
  PIN,
  seat,
  THEATER_ID,
  VALID_HASH,
  verified,
} from './fixtures';

/** Mirrors the backend's `{ success, data }` / `{ success, error }` envelope. */
const ok = <T,>(data: T) => HttpResponse.json({ success: true, data });

const fail = (status: number, code: string, message: string) =>
  HttpResponse.json({ success: false, error: { code, message } }, { status });

const OBJECT_ID = /^[0-9a-f]{24}$/i;

export const handlers = [
  /* ------------------------------ seat resolution ----------------------------- */

  http.get('/api/seat-hashes/:hash', ({ params }) => {
    if (params.hash === VALID_HASH) return ok(seat);
    if (params.hash === OTHER_HASH) return fail(404, 'QR_NOT_FOUND', 'QR code not found');

    // Everything else is a known-but-retired sticker.
    return fail(410, 'QR_INACTIVE', 'This QR code is no longer active.');
  }),

  /* ----------------------------------- menu ---------------------------------- */

  http.get('/api/menu/:theaterId', ({ params }) => {
    if (params.theaterId !== THEATER_ID) return fail(404, 'THEATER_NOT_FOUND', 'Not found');
    return ok(menu);
  }),

  /* ---------------------------------- orders --------------------------------- */

  /**
   * The server body is `.strict()` and rejects unknown keys, so this mock does
   * too. That turns "the client must not send a price" from a comment into a
   * test that actually fails if someone adds one.
   */
  http.post('/api/orders', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;

    const extra = Object.keys(body).filter((key) => key !== 'hash' && key !== 'items');
    if (extra.length > 0) {
      return fail(400, 'VALIDATION_ERROR', `Unrecognized key(s) in object: ${extra.join(', ')}`);
    }

    const hash = body.hash;
    if (hash !== VALID_HASH) return fail(404, 'QR_NOT_FOUND', 'QR code not found');

    const items = body.items as Array<{ itemId: string; quantity: number }> | undefined;
    if (!Array.isArray(items) || items.length === 0) {
      return fail(400, 'VALIDATION_ERROR', 'An order must contain at least one item');
    }
    for (const line of items) {
      if (!line || !OBJECT_ID.test(line.itemId)) {
        return fail(400, 'VALIDATION_ERROR', 'Must be a valid MongoDB ObjectId');
      }
      if (line.quantity > 20) return fail(400, 'VALIDATION_ERROR', 'Quantity per item is capped at 20');
    }

    // 201, and the order comes back in PENDING_PAYMENT with no PIN.
    return HttpResponse.json({ success: true, data: { ...order, status: 'PENDING_PAYMENT', paymentStatus: 'PENDING' } }, { status: 201 });
  }),

  http.post('/api/orders/:id/payments', ({ params }) => {
    if (params.id !== order.orderId) return fail(404, 'ORDER_NOT_FOUND', 'Order not found');
    return HttpResponse.json({ success: true, data: payment }, { status: 201 });
  }),

  http.post('/api/orders/:id/payments/verify', async ({ params, request }) => {
    if (params.id !== order.orderId) return fail(404, 'ORDER_NOT_FOUND', 'Order not found');

    const body = (await request.json()) as Record<string, unknown>;
    const extra = Object.keys(body).filter((key) => key !== 'paymentId');
    if (extra.length > 0) {
      return fail(400, 'VALIDATION_ERROR', `Unrecognized key(s) in object: ${extra.join(', ')}`);
    }
    if (body.paymentId !== payment.paymentId) {
      return fail(404, 'PAYMENT_NOT_FOUND', 'Payment not found');
    }

    // The one and only response that carries a plaintext PIN.
    return ok(verified);
  }),

  http.get('/api/orders/:id', ({ params }) => {
    if (params.id !== order.orderId) return fail(404, 'ORDER_NOT_FOUND', 'Order not found');
    // Never the PIN: `getOrderById` has no plaintext to return.
    return ok(order);
  }),
];

export { fail, ok, PIN };