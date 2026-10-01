import { memo } from 'react';
import type { MenuItem } from '@/api/types';
import { formatUnitPrice } from '@/lib/format';
import { QuantityControl } from './QuantityControl';

interface MenuItemCardProps {
  item: MenuItem;
  quantity: number;
  onAdd: (item: MenuItem) => void;
  onIncrease: (itemId: string) => void;
  onDecrease: (itemId: string) => void;
  onPress?: (item: MenuItem) => void;
  disabled?: boolean;
}

/**
 * One row of the menu.
 *
 * A vertical list, not a grid: a customer scanning ten items in a dark room
 * reads down a single column far faster than across a mosaic. The row shows
 * exactly the three things that decide an order - name, price, action - and
 * nothing else. Product photography is deliberately omitted here: a customer
 * who needs to see a photo to know what popcorn is will not buy a drink
 * before the film restarts either.
 *
 * The action slot is a fixed width, so the `+` sits precisely where the `+` of
 * a `[− 2 +]` stepper will appear. Adding an item therefore moves nothing -
 * the name and price never re-wrap, and the thumb never has to re-aim.
 *
 * Memoised because a quantity change in one row must not repaint the other
 * nine while the customer is mid-scroll.
 *
 * Tapping the product name/row opens the detail sheet. Tapping `+` quick-adds.
 */
export const MenuItemCard = memo(function MenuItemCard({
  item,
  quantity,
  onAdd,
  onIncrease,
  onDecrease,
  onPress,
  disabled = false,
}: MenuItemCardProps) {
  const handleRowPress = () => {
    if (onPress) onPress(item);
  };

  return (
    <li className="flex items-center gap-3 rounded-2xl border border-white/5 bg-surface/80 p-3">
      {/* Product Image - small, consistent size */}
      {item.imageUrl && (
        <div className="flex shrink-0 w-16 h-16 rounded-xl overflow-hidden bg-surface relative">
          <img
            src={item.imageUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
            draggable={false}
          />
        </div>
      )}

      <div
        className="min-w-0 flex-1"
        onClick={handleRowPress}
        role={onPress ? 'button' : undefined}
        tabIndex={onPress ? 0 : undefined}
        onKeyDown={onPress ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleRowPress(); }} : undefined}
        aria-label={onPress ? `View details for ${item.name}` : undefined}
        style={onPress ? { cursor: 'pointer' } : undefined}
      >
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="min-w-0 truncate text-[15px] font-semibold leading-snug text-ink">
            {item.name}
          </h3>
          <p className="nums shrink-0 text-[15px] font-semibold text-ink">
            {formatUnitPrice(item.price)}
          </p>
        </div>

        {item.description ? (
          <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-ink-muted">
            {item.description}
          </p>
        ) : null}
      </div>

      <div className="flex w-[120px] shrink-0 justify-end">
        <QuantityControl
          quantity={quantity}
          itemName={item.name}
          onIncrease={() => (quantity > 0 ? onIncrease(item.id) : onAdd(item))}
          onDecrease={() => onDecrease(item.id)}
          disabled={disabled}
        />
      </div>
    </li>
  );
});
