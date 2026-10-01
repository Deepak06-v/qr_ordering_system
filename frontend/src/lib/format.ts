/**
 * Money and copy helpers.
 *
 * The server speaks integer paise. Formatting happens here and only here, so a
 * rupee float can never leak into the UI.
 */

const RUPEE_FORMATTER = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const PAISE_FORMATTER = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** `35000` -> `₹350`. Whole rupees stay whole; paise only appear when real. */
export function formatPaise(paise: number): string {
  const safe = Number.isFinite(paise) ? Math.max(0, Math.round(paise)) : 0;
  const rupees = safe / 100;
  return Number.isInteger(rupees) ? RUPEE_FORMATTER.format(rupees) : `₹${PAISE_FORMATTER.format(rupees)}`;
}

/** `35000` -> `₹350` per unit, for the menu list where paise are noise. */
export function formatUnitPrice(paise: number): string {
  return formatPaise(paise);
}

/** `3` -> `3 items`. Used in the sticky cart summary. */
export function pluralizeItems(count: number): string {
  return `${count} ${count === 1 ? 'item' : 'items'}`;
}

/** `G3` + `4` -> `G3 • SCREEN 4`, the seat confirmation used across screens. */
export function seatLabel(seatNumber: string, screenNumber: number): string {
  return `${seatNumber} • SCREEN ${screenNumber}`;
}

/** `G3` + `4` -> `Seat G3 • Screen 4`, for sentences. */
export function seatSentence(seatNumber: string, screenNumber: number): string {
  return `Seat ${seatNumber} • Screen ${screenNumber}`;
}

/** Title-cases an UPPER_CASE backend category for display: `POPCORN` -> `Popcorn`. */
export function humanizeCategory(category: string): string {
  const lower = category.toLowerCase().replace(/[_-]+/g, ' ').trim();
  if (!lower) return '';
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}
