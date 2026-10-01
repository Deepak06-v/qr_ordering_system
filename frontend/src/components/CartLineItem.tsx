import { memo } from 'react';
import { Minus, Plus } from 'lucide-react';
import { formatPaise } from '@/lib/format';
import { selectLineTotal, type CartItem } from '@/store/cartStore';

interface CartLineItemProps {
  item: CartItem;
  onIncrease: (itemId: string) => void;
  onDecrease: (itemId: string) => void;
  disabled?: boolean;
}

/**
 * A single line in the cart sheet: what, how many, how much.
 *
 * Stepping down from 1 removes the line, so there is no separate delete button -
 * one fewer control to mis-tap while holding the phone in one hand.
 */
export const CartLineItem = memo(function CartLineItem({
  item,
  onIncrease,
  onDecrease,
  disabled = false,
}: CartLineItemProps) {
  return (
    <li className="flex items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold leading-snug text-ink">{item.name}</p>
        <p className="nums mt-0.5 text-[13px] text-ink-muted">
          {formatPaise(item.price)} each
        </p>
      </div>

      <div
        className="flex h-11 shrink-0 items-center rounded-2xl border border-white/10 bg-surface-raised"
        role="group"
        aria-label={`Quantity for ${item.name}`}
      >
        <button
          type="button"
          onClick={() => onDecrease(item.itemId)}
          disabled={disabled}
          aria-label={item.quantity === 1 ? `Remove ${item.name}` : `Decrease ${item.name}`}
          className="flex h-11 w-11 items-center justify-center text-ink-muted transition-colors duration-150 hover:text-ink active:text-crimson disabled:opacity-40"
        >
          <Minus size={18} strokeWidth={2.5} aria-hidden="true" />
        </button>

        <span
          aria-live="polite"
          aria-atomic="true"
          className="nums w-7 text-center text-sm font-bold text-ink"
        >
          {item.quantity}
        </span>

        <button
          type="button"
          onClick={() => onIncrease(item.itemId)}
          disabled={disabled}
          aria-label={`Increase ${item.name}`}
          className="flex h-11 w-11 items-center justify-center text-ink-muted transition-colors duration-150 hover:text-ink active:text-crimson disabled:opacity-40"
        >
          <Plus size={18} strokeWidth={2.5} aria-hidden="true" />
        </button>
      </div>

      <p className="nums w-16 shrink-0 text-right text-[15px] font-semibold text-ink">
        {formatPaise(selectLineTotal(item))}
      </p>
    </li>
  );
});
