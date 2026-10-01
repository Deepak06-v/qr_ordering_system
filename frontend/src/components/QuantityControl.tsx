import { motion } from 'framer-motion';
import { Minus, Plus } from 'lucide-react';
import { MAX_ITEM_QUANTITY, MOTION } from '@/lib/constants';

interface QuantityControlProps {
  quantity: number;
  itemName: string;
  onIncrease: () => void;
  onDecrease: () => void;
  /** Blocks input while the order is being submitted. */
  disabled?: boolean;
}

/** 44px square: the smallest reliably hittable target for a thumb. */
const stepClass =
  'flex h-11 w-11 items-center justify-center text-ink-muted ' +
  'transition-colors duration-150 ease-swift hover:text-ink active:text-crimson';

/**
 * `[+]` until the item is in the cart, then `[− 2 +]` in the same place.
 *
 * The control REPLACES the add button rather than appearing alongside it, so
 * the card never reflows and the customer's thumb never has to re-aim. The
 * height is identical in both states, which is what makes the swap invisible.
 */
export function QuantityControl({
  quantity,
  itemName,
  onIncrease,
  onDecrease,
  disabled = false,
}: QuantityControlProps) {
  if (quantity <= 0) {
    return (
      <motion.button
        type="button"
        onClick={onIncrease}
        disabled={disabled}
        whileTap={{ scale: 0.94 }}
        transition={MOTION.springy}
        aria-label={`Add ${itemName} to order`}
        className="flex h-11 w-11 items-center justify-center rounded-2xl bg-crimson text-ink shadow-cta transition-transform duration-100 active:scale-[0.98] disabled:opacity-40"
      >
        <Plus size={20} strokeWidth={2.5} aria-hidden="true" />
      </motion.button>
    );
  }

  const atCeiling = quantity >= MAX_ITEM_QUANTITY;

  return (
    <div
      className="flex h-11 items-center rounded-2xl border border-white/10 bg-surface-raised"
      role="group"
      aria-label={`Quantity for ${itemName}`}
    >
      <motion.button
        type="button"
        onClick={onDecrease}
        disabled={disabled}
        whileTap={{ scale: 0.9 }}
        transition={MOTION.springy}
        aria-label={quantity === 1 ? `Remove ${itemName} from order` : `Decrease ${itemName}`}
        className={stepClass}
      >
        <Minus size={18} strokeWidth={2.5} aria-hidden="true" />
      </motion.button>

      {/* Keyed so the count re-mounts and springs on every change; aria-live
          makes the new number audible without a separate live region. */}
      <motion.span
        key={quantity}
        initial={{ scale: 0.72, opacity: 0.5 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={MOTION.springy}
        aria-live="polite"
        aria-atomic="true"
        className="nums w-7 text-center text-sm font-bold text-ink"
      >
        {quantity}
      </motion.span>

      <motion.button
        type="button"
        onClick={onIncrease}
        disabled={disabled || atCeiling}
        whileTap={{ scale: 0.9 }}
        transition={MOTION.springy}
        aria-label={`Increase ${itemName}`}
        className={`${stepClass} disabled:opacity-40`}
      >
        <Plus size={18} strokeWidth={2.5} aria-hidden="true" />
      </motion.button>
    </div>
  );
}
