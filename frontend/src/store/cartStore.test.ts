import { beforeEach, describe, expect, it } from 'vitest';
import {
  addItemToList,
  decreaseQuantityInList,
  increaseQuantityInList,
  selectCartCount,
  selectCartSubtotal,
  setQuantityInList,
  useCartStore,
  type CartItem,
} from './cartStore';

const popcorn: CartItem = { itemId: 'm1', name: 'Large Popcorn', price: 35000, quantity: 1 };
const coke: CartItem = { itemId: 'm4', name: 'Coke', price: 15000, quantity: 1 };

describe('cart reducers', () => {
  it('adds a new line at quantity 1', () => {
    expect(addItemToList([], popcorn)).toEqual([popcorn]);
  });

  it('increments an existing line instead of duplicating it', () => {
    const once = addItemToList([], popcorn);
    const twice = addItemToList(once, popcorn);
    expect(twice).toHaveLength(1);
    expect(twice[0]?.quantity).toBe(2);
  });

  it('removes the line when stepping down from 1', () => {
    const once = addItemToList([], popcorn);
    expect(decreaseQuantityInList(once, 'm1')).toEqual([]);
  });

  it('decrements without going below 1', () => {
    const two = [{ ...popcorn, quantity: 2 }];
    expect(decreaseQuantityInList(two, 'm1')[0]?.quantity).toBe(1);
  });

  it('clamps to the per-item ceiling', () => {
    let items: CartItem[] = [{ ...popcorn, quantity: 19 }];
    for (let i = 0; i < 5; i += 1) items = increaseQuantityInList(items, 'm1');
    expect(items[0]?.quantity).toBe(20);
  });

  it('clamps a direct quantity set and treats 0 as removal', () => {
    const one = [{ ...popcorn, quantity: 1 }];
    expect(setQuantityInList(one, 'm1', 999)[0]?.quantity).toBe(20);
    expect(setQuantityInList(one, 'm1', 0)).toEqual([]);
  });

  it('ignores operations on items that are not in the cart', () => {
    expect(decreaseQuantityInList([popcorn], 'nope')).toEqual([popcorn]);
    expect(increaseQuantityInList([popcorn], 'nope')).toEqual([popcorn]);
  });
});

describe('cart selectors', () => {
  it('counts individual items, not lines', () => {
    const items: CartItem[] = [
      { ...popcorn, quantity: 2 },
      { ...coke, quantity: 3 },
    ];
    expect(selectCartCount(items)).toBe(5);
  });

  it('sums the subtotal in paise', () => {
    const items: CartItem[] = [
      { ...popcorn, quantity: 2 },
      { ...coke, quantity: 1 },
    ];
    // 2 x 35000 + 1 x 15000
    expect(selectCartSubtotal(items)).toBe(85000);
  });

  it('is zero for an empty cart', () => {
    expect(selectCartCount([])).toBe(0);
    expect(selectCartSubtotal([])).toBe(0);
  });
});

describe('cart session isolation', () => {
  beforeEach(() => {
    useCartStore.setState({ sessionHash: null, items: [] });
  });

  it('adopts a new sticker without carrying items across', () => {
    const store = useCartStore.getState();
    store.syncSession('hash-one');
    store.addItem(popcorn);
    expect(useCartStore.getState().items).toHaveLength(1);

    useCartStore.getState().syncSession('hash-two');
    expect(useCartStore.getState().items).toEqual([]);
    expect(useCartStore.getState().sessionHash).toBe('hash-two');
  });

  it('is a no-op when the sticker has not changed', () => {
    const store = useCartStore.getState();
    store.syncSession('same-hash');
    store.addItem(popcorn);

    useCartStore.getState().syncSession('same-hash');
    expect(useCartStore.getState().items).toHaveLength(1);
  });
});
