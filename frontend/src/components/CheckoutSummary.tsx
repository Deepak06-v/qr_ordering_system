import { MapPin } from 'lucide-react';
import { formatPaise, seatSentence } from '@/lib/format';
import type { CartItem } from '@/store/cartStore';

interface CheckoutSummaryProps {
  items: CartItem[];
  subtotal: number;
  seatNumber: string;
  screenNumber: number;
}

/**
 * The order, and where it is going.
 *
 * Two rules that cannot bend:
 *  1. The seat is printed as read-only text. There is no field to focus, so
 *     there is nothing to edit, autocomplete or tamper with.
 *  2. No name, phone, email or delivery notes. This is seat delivery - the
 *     theatre already knows exactly where the food is going.
 */
export function CheckoutSummary({
  items,
  subtotal,
  seatNumber,
  screenNumber,
}: CheckoutSummaryProps) {
  return (
    <div className="pb-4">
      <h3 className="pb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
        Your order
      </h3>

      <ul className="divide-y divide-white/5">
        {items.map((item) => (
          <li
            key={item.itemId}
            className="flex items-baseline justify-between gap-3 py-2.5 text-[15px]"
          >
            <span className="min-w-0 truncate text-ink-muted">
              <span className="nums mr-1.5 font-semibold text-ink">{item.quantity}×</span>
              {item.name}
            </span>
            <span className="nums shrink-0 font-medium text-ink">
              {formatPaise(item.price * item.quantity)}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-2 flex items-baseline justify-between border-t border-white/5 pt-3">
        <span className="text-[15px] font-semibold text-ink">Total</span>
        <span className="nums text-xl font-bold text-ink">{formatPaise(subtotal)}</span>
      </div>

      <div className="mt-4 flex items-center gap-2.5 rounded-2xl border border-white/5 bg-canvas/60 px-3.5 py-3">
        <MapPin size={18} strokeWidth={2} className="shrink-0 text-crimson" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
            Delivering to
          </p>
          {/* Read-only by construction: this is a <p>, not an input. */}
          <p className="truncate text-[15px] font-semibold text-ink">
            {seatSentence(seatNumber, screenNumber)}
          </p>
        </div>
      </div>
    </div>
  );
}
