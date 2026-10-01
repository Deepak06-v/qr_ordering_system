interface SeatBadgeProps {
  seatNumber: string;
  screenNumber: number;
  /** Skeleton variant for the first paint, before the QR resolves. */
  loading?: boolean;
  className?: string;
}

/**
 * Read-only confirmation of where the food is going: `● G3 • SCREEN 4`.
 *
 * This is the ONLY place the seat is ever shown. It is a label, never an input
 * - a customer physically cannot change the destination, because the QR sticker
 * on the armrest is the sole source of it.
 */
export function SeatBadge({ seatNumber, screenNumber, loading = false, className = '' }: SeatBadgeProps) {
  if (loading) {
    return (
      <div
        className={`h-7 w-28 animate-pulse rounded-full bg-white/5 ${className}`}
        aria-hidden="true"
      />
    );
  }

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border border-crimson/25 bg-crimson/[0.08] px-2.5 py-1 ${className}`}
    >
      <span className="relative flex h-1.5 w-1.5 shrink-0" aria-hidden="true">
        <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-crimson/60" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-crimson" />
      </span>
      <span className="text-[11px] font-semibold uppercase leading-none tracking-[0.08em] text-ink">
        {seatNumber} • Screen {screenNumber}
      </span>
    </span>
  );
}
