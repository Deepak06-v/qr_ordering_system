import { useEffect, useId, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { MOTION } from '@/lib/constants';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** Opaque scrim behind the sheet. */
  labelledBy?: string;
}

/**
 * iOS-style bottom sheet.
 *
 * One vertical scroll container (the sheet body) and one scrim - the page behind
 * never scrolls, so the customer can neither scroll the menu away by accident
 * nor get trapped between two scrollable regions.
 *
 * Accessibility handled properly: the dialog is modal, focus moves in on open
 * and returns to the trigger on close, Escape dismisses, and the background is
 * hidden from assistive tech.
 */
export function BottomSheet({ open, onClose, title, children, labelledBy }: BottomSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const generatedId = useId();
  const headingId = labelledBy ?? `${generatedId}-title`;

  // Focus trap + scroll lock for as long as the sheet is open.
  useEffect(() => {
    if (!open) return;

    restoreFocusRef.current = document.activeElement as HTMLElement | null;

    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    document.body.style.overflow = 'hidden';

    const panel = panelRef.current;
    panel?.focus({ preventScroll: true });

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }

      if (event.key !== 'Tab' || !panel) return;

      const focusable = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
      restoreFocusRef.current?.focus({ preventScroll: true });
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50" role="presentation">
          <motion.div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: MOTION.fast }}
            onClick={onClose}
          />

          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={headingId}
            tabIndex={-1}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={MOTION.springy}
            className={[
              'absolute inset-x-0 bottom-0 mx-auto flex w-full max-w-[480px]',
              'flex-col rounded-t-3xl border-t border-white/10 bg-surface shadow-sheet',
              'max-h-[88dvh] outline-none',
            ].join(' ')}
            style={{ paddingBottom: 'var(--safe-bottom)' }}
          >
            {/* Drag indicator. Decorative only: it signals that this surface
                came from the bottom edge. It is deliberately not a button -
                the single Close control below is the only way out, so no
                screen-reader user meets two identically labelled controls. */}
            <div className="flex w-full shrink-0 cursor-grab justify-center pb-1 pt-3">
              <span className="h-1 w-9 rounded-full bg-white/20" aria-hidden="true" />
            </div>

            <div className="flex shrink-0 items-center justify-between gap-3 px-5 pb-3">
              <h2 id={headingId} className="text-[17px] font-bold text-ink">
                {title}
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="-mr-1 flex h-11 w-11 items-center justify-center rounded-2xl text-ink-muted transition-colors duration-150 hover:bg-white/5 hover:text-ink"
              >
                <X size={20} strokeWidth={2.25} aria-hidden="true" />
              </button>
            </div>

            <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-5">
              {children}
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
