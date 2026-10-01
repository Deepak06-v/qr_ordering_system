import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, TriangleAlert } from 'lucide-react';
import { ApiError } from '@/api/client';
import { createOrder, createPayment, verifyPayment } from '@/api/endpoints';
import type { ResolvedSeat } from '@/api/types';
import { MAX_CART_ITEMS } from '@/lib/constants';
import { cartFingerprint, useOrderSessionStore } from '@/store/orderSessionStore';
import { selectCartCount, selectCartSubtotal, useCartStore } from '@/store/cartStore';
import { BottomSheet } from './BottomSheet';
import { CartLineItem } from './CartLineItem';
import { CheckoutSummary } from './CheckoutSummary';
import { PaymentButton } from './PaymentButton';

type Step = 'cart' | 'checkout';

interface CartSheetProps {
  open: boolean;
  onClose: () => void;
  seat: ResolvedSeat;
}

interface PaymentFailure {
  title: string;
  message: string;
}

/**
 * Review and pay, in one bottom sheet.
 *
 * Deliberately not two pages. The customer opens the cart, glances at the
 * total, taps pay - no navigation, no back button, nothing to lose their place
 * in. `Cart` and `Checkout` are steps inside the same surface.
 */
export function CartSheet({ open, onClose, seat }: CartSheetProps) {
  const [step, setStep] = useState<Step>('cart');
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<PaymentFailure | null>(null);

  const items = useCartStore((state) => state.items);
  const increaseQuantity = useCartStore((state) => state.increaseQuantity);
  const decreaseQuantity = useCartStore((state) => state.decreaseQuantity);
  const clearCart = useCartStore((state) => state.clearCart);

  const beginAttempt = useOrderSessionStore((state) => state.beginAttempt);
  const recordOrderId = useOrderSessionStore((state) => state.recordOrderId);
  const recordPaymentId = useOrderSessionStore((state) => state.recordPaymentId);
  const confirmPayment = useOrderSessionStore((state) => state.confirmPayment);
  const abandonPayment = useOrderSessionStore((state) => state.abandonPayment);

  const count = selectCartCount(items);
  const subtotal = selectCartSubtotal(items);
  const inFlight = useRef(false);

  // Reopening always starts at the top: the customer came to check the cart.
  useEffect(() => {
    if (open) {
      setStep('cart');
      setFailure(null);
      inFlight.current = false;
    }
  }, [open]);

  // The cart emptied under us (last item removed from the list). Nothing to pay for.
  useEffect(() => {
    if (open && items.length === 0) onClose();
  }, [open, items.length, onClose]);

  const pay = useCallback(async () => {
    if (inFlight.current || items.length === 0) return;
    inFlight.current = true;
    setSubmitting(true);
    setFailure(null);

    // Resumed rather than reset: if a previous attempt already got as far as an
    // order or a payment, this retry reuses them instead of creating a second
    // one. This is the only protection against a lost `POST /api/orders`
    // response, which the server has no way to detect.
    const attempt = beginAttempt({ hash: seat.hash, fingerprint: cartFingerprint(items) });

    try {
      // Step 1 - create the order. Skipped when we already hold an order id.
      let orderId = attempt.orderId;
      if (!orderId) {
        const created = await createOrder({
          hash: seat.hash,
          items: items.map((item) => ({ itemId: item.itemId, quantity: item.quantity })),
        });
        orderId = created.orderId;
        recordOrderId(orderId);
      }

      // Step 2 - open the charge. Idempotent server-side, so re-calling it
      // after a timeout returns the in-flight payment rather than a second one.
      const payment = await createPayment(orderId);
      recordPaymentId(payment.paymentId);

      // Step 3 - verification. The browser cannot assert that money moved; only
      // this response can, and it carries the one and only plaintext PIN.
      const verified = await verifyPayment(orderId, payment.paymentId);

      if (verified.alreadyCompleted && !verified.verificationPin) {
        // The order was already paid - by an earlier attempt whose response we
        // never saw. There is no PIN to show and none can be reissued, so the
        // honest thing is to tell the customer rather than render a broken PIN.
        throw new AlreadyPaidError();
      }

      confirmPayment({
        orderId: verified.order.orderId,
        orderNumber: verified.order.orderNumber,
        hash: seat.hash,
        theaterName: seat.theater.name,
        screenNumber: verified.order.screenNumber,
        seatNumber: verified.order.seatNumber,
        totalAmount: verified.order.totalAmount,
        items: verified.order.items,
        status: verified.order.status,
        pin: verified.verificationPin ?? '',
        confirmedAt: new Date().toISOString(),
      });

      clearCart();
      onClose();
    } catch (error) {
      inFlight.current = false;
      // Only forget the attempt when the server definitively refused it. On a
      // timeout or a dropped connection the order may well exist server-side,
      // so the ids MUST survive for the retry - replaying them is what stops a
      // reconnection from becoming a second order.
      if (isDefinitivelyRejected(error)) abandonPayment();

      setSubmitting(false);
      setFailure(toPaymentFailure(error));
    }
  }, [
    items,
    seat.hash,
    seat.theater.name,
    beginAttempt,
    recordOrderId,
    recordPaymentId,
    confirmPayment,
    abandonPayment,
    clearCart,
    onClose,
  ]);

  return (
    <BottomSheet open={open} onClose={onClose} title={step === 'cart' ? 'Your order' : 'Checkout'}>
      {step === 'cart' ? (
        <div className="pb-4">
          <ul className="divide-y divide-white/5">
            {items.map((item) => (
              <CartLineItem
                key={item.itemId}
                item={item}
                onIncrease={increaseQuantity}
                onDecrease={decreaseQuantity}
                disabled={submitting}
              />
            ))}
          </ul>

          <button
            type="button"
            onClick={() => setStep('checkout')}
            className="mt-4 flex h-[52px] w-full items-center justify-center rounded-2xl bg-crimson text-[15px] font-bold uppercase tracking-[0.06em] text-ink shadow-cta transition-transform duration-100 active:scale-[0.98]"
          >
            Proceed to checkout
          </button>
        </div>
      ) : (
        <div className="pb-4">
          <button
            type="button"
            onClick={() => setStep('cart')}
            disabled={submitting}
            className="-ml-2 mb-2 flex h-11 items-center gap-1.5 rounded-2xl px-2 text-[13px] font-semibold text-ink-muted transition-colors duration-150 hover:text-ink disabled:opacity-40"
          >
            <ArrowLeft size={18} strokeWidth={2.25} aria-hidden="true" />
            Edit order
          </button>

          <CheckoutSummary
            items={items}
            subtotal={subtotal}
            seatNumber={seat.seatNumber}
            screenNumber={seat.screenNumber}
          />

          {failure ? <PaymentErrorNotice failure={failure} /> : null}

          <PaymentButton
            amount={subtotal}
            loading={submitting}
            onClick={() => void pay()}
            disabled={count === 0}
          />

          <p className="pt-3 text-center text-[12px] leading-snug text-ink-faint">
            Your PIN is shown only after the payment is confirmed.
          </p>
        </div>
      )}
    </BottomSheet>
  );
}

function PaymentErrorNotice({ failure }: { failure: PaymentFailure }) {
  return (
    <div
      role="alert"
      className="mb-3 flex items-start gap-2.5 rounded-2xl border border-crimson/25 bg-crimson/[0.07] px-3.5 py-3"
    >
      <TriangleAlert
        size={18}
        strokeWidth={2}
        className="mt-0.5 shrink-0 text-crimson"
        aria-hidden="true"
      />
      <div className="min-w-0">
        <p className="text-[14px] font-semibold text-ink">{failure.title}</p>
        <p className="mt-0.5 text-[13px] leading-snug text-ink-muted">{failure.message}</p>
      </div>
    </div>
  );
}

/**
 * Raised when the server reports the order is already paid but returns no PIN.
 *
 * Only one response in the order's whole life carries the plaintext PIN, and it
 * has clearly already been spent - by an earlier attempt whose response we lost.
 * The customer must be told, because the PIN they need for collection cannot be
 * reissued without voiding the copy the kitchen is already holding.
 */
class AlreadyPaidError extends Error {
  constructor() {
    super('Order already paid; no PIN is available');
    this.name = 'AlreadyPaidError';
  }
}

/**
 * True only when the server is certain no order was created.
 *
 * A 4xx means the request was rejected outright, so a retry from scratch is
 * safe and gives the customer a clean slate. Everything else - timeout, network
 * failure, 5xx, 408, 429 - leaves the outcome unknown, and the ids already
 * issued have to be preserved so the retry resumes instead of duplicating.
 */
function isDefinitivelyRejected(error: unknown): boolean {
  if (!(error instanceof ApiError) || error.kind !== 'http') return false;
  const status = error.status ?? 0;
  if (status === 408 || status === 429) return false;
  return status >= 400 && status < 500;
}

/**
 * Maps a failure to customer copy.
 *
 * Deliberately never surfaces `error.message` from the server: it is written
 * for developers. If the basket is larger than the venue will accept, the
 * customer is told what to do, not what the API rejected.
 */
function toPaymentFailure(error: unknown): PaymentFailure {
  if (error instanceof AlreadyPaidError) {
    return {
      title: 'This order is already paid.',
      message: 'Your PIN was shown on the earlier confirmation. Please show a member of staff.',
    };
  }

  if (error instanceof ApiError) {
    if (error.isQrInactive) {
      return {
        title: 'This QR code is no longer active.',
        message: 'Please ask a member of staff for a new code.',
      };
    }

    if (error.code === 'MENU_ITEM_UNAVAILABLE' || error.code === 'MENU_ITEM_NOT_FOUND') {
      return {
        title: 'Some items just sold out.',
        message: 'Please review your order and remove them to continue.',
      };
    }

    if (error.code === 'CART_TOO_LARGE') {
      return {
        title: 'That order is larger than we can take.',
        message: `Please keep it to ${MAX_CART_ITEMS} items or fewer.`,
      };
    }

    if (error.code === 'ORDER_ALREADY_PAID') {
      return {
        title: 'This order is already paid.',
        message: 'Please show a member of staff.',
      };
    }

    if (error.isRetryable) {
      return { title: 'Connection lost.', message: 'Check your signal and tap pay again.' };
    }
  }

  return { title: "We couldn't start your payment.", message: 'Please try again.' };
}
