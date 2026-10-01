import { describe, expect, it } from 'vitest';
import { formatPaise, humanizeCategory, pluralizeItems, seatLabel, seatSentence } from './format';

describe('formatPaise', () => {
  it('renders whole rupees without decimals', () => {
    expect(formatPaise(35000)).toBe('₹350');
    expect(formatPaise(0)).toBe('₹0');
  });

  it('keeps paise when they are real', () => {
    expect(formatPaise(35050)).toContain('350.5');
  });

  it('uses lakh grouping, not western grouping', () => {
    // 123456.50 rupees -> 1,23,456.50, which is how an Indian price is read.
    expect(formatPaise(12345650)).toContain('1,23,456');
  });

  it('never throws on a hostile number', () => {
    expect(formatPaise(Number.NaN)).toBe('₹0');
    expect(formatPaise(-100)).toBe('₹0');
    expect(formatPaise(Number.POSITIVE_INFINITY)).toBe('₹0');
  });
});

describe('copy helpers', () => {
  it('pluralises item counts', () => {
    expect(pluralizeItems(1)).toBe('1 item');
    expect(pluralizeItems(3)).toBe('3 items');
    expect(pluralizeItems(0)).toBe('0 items');
  });

  it('builds the seat confirmation used in the header', () => {
    expect(seatLabel('G3', 4)).toBe('G3 • SCREEN 4');
    expect(seatSentence('G3', 4)).toBe('Seat G3 • Screen 4');
  });

  it('humanises backend category keys', () => {
    expect(humanizeCategory('POPCORN')).toBe('Popcorn');
    expect(humanizeCategory('OUT_FOR_DELIVERY')).toBe('Out for delivery');
    expect(humanizeCategory('')).toBe('');
  });
});
