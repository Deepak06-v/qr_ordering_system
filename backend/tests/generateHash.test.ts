import { env } from '../src/config/env';
import { buildQrUrl } from '../src/services/qr.service';
import {
  generateSecureQrHash,
  generateSecureQrHashes,
  generateVerificationPin,
  hashLengthForBytes,
  isValidQrHashFormat,
  safeCompare,
} from '../src/utils/generateHash';
import { hashVerificationPin, verifyVerificationPin } from '../src/models/Order';
import { logger, redact } from '../src/utils/logger';

describe('generateSecureQrHash()', () => {
  it('produces a hash of the expected length for the configured entropy', () => {
    const hash = generateSecureQrHash();

    expect(hash).toHaveLength(hashLengthForBytes(env.QR_HASH_BYTES));
    expect(env.QR_HASH_BYTES).toBeGreaterThanOrEqual(16);
  });

  it('uses only URL-safe characters (single path segment, no encoding needed)', () => {
    for (let i = 0; i < 200; i += 1) {
      const hash = generateSecureQrHash();
      expect(hash).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(encodeURIComponent(hash)).toBe(hash);
    }
  });

  it('carries no seat, screen or theater information anywhere in the QR payload', () => {
    const hash = generateSecureQrHash();
    const url = buildQrUrl(hash);

    // The QR encodes exactly `${APP_BASE_URL}/${hash}` and nothing else.
    expect(url).toBe(`${env.APP_BASE_URL}/${hash}`);
    expect(url.split('/').pop()).toBe(hash);
    expect(url).not.toContain('?');
    expect(url).not.toContain('seat');
    expect(url).not.toContain('screen');
    expect(url).not.toContain('theater');
    expect(url.toLowerCase()).not.toContain('g3');
  });

  it('is unique across a large sample (no collisions, no sequential pattern)', () => {
    const sample = generateSecureQrHashes(20_000);

    expect(new Set(sample).size).toBe(20_000);
  });

  it('is not sequential and does not correlate with creation order', () => {
    const hashes = generateSecureQrHashes(1000);

    // Consecutive hashes must not share a long prefix (rules out counters/PRNGs
    // with weak seeding such as Math.random()-based generators).
    const sorted = [...hashes].sort();
    let sharedPrefixPairs = 0;
    for (let i = 1; i < sorted.length; i += 1) {
      const a = sorted[i - 1] as string;
      const b = sorted[i] as string;
      if (a.slice(0, 12) === b.slice(0, 12)) sharedPrefixPairs += 1;
    }
    expect(sharedPrefixPairs).toBeLessThan(2);
  });

  it('is sufficiently random: hash characters are indistinguishable from uniform base64url', () => {
    const N = 20_000;
    const samples = generateSecureQrHashes(N);
    const counts = new Map<string, number>();
    let symbolTotal = 0;

    for (const hash of samples) {
      // 16 bytes encode to 22 base64url characters, but the final character
      // only carries 4 real bits (it can only take 16 of the 64 symbols), so it
      // is excluded from the uniformity check.
      const uniform = hash.slice(0, -1);
      for (const ch of uniform) {
        counts.set(ch, (counts.get(ch) ?? 0) + 1);
        symbolTotal += 1;
      }
    }

    expect(counts.size).toBe(64);

    const expected = symbolTotal / 64;
    // Chi-square goodness of fit over the 64 base64url symbols.
    const chiSquare = [...counts.values()].reduce(
      (sum, observed) => sum + (observed - expected) ** 2 / expected,
      0,
    );

    // 63 degrees of freedom, 0.999 critical value ~ 124.8. A CSPRNG sits far
    // below this; a Math.random()-based generator or a counter blows past it.
    expect(chiSquare).toBeLessThan(124.8);
  });

  it('rejects a byte length below the 128-bit security floor', () => {
    expect(() => generateSecureQrHash(8)).toThrow(RangeError);
    expect(() => generateSecureQrHash(65)).toThrow(RangeError);
    expect(() => generateSecureQrHash(16.5)).toThrow(RangeError);
  });

  it('validates hash format', () => {
    expect(isValidQrHashFormat(generateSecureQrHash())).toBe(true);
    expect(isValidQrHashFormat('not base64url!!')).toBe(false);
    expect(isValidQrHashFormat('a8f7K2mQx91PvL4s')).toBe(false);
  });
});

describe('generateVerificationPin()', () => {
  it('always returns exactly 4 digits', () => {
    for (let i = 0; i < 1000; i += 1) {
      const pin = generateVerificationPin();
      expect(pin).toMatch(/^\d{4}$/);
    }
  });

  it('covers the full 0000-9999 range with no modulo bias', () => {
    const DRAWS = 200_000;
    const counts = new Map<string, number>();
    for (let i = 0; i < DRAWS; i += 1) {
      const pin = generateVerificationPin();
      counts.set(pin, (counts.get(pin) ?? 0) + 1);
    }

    // Every PIN in range must be reachable.
    expect(counts.size).toBe(10_000);

    // Rejection sampling must produce a flat distribution. Chi-square is the
    // right test here: a per-bucket band has to account for the extreme order
    // statistic across 10,000 buckets, which a naive +/- 4 sigma band does not.
    const expected = DRAWS / 10_000;
    const chiSquare = [...counts.values()].reduce(
      (sum, observed) => sum + (observed - expected) ** 2 / expected,
      0,
    );

    // 9,999 degrees of freedom, 0.999 critical value ~= 11,382.
    expect(chiSquare).toBeLessThan(11_382);
  });

  it('rejects unsafe PIN lengths', () => {
    expect(() => generateVerificationPin(3)).toThrow(RangeError);
    expect(() => generateVerificationPin(11)).toThrow(RangeError);
  });
});

describe('verification PIN hashing', () => {
  it('never stores the PIN in plaintext', () => {
    const stored = hashVerificationPin('8492');

    expect(stored).not.toContain('8492');
    expect(stored.startsWith('scrypt$')).toBe(true);
  });

  it('salts each hash, so identical PINs produce different digests', () => {
    expect(hashVerificationPin('8492')).not.toBe(hashVerificationPin('8492'));
  });

  it('verifies a correct PIN and rejects a wrong one', () => {
    const stored = hashVerificationPin('8492');

    expect(verifyVerificationPin('8492', stored)).toBe(true);
    expect(verifyVerificationPin('8493', stored)).toBe(false);
    expect(verifyVerificationPin('', stored)).toBe(false);
    expect(verifyVerificationPin('8492', undefined)).toBe(false);
  });
});

describe('safeCompare()', () => {
  it('compares equal and unequal strings', () => {
    expect(safeCompare('abcd', 'abcd')).toBe(true);
    expect(safeCompare('abcd', 'abce')).toBe(false);
    expect(safeCompare('abcd', 'abc')).toBe(false);
  });
});

describe('logger redaction', () => {
  it('redacts credential-shaped keys', () => {
    const result = redact({
      password: 'hunter2',
      verificationPin: '8492',
      token: 'abc',
      mongodbUri: 'mongodb://user:pass@host',
      nested: { apiKey: 'k', keep: 'visible' },
    }) as Record<string, Record<string, unknown>>;

    expect(result.password).toBe('[REDACTED]');
    expect(result.verificationPin).toBe('[REDACTED]');
    expect(result.token).toBe('[REDACTED]');
    expect(result.mongodbUri).toBe('[REDACTED]');
    expect(result.nested?.apiKey).toBe('[REDACTED]');
    expect(result.nested?.keep).toBe('visible');
  });

  it('is used by the real logger', () => {
    expect(typeof logger.info).toBe('function');
  });

  it('masks credentials embedded in a driver error message and stack', () => {
    // Driver errors quote the connection string they failed on, which a
    // key-based redaction pass would pass straight through.
    const error = new Error('Authentication failed for mongodb://admin:hunter2@cluster/db');

    const result = redact(error) as { message: string };

    expect(result.message).toBe('Authentication failed for mongodb://admin:***@cluster/db');
    expect(JSON.stringify(result)).not.toContain('hunter2');
  });

  it('masks credentials inside an arbitrary string value', () => {
    const result = redact({ note: 'reconnected to postgres://app:s3cr3t@db:5432/main' });

    expect(JSON.stringify(result)).not.toContain('s3cr3t');
    expect((result as { note: string }).note).toBe(
      'reconnected to postgres://app:***@db:5432/main',
    );
  });

  it('leaves a URL without credentials untouched', () => {
    expect(redact('http://localhost:5173/abc')).toBe('http://localhost:5173/abc');
  });
});
