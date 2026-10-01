import { useCartStore } from '@/store/cartStore';
import { useOrderSessionStore } from '@/store/orderSessionStore';

/**
 * Zustand stores are module singletons. Without this, state leaks between tests
 * and a "cart disappears when empty" assertion passes or fails depending on
 * which test ran before it.
 */
export function resetTestState(): void {
  useCartStore.setState({ sessionHash: null, items: [] });
  useOrderSessionStore.setState({ confirmed: null, pending: null });
}
