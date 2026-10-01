import { SeatBadge } from './SeatBadge';

interface AppHeaderProps {
  seatNumber?: string;
  screenNumber?: number;
  loadingSeat: boolean;
}

/**
 * Compact sticky header: brand on the left, seat on the right.
 *
 * Deliberately short. The customer came to order food, not read branding, and
 * every pixel of a 667pt-tall phone in a dark room is expensive.
 */
export function AppHeader({ seatNumber, screenNumber, loadingSeat }: AppHeaderProps) {
  return (
    <header
      className="sticky top-0 z-30 border-b border-white/5 bg-canvas/80 backdrop-blur-md"
      // The sticky element itself cannot read the notch inset, so it is applied
      // to an inner row - otherwise the pill hides behind the status bar.
      style={{ paddingTop: 'var(--safe-top)' }}
    >
      <div className="flex h-12 items-center justify-between gap-3 px-4">
        <h1 className="text-[13px] font-semibold uppercase leading-none tracking-[0.14em] text-ink-muted">
          Cinema&nbsp;Food
        </h1>

        {loadingSeat || seatNumber === undefined || screenNumber === undefined ? (
          <SeatBadge loading seatNumber="" screenNumber={0} />
        ) : (
          <SeatBadge seatNumber={seatNumber} screenNumber={screenNumber} />
        )}
      </div>
    </header>
  );
}
