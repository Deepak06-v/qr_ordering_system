interface VerificationPinProps {
  pin: string;
}

/**
 * The delivery PIN: four digits, as large as the screen allows.
 *
 * This is the single most important thing on the page. A member of staff reads
 * it back at the seat, in a dark auditorium, possibly from the other side of a
 * row - so it is monospaced, widely tracked, near-white on pure black, and
 * given a restrained crimson halo. No gesture reveals it, nothing hides it, and
 * it does not time out.
 */
export function VerificationPin({ pin }: VerificationPinProps) {
  const digits = pin.split('');

  return (
    <div
      // Read once, as four numbers, rather than as one unpronounceable string.
      aria-label={`Delivery PIN: ${digits.join(' ')}`}
      className="rounded-3xl border border-crimson/20 bg-surface/60 px-5 py-6 shadow-pin"
    >
      <p className="pb-3 text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-faint">
        Delivery PIN
      </p>

      <div className="flex items-center justify-center gap-2 sm:gap-3" aria-hidden="true">
        {digits.map((digit, index) => (
          <span
            // Digits are positional but identical; index keeps React keys stable.
            key={index}
            className="nums flex h-16 w-12 items-center justify-center rounded-2xl border border-white/10 bg-canvas/60 text-[34px] font-bold leading-none text-ink sm:h-20 sm:w-14 sm:text-[40px]"
          >
            {digit}
          </span>
        ))}
      </div>
    </div>
  );
}
