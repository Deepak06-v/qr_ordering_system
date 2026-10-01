import { QrCode, TriangleAlert, WifiOff } from 'lucide-react';

interface ErrorStateProps {
  icon?: 'qr' | 'network' | 'generic';
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

const ICONS = {
  qr: QrCode,
  network: WifiOff,
  generic: TriangleAlert,
} as const;

/**
 * Every failure looks like this: one short sentence, one action, nothing
 * technical. No stack traces, no status codes, no "something went wrong".
 */
export function ErrorState({
  icon = 'generic',
  title,
  message,
  actionLabel,
  onAction,
}: ErrorStateProps) {
  const Icon = ICONS[icon];

  return (
    <div
      role="alert"
      className="flex flex-1 flex-col items-center justify-center px-6 text-center"
      style={{ paddingTop: 'calc(var(--safe-top) + 48px)', paddingBottom: 'calc(var(--safe-bottom) + 48px)' }}
    >
      <span
        className="flex h-14 w-14 items-center justify-center rounded-full border border-white/5 bg-surface"
        aria-hidden="true"
      >
        <Icon size={24} strokeWidth={1.75} className="text-ink-muted" />
      </span>

      <h1 className="pt-5 text-[19px] font-bold leading-tight text-ink">{title}</h1>
      <p className="mt-2 max-w-xs text-[14px] leading-relaxed text-ink-muted">{message}</p>

      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-7 flex h-12 min-w-[160px] items-center justify-center rounded-2xl border border-white/10 bg-surface px-6 text-[14px] font-semibold text-ink transition-transform duration-100 active:scale-[0.98]"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
