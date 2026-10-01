import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AppHeader } from '@/components/AppHeader';
import { CartSheet } from '@/components/CartSheet';
import { CategoryPills } from '@/components/CategoryPills';
import { ErrorState } from '@/components/ErrorState';
import { LoadingSkeleton } from '@/components/LoadingSkeleton';
import { MenuList } from '@/components/MenuList';
import { OrderSuccess } from '@/components/OrderSuccess';
import { ProductDetailSheet } from '@/components/ProductDetailSheet';
import { PromoCarousel } from '@/components/PromoCarousel';
import { StickyCart } from '@/components/StickyCart';
import type { MenuItem, PromoBanner } from '@/api/types';
import { useMenu, useCategoryFilter } from '@/hooks/useMenu';
import { useOrderStatusPolling } from '@/hooks/useOrderStatusPolling';
import { useSeatSession } from '@/hooks/useSeatSession';
import { selectCartCount, useCartStore } from '@/store/cartStore';
import { useOrderSessionStore } from '@/store/orderSessionStore';
import { getActiveBanners } from '@/lib/mockBanners';

/**
 * Stable empty identity for the loading and error states.
 *
 * A fresh `[]` on every render would make the category filter and the
 * sold-out prune effect re-run forever while the menu loads.
 */
const EMPTY_ITEMS: MenuItem[] = [];

const QR_ERROR_COPY = {
  inactive: {
    title: 'QR code unavailable',
    message: 'This seat QR code is no longer active. Please contact theater staff.',
  },
  unknown: {
    title: 'QR code not recognised',
    message: 'This seat QR code is invalid. Please contact theater staff.',
  },
  invalid: {
    title: 'QR code not recognised',
    message: 'This seat QR code is invalid. Please contact theater staff.',
  },
} as const;

/**
 * The customer ordering experience, one screen per scanned sticker.
 *
 * Everything the customer needs is on this route. There is no login, no
 * account, no seat picker and no checkout form - the hash in the URL is the
 * seat, and the theatre already knows where the food is going.
 */
export function OrderPage() {
  const { hash = '' } = useParams<{ hash: string }>();

  const session = useSeatSession(hash);
  const [cartOpen, setCartOpen] = useState(false);
  const [productSheetOpen, setProductSheetOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<MenuItem | null>(null);

  const cartCount = useCartStore((state) => selectCartCount(state.items));
  const syncSession = useCartStore((state) => state.syncSession);
  const items = useCartStore((state) => state.items);
  const removeItem = useCartStore((state) => state.removeItem);
  const quantityOf = useCartStore((state) => state.quantityOf);

  const confirmed = useOrderSessionStore((state) => state.confirmed);
  const startNewOrder = useOrderSessionStore((state) => state.startNewOrder);

  const handleProductPress = useCallback((item: MenuItem) => {
    setSelectedProduct(item);
    setProductSheetOpen(true);
  }, []);

  const handleAddToCartFromSheet = useCallback(
    (cartItem: { itemId: string; name: string; price: number; imageUrl?: string }, quantity: number) => {
      const addItem = useCartStore.getState().addItem;
      for (let i = 0; i < quantity; i++) {
        addItem(cartItem);
      }
    },
    [],
  );

  // A cart belongs to the sticker that created it. Following a second QR must
  // not carry the first seat's items along.
  useEffect(() => {
    if (session.status === 'ready') syncSession(hash);
  }, [session.status, hash, syncSession]);

  useOrderStatusPolling(confirmed?.hash === hash ? confirmed : null);

  // The confirmation is stored per sticker, so a different seat is a different
  // order and must not inherit this one.
  const activeOrder = confirmed?.hash === hash ? confirmed : null;
  const seatNumber = session.status === 'ready' ? session.seat.seatNumber : undefined;
  const screenNumber = session.status === 'ready' ? session.seat.screenNumber : undefined;

  useEffect(() => {
    if (activeOrder) {
      document.title = `Order confirmed • Seat ${activeOrder.seatNumber}`;
      return;
    }
    if (screenNumber !== undefined) {
      document.title = `Screen ${screenNumber} • Seat ${seatNumber ?? ''}`;
    }
  }, [activeOrder, screenNumber, seatNumber]);

  const onOrderMore = useCallback(() => {
    startNewOrder();
    window.scrollTo({ top: 0 });
  }, [startNewOrder]);

  if (activeOrder) {
    return <OrderSuccess order={activeOrder} onOrderMore={onOrderMore} />;
  }

  if (session.status === 'unavailable') {
    const copy = QR_ERROR_COPY[session.reason];
    return <ErrorState icon="qr" title={copy.title} message={copy.message} />;
  }

  if (session.status === 'error') {
    return (
      <ErrorState
        icon="network"
        title="Couldn't load your seat"
        message="Check your connection and try again."
        actionLabel="Try again"
        onAction={session.retry}
      />
    );
  }

  if (session.status === 'loading') {
    return (
      <div className="min-h-[100dvh] bg-canvas">
        <LoadingSkeleton />
      </div>
    );
  }

  const { seat } = session;
  const banners = getActiveBanners();

  return (
    <div
      className="min-h-[100dvh] bg-canvas"
      // Reserves exactly the space the floating bar occupies, so the last menu
      // card is always reachable.
      style={{ ['--cart-reserve' as string]: cartCount > 0 ? '80px' : '0px' }}
    >
      <AppHeader
        seatNumber={seat.seatNumber}
        screenNumber={seat.screenNumber}
        loadingSeat={false}
      />

      <OrderBody
        theaterId={seat.theaterId}
        cartItemIds={items.map((item) => item.itemId)}
        onPruneItem={removeItem}
        banners={banners}
        onProductPress={handleProductPress}
        onOpenProductSheet={(product) => {
          setSelectedProduct(product);
          setProductSheetOpen(true);
        }}
      />

      <StickyCart onOpen={() => setCartOpen(true)} />
      <CartSheet open={cartOpen} onClose={() => setCartOpen(false)} seat={seat} />

      {selectedProduct && (
        <ProductDetailSheet
          open={productSheetOpen}
          onClose={() => {
            setProductSheetOpen(false);
            setSelectedProduct(null);
          }}
          item={selectedProduct}
          onAddToCart={handleAddToCartFromSheet}
          currentQuantity={quantityOf(selectedProduct.id)}
          disabled={cartOpen}
        />
      )}
    </div>
  );
}

interface OrderBodyProps {
  theaterId: string;
  cartItemIds: string[];
  onPruneItem: (itemId: string) => void;
  banners: PromoBanner[];
  onProductPress: (item: MenuItem) => void;
  onOpenProductSheet: (product: MenuItem) => void;
}

/**
 * Split out so the menu hook only re-runs when the theater changes - not when
 * the cart does.
 */
function OrderBody({
  theaterId,
  cartItemIds,
  onPruneItem,
  banners,
  onProductPress,
  onOpenProductSheet,
}: OrderBodyProps) {
  const menu = useMenu(theaterId);
  const items = menu.status === 'ready' ? menu.items : EMPTY_ITEMS;
  const { active, setActive, visible } = useCategoryFilter(items);

  const handleBannerTap = useCallback(
    (banner: PromoBanner) => {
      if (banner.productId) {
        const product = items.find((item) => item.id === banner.productId);
        if (product) {
          onOpenProductSheet(product);
        }
      }
    },
    [items, onOpenProductSheet],
  );

  // A menu refresh is the one chance to catch an item that sold out while it
  // sat in the cart. Pruning here beats failing at payment.
  const availableIds = useMemo(
    () => (menu.status === 'ready' ? new Set(menu.items.map((item) => item.id)) : null),
    [menu],
  );

  useEffect(() => {
    if (!availableIds) return;
    for (const itemId of cartItemIds) {
      if (!availableIds.has(itemId)) onPruneItem(itemId);
    }
  }, [availableIds, cartItemIds, onPruneItem]);

  // Switching category re-lists the page; without this the customer lands
  // halfway down a short list.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [active]);

  if (menu.status === 'loading') {
    return (
      <div className="pt-[calc(var(--header-h)+var(--safe-top))]">
        <MenuSkeleton />
      </div>
    );
  }

  if (menu.status === 'error') {
    return (
      <div className="min-h-[100dvh] bg-canvas" style={{ paddingTop: 'var(--safe-top)' }}>
        <ErrorState
          icon="network"
          title="Couldn't load the menu"
          message="Check your connection and try again."
          actionLabel="Try again"
          onAction={menu.retry}
        />
      </div>
    );
  }

  if (menu.items.length === 0) {
    return (
      <div className="min-h-[100dvh] bg-canvas" style={{ paddingTop: 'var(--safe-top)' }}>
        <ErrorState
          icon="generic"
          title="Menu temporarily unavailable"
          message="The kitchen isn't serving right now. Please try again shortly."
          actionLabel="Try again"
          onAction={menu.retry}
        />
      </div>
    );
  }

  return (
    <>
      {banners.length > 0 && (
        <div className="px-4 pt-2 pb-3">
          <PromoCarousel banners={banners} onBannerTap={handleBannerTap} paused={false} />
        </div>
      )}
      <CategoryPills categories={menu.categories} active={active} onChange={setActive} />
      <div className="pb-cart-reserve">
        <MenuList items={visible} activeCategory={active} onProductPress={onProductPress} />
      </div>
    </>
  );
}

/** Menu-only skeleton. The header above it is already real. */
function MenuSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-2 px-4 pt-3">
      <span className="sr-only">Loading the menu…</span>
      {[0, 1, 2, 3].map((index) => (
        <div
          key={index}
          className="flex h-[76px] items-center gap-3 rounded-2xl border border-white/5 bg-surface/40 p-3"
        >
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-2/5 animate-pulse rounded-full bg-white/5" />
            <div className="h-3 w-3/5 animate-pulse rounded-full bg-white/[0.035]" />
          </div>
          <div className="h-11 w-[120px] shrink-0 animate-pulse rounded-2xl bg-white/5" />
        </div>
      ))}
    </div>
  );
}
