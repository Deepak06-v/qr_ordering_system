import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { MAX_ITEM_QUANTITY } from '@/lib/constants';

export interface CartItem {
  itemId: string;
  name: string;
  /** Integer paise, copied from the menu for display only. Never trusted for payment. */
  price: number;
  quantity: number;
  imageUrl?: string;
}

interface CartState {
  /**
   * The scanned hash this cart belongs to. A cart must never bleed across
   * seats: two people sharing a tablet, or a customer who follows another
   * sticker mid-order, get separate carts.
   */
  sessionHash: string | null;
  items: CartItem[];

  /** Discards anything that belongs to a different sticker. */
  syncSession: (hash: string) => void;
  addItem: (item: Omit<CartItem, 'quantity'>) => void;
  removeItem: (itemId: string) => void;
  increaseQuantity: (itemId: string) => void;
  decreaseQuantity: (itemId: string) => void;
  setQuantity: (itemId: string, quantity: number) => void;
  clearCart: () => void;

  quantityOf: (itemId: string) => number;
}

const STORAGE_KEY = 'mqr:cart:v1';

function clampQuantity(quantity: number): number {
  return Math.max(1, Math.min(MAX_ITEM_QUANTITY, quantity));
}

/**
 * Pure reducers, exported for direct unit testing without mounting the store.
 */
export function addItemToList(items: CartItem[], item: Omit<CartItem, 'quantity'>): CartItem[] {
  const existing = items.find((entry) => entry.itemId === item.itemId);

  if (existing) {
    return items.map((entry) =>
      entry.itemId === item.itemId
        ? { ...entry, quantity: clampQuantity(entry.quantity + 1) }
        : entry,
    );
  }

  return [...items, { ...item, quantity: 1 }];
}

export function decreaseQuantityInList(items: CartItem[], itemId: string): CartItem[] {
  const existing = items.find((entry) => entry.itemId === itemId);
  if (!existing) return items;

  // Stepping down from 1 removes the line, which is what `+` reappearing means.
  if (existing.quantity <= 1) return items.filter((entry) => entry.itemId !== itemId);

  return items.map((entry) =>
    entry.itemId === itemId ? { ...entry, quantity: entry.quantity - 1 } : entry,
  );
}

export function increaseQuantityInList(items: CartItem[], itemId: string): CartItem[] {
  return items.map((entry) =>
    entry.itemId === itemId
      ? { ...entry, quantity: clampQuantity(entry.quantity + 1) }
      : entry,
  );
}

export function setQuantityInList(items: CartItem[], itemId: string, quantity: number): CartItem[] {
  if (quantity <= 0) return items.filter((entry) => entry.itemId !== itemId);
  return items.map((entry) =>
    entry.itemId === itemId ? { ...entry, quantity: clampQuantity(quantity) } : entry,
  );
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      sessionHash: null,
      items: [],

      syncSession: (hash) => {
        if (get().sessionHash === hash) return;
        set({ sessionHash: hash, items: [] });
      },

      addItem: (item) => set((state) => ({ items: addItemToList(state.items, item) })),

      removeItem: (itemId) => set((state) => ({ items: state.items.filter((i) => i.itemId !== itemId) })),

      increaseQuantity: (itemId) =>
        set((state) => ({ items: increaseQuantityInList(state.items, itemId) })),

      decreaseQuantity: (itemId) =>
        set((state) => ({ items: decreaseQuantityInList(state.items, itemId) })),

      setQuantity: (itemId, quantity) =>
        set((state) => ({ items: setQuantityInList(state.items, itemId, quantity) })),

      clearCart: () => set({ items: [] }),

      quantityOf: (itemId) => get().items.find((entry) => entry.itemId === itemId)?.quantity ?? 0,
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      // Only the cart survives a reload. A stale cart is a support call.
      version: 1,
      partialize: (state) => ({ sessionHash: state.sessionHash, items: state.items }),
      merge: (persisted, current) => {
        const saved = persisted as Partial<CartState> | undefined;
        return {
          ...current,
          ...saved,
          items: Array.isArray(saved?.items)
            ? saved.items.filter(
                (item) =>
                  typeof item?.itemId === 'string' &&
                  typeof item?.quantity === 'number' &&
                  item.quantity > 0,
              )
            : [],
        };
      },
    },
  ),
);

/**
 * Derived selectors.
 *
 * These are plain functions over primitive state, so components subscribe to
 * exactly the number they need and a quantity change never re-renders the menu.
 */

/** Total number of individual items - the number in "3 items". */
export function selectCartCount(items: CartItem[]): number {
  let count = 0;
  for (const item of items) count += item.quantity;
  return count;
}

/** Distinct product lines. */
export function selectCartLines(items: CartItem[]): number {
  return items.length;
}

/**
 * Display subtotal in paise.
 *
 * Deliberately client-side and deliberately NOT authoritative: the server
 * recalculates the real total from MongoDB when the order is created, and that
 * number is what the customer pays.
 */
export function selectCartSubtotal(items: CartItem[]): number {
  let subtotal = 0;
  for (const item of items) subtotal += item.price * item.quantity;
  return subtotal;
}

/** Per-line total, for the cart sheet rows. */
export function selectLineTotal(item: CartItem): number {
  return item.price * item.quantity;
}
