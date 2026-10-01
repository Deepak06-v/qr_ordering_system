import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { PromoBanner } from '@/api/types';
import { formatPaise } from '@/lib/format';
import { MOTION } from '@/lib/constants';

interface PromoCarouselProps {
  banners: PromoBanner[];
  onBannerTap: (banner: PromoBanner) => void;
  /** Pause auto-advance while a sheet is open. */
  paused?: boolean;
}

const AUTO_ADVANCE_INTERVAL_MS = 5000;
const SWIPE_THRESHOLD_PX = 50;

export function PromoCarousel({ banners, onBannerTap, paused = false }: PromoCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startXRef = useRef<number | null>(null);
  const isClickRef = useRef(true);

  const nextIndex = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % banners.length);
  }, [banners.length]);

  const prevIndex = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + banners.length) % banners.length);
  }, [banners.length]);

  const goToIndex = useCallback((index: number) => {
    setCurrentIndex(index);
  }, []);

  // Auto-advance logic
  useEffect(() => {
    if (banners.length === 0 || paused || banners.length <= 1) return;

    intervalRef.current = setInterval(() => {
      nextIndex();
    }, AUTO_ADVANCE_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [paused, banners.length, nextIndex]);

  // Pause auto-advance on drag start
  const handleDragStart = useCallback((clientX: number) => {
    if (banners.length <= 1) return;
    setIsDragging(true);
    startXRef.current = clientX;
    setDragOffset(0);
    isClickRef.current = true;
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, [banners.length]);

  const handleDragMove = useCallback((clientX: number) => {
    if (!isDragging || startXRef.current === null) return;
    const delta = clientX - startXRef.current;
    // If moved more than 10px, treat as drag not click
    if (Math.abs(delta) > 10) {
      isClickRef.current = false;
    }
    setDragOffset(delta);
  }, [isDragging]);

  const handleDragEnd = useCallback(() => {
    if (!isDragging || startXRef.current === null) return;

    const delta = dragOffset;
    const threshold = SWIPE_THRESHOLD_PX;

    if (delta < -threshold) {
      nextIndex();
    } else if (delta > threshold) {
      prevIndex();
    }

    setIsDragging(false);
    startXRef.current = null;
    setDragOffset(0);

    // Resume auto-advance after a brief delay
    if (!paused && banners.length > 1) {
      intervalRef.current = setInterval(() => {
        nextIndex();
      }, AUTO_ADVANCE_INTERVAL_MS);
    }
  }, [isDragging, dragOffset, nextIndex, prevIndex, paused, banners.length]);

  // Touch handlers
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (touch) handleDragStart(touch.clientX);
  }, [handleDragStart]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (touch) handleDragMove(touch.clientX);
  }, [handleDragMove]);

  const onTouchEnd = useCallback(() => {
    handleDragEnd();
  }, [handleDragEnd]);

  // Mouse handlers (for desktop testing)
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    // Only handle left click
    if (e.button !== 0) return;
    handleDragStart(e.clientX);
  }, [handleDragStart]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    handleDragMove(e.clientX);
  }, [handleDragMove]);

  const onMouseUp = useCallback(() => {
    handleDragEnd();
  }, [handleDragEnd]);

  const onMouseLeave = useCallback(() => {
    if (isDragging) handleDragEnd();
  }, [isDragging, handleDragEnd]);

  // Click handler for the banner
  const handleBannerClick = useCallback(() => {
    if (isClickRef.current && banners[currentIndex]) {
      onBannerTap(banners[currentIndex]);
    }
  }, [onBannerTap, banners, currentIndex]);

  if (banners.length === 0) return null;

  const currentBanner = banners[currentIndex];
  if (!currentBanner) return null;
  const isMultiBanner = banners.length > 1;

  return (
    <div className="relative">
      <motion.div
        ref={containerRef}
        className="overflow-hidden rounded-2xl"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
        onClick={handleBannerClick}
        style={{
          touchAction: 'pan-y pinch-zoom',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
        role="region"
        aria-label="Promotional banners"
        aria-roledescription="carousel"
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={currentBanner.id}
            initial={{ opacity: 0, x: isDragging ? 0 : 30 }}
            animate={{ opacity: 1, x: isDragging ? dragOffset : 0 }}
            exit={{ opacity: 0, x: isDragging ? 0 : -30 }}
            transition={MOTION.springy}
            className="relative aspect-[16/8] min-h-[180px] max-h-[220px]"
            style={{ cursor: isMultiBanner ? 'grab' : 'pointer' }}
            aria-label={`View ${currentBanner.title} offer`}
          >
            <div className="absolute inset-0 rounded-2xl overflow-hidden">
              <img
                src={currentBanner.imageUrl}
                alt=""
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 ease-swift"
                loading={currentIndex === 0 ? 'eager' : 'lazy'}
                draggable={false}
              />
              <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-black/20" />
            </div>

            <div className="absolute inset-0 flex flex-col justify-end p-5 gap-2">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, ...MOTION.springy }}
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/80">
                  {currentBanner.subtitle}
                </p>
                <h3 className="text-[20px] font-bold leading-tight text-ink">
                  {currentBanner.title}
                </h3>
              </motion.div>

              {currentBanner.price ? (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15, ...MOTION.springy }}
                  className="flex items-center gap-3"
                >
                  <span className="flex h-10 min-w-[100px] items-center justify-center rounded-xl bg-crimson text-[14px] font-bold uppercase tracking-[0.06em] text-ink px-4 shadow-cta">
                    {formatPaise(currentBanner.price)}
                  </span>
                  <span className="flex h-10 min-w-[100px] items-center justify-center gap-2 rounded-xl bg-black/50 backdrop-blur-sm text-[13px] font-semibold text-ink px-4">
                    View Offer
                    <ChevronRight size={16} strokeWidth={2.5} aria-hidden="true" />
                  </span>
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15, ...MOTION.springy }}
                  className="flex h-10 min-w-[100px] items-center justify-center gap-2 rounded-xl bg-crimson text-[14px] font-bold uppercase tracking-[0.06em] text-ink px-4 shadow-cta"
                >
                  View Offer
                  <ChevronRight size={16} strokeWidth={2.5} aria-hidden="true" />
                </motion.div>
              )}
            </div>
          </motion.div>
        </AnimatePresence>

        {isMultiBanner && !isDragging && (
          <>
            <button
              type="button"
              onClick={prevIndex}
              aria-label="Previous banner"
              className="absolute left-3 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 backdrop-blur-sm text-ink transition-colors duration-150 hover:bg-black/70"
            >
              <ChevronLeft size={20} strokeWidth={2.5} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={nextIndex}
              aria-label="Next banner"
              className="absolute right-3 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 backdrop-blur-sm text-ink transition-colors duration-150 hover:bg-black/70"
            >
              <ChevronRight size={20} strokeWidth={2.5} aria-hidden="true" />
            </button>
          </>
        )}
      </motion.div>

      {/* Pagination dots */}
      {isMultiBanner && (
        <div
          className="flex mt-3 justify-center gap-1.5"
          role="tablist"
          aria-label="Banner pagination"
        >
          {banners.map((_, index) => (
            <button
              key={index}
              type="button"
              role="tab"
              aria-selected={index === currentIndex}
              aria-label={`Go to banner ${index + 1}`}
              onClick={() => goToIndex(index)}
              className={[
                'h-1.5 rounded-full transition-all duration-300 ease-swift',
                index === currentIndex
                  ? 'w-6 bg-crimson'
                  : 'w-1.5 bg-white/20 hover:bg-white/40',
              ].join(' ')}
            />
          ))}
        </div>
      )}
    </div>
  );
}