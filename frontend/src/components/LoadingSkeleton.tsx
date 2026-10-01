/**
 * First-paint placeholder.
 *
 * A skeleton, not a spinner: the customer can see the shape of the page they
 * are about to use, so the moment the data lands nothing jumps. Matches the
 * real layout 1:1 (header row, category rail, three cards) to keep CLS at zero.
 */
export function LoadingSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite" aria-label="Loading the menu">
      <span className="sr-only">Loading the menu…</span>

      <div className="flex h-12 items-center justify-between gap-3 px-4">
        <div className="h-3 w-24 animate-pulse rounded-full bg-white/5" />
        <div className="h-7 w-28 animate-pulse rounded-full bg-white/5" />
      </div>

      <div className="flex gap-2 overflow-hidden px-4 py-2">
        {[56, 72, 64, 80, 60].map((width, index) => (
          <div
            key={index}
            className="h-11 shrink-0 animate-pulse rounded-2xl bg-white/5"
            style={{ width }}
          />
        ))}
      </div>

      <div className="flex flex-col gap-2 px-4 pt-3">
        {[0, 1, 2].map((index) => (
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
    </div>
  );
}
