import { Armchair, BellRing, QrCode } from 'lucide-react';

/**
 * Marketing landing page. Not part of the customer flow.
 *
 * Deliberately the same restrained language as the ordering app so a customer
 * who lands here first does not feel they have left the product. It explains
 * one thing - scan the code on your armrest - and stops.
 */
export function LandingPage() {
  return (
    <div
      className="flex min-h-[100dvh] flex-col bg-canvas px-6"
      style={{ paddingTop: 'calc(var(--safe-top) + 48px)', paddingBottom: 'calc(var(--safe-bottom) + 32px)' }}
    >
      <div className="mx-auto flex w-full max-w-[480px] flex-1 flex-col justify-center">
        <h1 className="text-[30px] font-bold leading-[1.1] tracking-tight text-ink">
          Food, delivered
          <br />
          to your seat.
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-ink-muted">
          No queue, no app to install, no account. Scan the code on your armrest, order from the
          menu, and keep watching the film.
        </p>

        <ul className="mt-9 space-y-5">
          <Step
            icon={<QrCode size={20} strokeWidth={1.9} />}
            title="Scan the code on your seat"
            body="Every seat has its own code. It tells us exactly where to bring your order."
          />
          <Step
            icon={<Armchair size={20} strokeWidth={1.9} />}
            title="Choose what you want"
            body="Popcorn, drinks, combos. No forms, no name, no phone number."
          />
          <Step
            icon={<BellRing size={20} strokeWidth={1.9} />}
            title="Show your PIN"
            body="Pay, then show the four-digit code on your screen. That's it."
          />
        </ul>
      </div>

      <div className="mx-auto w-full max-w-[480px] pt-10">
        <p className="text-center text-[12px] leading-relaxed text-ink-faint">
          Your seat code is a private link. Open the one printed on your armrest to start an order.
        </p>
      </div>
    </div>
  );
}

function Step({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <li className="flex gap-3.5">
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-crimson/20 bg-crimson/[0.07] text-crimson"
        aria-hidden="true"
      >
        {icon}
      </span>
      <div className="min-w-0 pt-0.5">
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        <p className="mt-0.5 text-[13px] leading-relaxed text-ink-muted">{body}</p>
      </div>
    </li>
  );
}
