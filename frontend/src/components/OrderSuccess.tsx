import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { formatPaise, seatSentence } from '@/lib/format';
import { MOTION } from '@/lib/constants';
import type { ConfirmedOrder } from '@/store/orderSessionStore';
import { ConfirmedMark, OrderStatus } from './OrderStatus';
import { VerificationPin } from './VerificationPin';

interface OrderSuccessProps {
  order: ConfirmedOrder;
  onOrderMore: () => void;
}

/**
 * The screen the customer keeps open until the food arrives.
 *
 * Full-bleed OLED black, so it is the least light-emitting surface in the
 * product. The PIN dominates; status is secondary; and the customer is NOT
 * bounced back to the menu - ordering more is offered quietly at the bottom, in
 * case the film has a long act two.
 *
 * Renders entirely from the locally persisted order, so a refresh, a back
 * swipe or a dropped connection in a basement auditorium cannot lose the PIN.
 */
export function OrderSuccess({ order, onOrderMore }: OrderSuccessProps) {
  return (
    <div
      className="flex min-h-[100dvh] flex-col bg-canvas px-5 pb-6"
      style={{ paddingTop: 'calc(var(--safe-top) + 40px)', paddingBottom: 'calc(var(--safe-bottom) + 24px)' }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: MOTION.base, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-1 flex-col items-center"
      >
        <ConfirmedMark />

        <h1 className="pt-5 text-center text-[22px] font-bold leading-tight text-ink">
          Order confirmed
        </h1>
        <p className="pt-1.5 text-center text-[14px] leading-snug text-ink-muted">
          {order.theaterName} is preparing your food.
        </p>

        <div className="w-full max-w-sm pt-7">
          <VerificationPin pin={order.pin} />
        </div>

        <p className="pt-4 text-center text-[14px] leading-relaxed text-ink-muted">
          Show this PIN when your order arrives.
        </p>

        {/*
          The order number is what staff ask for at the counter, so it has to be
          on the screen the customer is already looking at - not behind a
          receipt they never got.
        */}
        <p className="mt-3 text-center text-[13px] text-ink-faint">
          Order{' '}
          <span className="nums font-semibold tracking-wide text-ink-muted">{order.orderNumber}</span>
        </p>

        <div className="w-full max-w-sm pt-7">
          <div className="rounded-2xl border border-white/5 bg-surface/60 px-4 py-3.5">
            <OrderStatus status={order.status} />
          </div>
        </div>
      </motion.div>

      <div className="mx-auto w-full max-w-sm">
        <dl className="flex items-center justify-between gap-3 pb-3 text-[13px]">
          <div className="min-w-0">
            <dt className="text-ink-faint">{seatSentence(order.seatNumber, order.screenNumber)}</dt>
            <dd className="nums mt-0.5 truncate text-ink-muted">
              {order.items.reduce((sum, item) => sum + item.quantity, 0)} items •{' '}
              {formatPaise(order.totalAmount)}
            </dd>
          </div>
        </dl>

        <button
          type="button"
          onClick={onOrderMore}
          className="flex h-11 w-full items-center justify-center gap-1.5 rounded-2xl text-[13px] font-semibold text-ink-faint transition-colors duration-150 hover:text-ink-muted"
        >
          <Plus size={16} strokeWidth={2.5} aria-hidden="true" />
          Order something else
        </button>
      </div>
    </div>
  );
}
