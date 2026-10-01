import { useCallback } from 'react';
import type { MenuItem } from '@/api/types';
import { useCartStore } from '@/store/cartStore';
import { MenuItemCard } from './MenuItemCard';
import { MENU_PANEL_ID } from './CategoryPills';

interface MenuListProps {
  items: MenuItem[];
  activeCategory: string;
  disabled?: boolean;
  onProductPress?: (item: MenuItem) => void;
}

/**
 * The menu, as one vertical list.
 *
 * Each row subscribes to its own quantity rather than receiving the cart, so
 * adding a drink repaints one card instead of the whole list. Handlers are read
 * off the store once and are referentially stable.
 */
export function MenuList({ items, activeCategory, disabled = false, onProductPress }: MenuListProps) {
  const addItem = useCartStore((state) => state.addItem);
  const increaseQuantity = useCartStore((state) => state.increaseQuantity);
  const decreaseQuantity = useCartStore((state) => state.decreaseQuantity);

  const onAdd = useCallback(
    (item: MenuItem) => {
      addItem({ itemId: item.id, name: item.name, price: item.price, ...(item.imageUrl ? { imageUrl: item.imageUrl } : {}) });
    },
    [addItem],
  );

  return (
    <ul
      id={MENU_PANEL_ID}
      role="tabpanel"
      aria-labelledby={`category-tab-${activeCategory}`}
      className="flex flex-col gap-2 px-4 pt-3"
    >
      {items.map((item) => (
        <ConnectedMenuItem
          key={item.id}
          item={item}
          onAdd={onAdd}
          onIncrease={increaseQuantity}
          onDecrease={decreaseQuantity}
          onPress={onProductPress}
          disabled={disabled}
        />
      ))}
    </ul>
  );
}

interface ConnectedMenuItemProps {
  item: MenuItem;
  onAdd: (item: MenuItem) => void;
  onIncrease: (itemId: string) => void;
  onDecrease: (itemId: string) => void;
  onPress?: (item: MenuItem) => void;
  disabled: boolean;
}

function ConnectedMenuItem({
  item,
  onAdd,
  onIncrease,
  onDecrease,
  onPress,
  disabled,
}: ConnectedMenuItemProps) {
  // A primitive selector: the row re-renders only when its own number changes.
  const quantity = useCartStore((state) => selectCartCountFor(state.items, item.id));

  return (
    <MenuItemCard
      item={item}
      quantity={quantity}
      onAdd={onAdd}
      onIncrease={onIncrease}
      onDecrease={onDecrease}
      onPress={onPress}
      disabled={disabled}
    />
  );
}

function selectCartCountFor(
  items: Array<{ itemId: string; quantity: number }>,
  itemId: string,
): number {
  for (const item of items) {
    if (item.itemId === itemId) return item.quantity;
  }
  return 0;
}
