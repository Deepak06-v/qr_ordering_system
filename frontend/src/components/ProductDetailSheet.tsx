import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Minus, Plus } from 'lucide-react';
import { MAX_ITEM_QUANTITY, MOTION } from '@/lib/constants';
import { formatPaise } from '@/lib/format';
import { BottomSheet } from './BottomSheet';

interface ProductDetailSheetProps {
  open: boolean;
  onClose: () => void;
  item: {
    id: string;
    name: string;
    description?: string;
    price: number;
    imageUrl?: string;
  };
  /** Called when the item is added to cart from the sheet. */
  onAddToCart: (item: { itemId: string; name: string; price: number; imageUrl?: string }, quantity: number) => void;
  /** Current quantity in cart for this item. */
  currentQuantity: number;
  /** Disables interactions while checkout is in progress. */
  disabled?: boolean;
}

export function ProductDetailSheet({
  open,
  onClose,
  item,
  onAddToCart,
  currentQuantity,
  disabled = false,
}: ProductDetailSheetProps) {
  const [quantity, setQuantity] = useState(Math.max(1, currentQuantity));
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  // Reset quantity when sheet opens with a different item
  useEffect(() => {
    if (open) {
      setQuantity(Math.max(1, currentQuantity));
      setImageLoaded(false);
      setImageError(false);
    }
  }, [open, currentQuantity]);

  const handleIncrease = () => {
    if (quantity >= MAX_ITEM_QUANTITY) return;
    setQuantity((prev) => prev + 1);
  };

  const handleDecrease = () => {
    setQuantity((prev) => (prev <= 1 ? 1 : prev - 1));
  };

  const handleAddToCart = () => {
    onAddToCart(
      {
        itemId: item.id,
        name: item.name,
        price: item.price,
        ...(item.imageUrl ? { imageUrl: item.imageUrl } : {}),
      },
      quantity,
    );
    onClose();
  };

  const totalPrice = item.price * quantity;

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={item.name}
      labelledBy="product-detail-title"
    >
      <div className="flex flex-col h-full">
        {/* Scrollable Content */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="flex flex-col gap-0 pb-20">
            {/* Product Image */}
            <div className="relative w-full overflow-hidden" style={{ aspectRatio: '16/9' }}>
              <AnimatePresence mode="wait">
                {!imageError && item.imageUrl ? (
                  <motion.img
                    key="product-image"
                    src={item.imageUrl}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover transition-opacity duration-300"
                    style={{ opacity: imageLoaded ? 1 : 0 }}
                    onLoad={() => setImageLoaded(true)}
                    onError={() => {
                      setImageError(true);
                      setImageLoaded(true);
                    }}
                  />
                ) : (
                  <motion.div
                    key="placeholder"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="absolute inset-0 flex items-center justify-center bg-surface"
                  >
                    <svg
                      className="h-16 w-16 text-white/10"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 002 2v12a2 2 0 002 2z"
                      />
                    </svg>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Gradient overlay at bottom of image */}
              <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
            </div>

            {/* Content */}
            <div className="px-5 pt-2 pb-4">
              <h2 id="product-detail-title" className="text-[20px] font-bold leading-snug text-ink">
                {item.name}
              </h2>

              {item.description && (
                <p className="mt-3 text-[14px] leading-relaxed text-ink-muted">
                  {item.description}
                </p>
              )}

              <div className="mt-5 flex items-baseline justify-between gap-3">
                <span className="nums text-[24px] font-bold text-ink">
                  {formatPaise(item.price)}
                </span>
                {quantity > 1 && (
                  <span className="nums text-[15px] font-medium text-ink-muted">
                    {formatPaise(totalPrice)} total
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Fixed Bottom Action Bar */}
        <div
          className="flex shrink-0 items-center gap-3 px-5 py-4 bg-gradient-to-t from-surface via-surface/95 to-transparent"
          style={{
            paddingBottom: 'max(1rem, var(--safe-bottom))',
          }}
        >
          {/* Quantity Control - ~30% width */}
          <div
            className="flex h-12 shrink-0 items-center rounded-2xl border border-white/10 bg-surface-raised"
            role="group"
            aria-label={`Quantity for ${item.name}`}
            style={{ width: '32%', minWidth: '120px' }}
          >
            <button
              type="button"
              onClick={handleDecrease}
              disabled={disabled || quantity <= 1}
              aria-label={quantity === 1 ? `Remove ${item.name}` : `Decrease ${item.name}`}
              className="flex h-full w-12 items-center justify-center text-ink-muted transition-colors duration-150 hover:text-ink active:text-crimson disabled:opacity-40"
            >
              <Minus size={20} strokeWidth={2.5} aria-hidden="true" />
            </button>

            <motion.span
              key={quantity}
              initial={{ scale: 0.72, opacity: 0.5 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={MOTION.springy}
              aria-live="polite"
              aria-atomic="true"
              className="nums flex-1 text-center text-lg font-bold text-ink"
            >
              {quantity}
            </motion.span>

            <button
              type="button"
              onClick={handleIncrease}
              disabled={disabled || quantity >= MAX_ITEM_QUANTITY}
              aria-label={`Increase ${item.name}`}
              className="flex h-full w-12 items-center justify-center text-ink-muted transition-colors duration-150 hover:text-ink active:text-crimson disabled:opacity-40"
            >
              <Plus size={20} strokeWidth={2.5} aria-hidden="true" />
            </button>
          </div>

          {/* Add to Cart CTA - ~68% width */}
          <motion.button
            type="button"
            onClick={handleAddToCart}
            disabled={disabled}
            whileTap={{ scale: 0.98 }}
            transition={MOTION.springy}
            className={[
              'flex h-[52px] flex-1 items-center justify-center',
              'rounded-2xl bg-crimson text-[15px] font-bold uppercase tracking-[0.06em] text-ink',
              'shadow-cta transition-transform duration-100',
              'disabled:opacity-60',
            ].join(' ')}
            style={{ minWidth: 0 }}
          >
            ADD TO CART
          </motion.button>
        </div>
      </div>
    </BottomSheet>
  );
}