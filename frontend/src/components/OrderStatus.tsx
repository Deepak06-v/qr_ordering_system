import { Check } from 'lucide-react';
import { ORDER_STATUS_SEQUENCE, orderStatusCopy } from '@/lib/constants';
import type { OrderStatus } from '@/api/types';

interface OrderStatusProps {
  status: OrderStatus;
}

/**
 * Fulfilment progress, secondary to the PIN.
 *
 * Rendered as a labelled progress bar rather than a bare colour change, so the
 * state is legible without relying on hue - and legible to a screen reader via
 * the text that accompanies it.
 */
export function OrderStatus({ status }: OrderStatusProps) {
  if (status === 'CANCELLED') {
    return (
      <p className="text-center text-[13px] font-semibold text-crimson">
        {orderStatusCopy(status).customer}
      </p>
    );
  }

  const currentIndex = ORDER_STATUS_SEQUENCE.indexOf(status);
  const reached = currentIndex < 0 ? 0 : currentIndex;
  const percent = ((reached + 1) / ORDER_STATUS_SEQUENCE.length) * 100;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[13px] font-semibold text-ink">
          {orderStatusCopy(status).customer}
        </p>
        <p className="nums shrink-0 text-[12px] text-ink-faint">
          {reached + 1}/{ORDER_STATUS_SEQUENCE.length}
        </p>
      </div>

      <div
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={ORDER_STATUS_SEQUENCE.length}
        aria-valuenow={reached + 1}
        aria-valuetext={orderStatusCopy(status).customer}
        className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/10"
      >
        <div
          className="h-full rounded-full bg-crimson transition-[width] duration-300 ease-swift"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

/** Small confirmation tick above the headline. */
export function ConfirmedMark() {
  return (
    <span
      className="flex h-14 w-14 items-center justify-center rounded-full border border-crimson/25 bg-crimson/10"
      aria-hidden="true"
    >
      <Check size={26} strokeWidth={2.75} className="text-crimson" />
    </span>
  );
}
