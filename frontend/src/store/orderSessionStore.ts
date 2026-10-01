import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { OrderLine, OrderStatus } from '@/api/types';

/**
 * A confirmed order, kept locally so the customer never loses their delivery
 * PIN to a refresh, a back-swipe or a dropped connection in a basement
 * auditorium. The server holds only a scrypt hash of the PIN, so this local
 * copy is the only place the plaintext can ever live.
 */
export interface ConfirmedOrder {
  orderId: string;
  /** Staff-facing reference, e.g. `FM-1042`. */
  orderNumber: string;
  hash: string;
  theaterName: string;
  screenNumber: number;
  seatNumber: string;
  /** Integer paise, from the verified server response. */
  totalAmount: number;
  items: OrderLine[];
  status: OrderStatus;
  /** 4 digits, plain text. Shown until the order is delivered. */
  pin: string;
  confirmedAt: string;
}

/**
 * An order created but not yet verified as paid.
 *
 * The server protects against a double charge on its own: `createPayment` is
 * idempotent per order and `verifyPayment` returns `alreadyCompleted` instead of
 * re-running. What the server cannot do is stop us forgetting an order id it
 * already handed out, so the ids are persisted and a retry resumes rather than
 * restarts.
 *
 * The one gap this cannot close is a lost response to `POST /api/orders`: if we
 * never learn the new order's id we cannot reuse it. The blast radius there is
 * bounded - the orphaned order stays `PENDING_PAYMENT`, is never charged, and
 * is never announced to the kitchen, because `order:new` fires only on payment
 * verification. No money moves and no second PIN exists.
 */
export interface PendingPayment {
  hash: string;
  /** Identifies exactly what was being bought when this attempt started. */
  fingerprint: string;
  /** Known after step 1. Reused on retry so no second order is created. */
  orderId?: string;
  /** Known after step 2. Reused on retry so no second charge is opened. */
  paymentId?: string;
}

interface OrderSessionState {
  confirmed: ConfirmedOrder | null;
  pending: PendingPayment | null;

  /**
   * Starts (or resumes) an attempt for this basket and returns whatever the
   * server already issued, so the caller can skip the steps already done.
   */
  beginAttempt: (params: { hash: string; fingerprint: string }) => PendingPayment;
  /** Attaches the server-issued order id. */
  recordOrderId: (orderId: string) => void;
  /** Attaches the provider payment id to present for verification. */
  recordPaymentId: (paymentId: string) => void;
  confirmPayment: (order: ConfirmedOrder) => void;
  setStatus: (status: OrderStatus) => void;
  /** Returns the customer to an empty cart for a new order. */
  startNewOrder: () => void;
  /** Discards a failed/unverified attempt so the customer can try again cleanly. */
  abandonPayment: () => void;
}

const STORAGE_KEY = 'mqr:order:v1';

export const useOrderSessionStore = create<OrderSessionState>()(
  persist(
    (set, get) => ({
      confirmed: null,
      pending: null,

      beginAttempt: ({ hash, fingerprint }) => {
        const pending = get().pending;

        // Same sticker, same basket -> resume the attempt already in flight.
        if (pending && pending.hash === hash && pending.fingerprint === fingerprint) {
          return pending;
        }

        // The basket changed, so this is a genuinely different order.
        const fresh: PendingPayment = { hash, fingerprint };
        set({ pending: fresh });
        return fresh;
      },

      recordOrderId: (orderId) =>
        set((state) => (state.pending ? { pending: { ...state.pending, orderId } } : state)),

      recordPaymentId: (paymentId) =>
        set((state) =>
          state.pending ? { pending: { ...state.pending, paymentId } } : state,
        ),

      confirmPayment: (order) =>
        set((state) => ({
          confirmed: order,
          // Verified: the attempt is spent and must not be retried.
          pending: state.pending?.orderId === order.orderId ? null : state.pending,
        })),

      setStatus: (status) =>
        set((state) => (state.confirmed ? { confirmed: { ...state.confirmed, status } } : state)),

      startNewOrder: () => set({ confirmed: null, pending: null }),

      abandonPayment: () => set({ pending: null }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      version: 1,
      partialize: (state) => ({ confirmed: state.confirmed, pending: state.pending }),
      merge: (persisted, current) => {
        const saved = persisted as Partial<OrderSessionState> | undefined;
        const confirmed = saved?.confirmed ?? null;

        // A corrupt or partial record is worse than none: it would render a
        // broken confirmation screen the customer cannot escape.
        const validConfirmed =
          confirmed &&
          typeof confirmed.orderId === 'string' &&
          typeof confirmed.pin === 'string' &&
          /^\d{4}$/.test(confirmed.pin)
            ? confirmed
            : null;

        return { ...current, confirmed: validConfirmed, pending: saved?.pending ?? null };
      },
    },
  ),
);

/** Stable identity of a basket, so payment retries can detect "same order". */
export function cartFingerprint(items: Array<{ itemId: string; quantity: number }>): string {
  return items
    .map((item) => `${item.itemId}x${item.quantity}`)
    .sort()
    .join('|');
}
