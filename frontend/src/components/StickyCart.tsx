import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { pluralizeItems, formatPaise } from '@/lib/format';
import { MOTION } from '@/lib/constants';
import { selectCartCount, selectCartSubtotal, useCartStore } from '@/store/cartStore';

interface StickyCartProps {
  onOpen: () => void;
  /** Lifts the bar slightly while an order is being submitted. */
  busy?: boolean;
}

/**
 * The floating order bar.
 *
 * Appears only when the cart has something in it - a persistent bar on an empty
 * cart is a dead control in the customer's thumb path. One single button, not a
 * clickable bar with a button inside it: one 44px+ target, no nested controls.
 *
 * `bottom-4` is relative to the safe-area inset, so it clears the iPhone home
 * indicator and Safari's bottom toolbar.
 */
export function StickyCart({ onOpen, busy = false }: StickyCartProps) {
  const items = useCartStore((state) => state.items);
  const count = selectCartCount(items);
  const subtotal = selectCartSubtotal(items);

  const visible = count > 0;

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          key="sticky-cart"
          initial={{ y: 90, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 90, opacity: 0 }}
          transition={MOTION.springy}
          className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4 pb-4"
          style={{ paddingBottom: 'calc(var(--safe-bottom) + 16px)' }}
        >
          <div className="pointer-events-auto mx-auto w-full max-w-[480px]">
            <button
              type="button"
              onClick={onOpen}
              disabled={busy}
              aria-label={`View order: ${pluralizeItems(count)}, total ${formatPaise(subtotal)}. Go to checkout.`}
              className={[
                'flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-surface/90 px-4',
                'h-16 shadow-sheet backdrop-blur-xl',
                'transition-transform duration-100 active:scale-[0.99]',
                'disabled:opacity-60',
              ].join(' ')}
            >
              {/* Keyed so the count springs whenever an item lands. */}
              <motion.span
                key={count}
                initial={{ scale: 1.18 }}
                animate={{ scale: 1 }}
                transition={MOTION.springy}
                className="nums shrink-0 text-[13px] font-medium text-ink-muted"
              >
                {pluralizeItems(count)}
              </motion.span>

              <span className="nums ml-auto shrink-0 text-[17px] font-bold text-ink">
                {formatPaise(subtotal)}
              </span>

              <span
                className={[
                  'flex h-11 shrink-0 items-center gap-1 rounded-xl px-3.5',
                  'text-[13px] font-bold uppercase tracking-[0.06em] text-ink shadow-cta',
                  busy ? 'bg-crimson/50' : 'bg-crimson',
                ].join(' ')}
              >
                {busy ? 'Placing' : 'Checkout'}
                <ChevronRight size={16} strokeWidth={2.5} aria-hidden="true" />
              </span>
            </button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
