import { useEffect, useRef } from 'react';
import { Loader2, Lock } from 'lucide-react';
import { formatPaise } from '@/lib/format';

interface PaymentButtonProps {
  amount: number;
  loading: boolean;
  onClick: () => void;
  disabled?: boolean;
}

/**
 * The one irreversible action in the whole product.
 *
 * Guarded three ways, because a double tap during intermission must not create
 * two orders: a ref that rejects re-entry synchronously (the `disabled`
 * attribute only takes effect on the *next* render, which is one frame too
 * late for a fast double tap), a disabled state while the request is in flight,
 * and a server-side idempotency key behind both.
 *
 * The label states the amount, so the customer can never be surprised by what
 * they are about to authorise.
 */
export function PaymentButton({ amount, loading, onClick, disabled = false }: PaymentButtonProps) {
  const inFlight = useRef(false);

  // The lock only exists for the duration of one attempt. Without this the
  // customer could not retry after a failed payment.
  useEffect(() => {
    if (!loading) inFlight.current = false;
  }, [loading]);

  function handleClick() {
    if (inFlight.current || loading || disabled) return;
    inFlight.current = true;
    onClick();
  }

  const blocked = loading || disabled;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={blocked}
      aria-busy={loading}
      className={[
        'flex h-[52px] w-full items-center justify-center gap-2',
        'rounded-2xl bg-crimson text-[15px] font-bold uppercase tracking-[0.06em] text-ink',
        'shadow-cta transition-transform duration-100 active:scale-[0.98]',
        'disabled:opacity-60',
      ].join(' ')}
    >
      {loading ? (
        <>
          <Loader2 size={19} strokeWidth={2.5} className="animate-spin" aria-hidden="true" />
          <span>Processing</span>
        </>
      ) : (
        <>
          <Lock size={17} strokeWidth={2.5} aria-hidden="true" />
          <span>Pay {formatPaise(amount)}</span>
        </>
      )}
    </button>
  );
}
