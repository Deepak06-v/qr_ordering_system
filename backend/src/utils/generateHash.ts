import { randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env';

/**
 * URL-safe base64url alphabet only: [A-Za-z0-9_-]
 * No padding, no '+', no '/', so the hash is always a single path segment.
 */
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

/** Character length of the base64url encoding of `byteLength` bytes. */
export function hashLengthForBytes(byteLength: number = env.QR_HASH_BYTES): number {
  return Math.ceil((byteLength * 4) / 3);
}

/**
 * Generates a cryptographically random, URL-safe opaque token.
 *
 * Uses `crypto.randomBytes` (CSPRNG). Never `Math.random()`: QR hashes are the
 * only thing standing between a scanned sticker and a spoofed seat, so they must
 * be unguessable and non-sequential.
 */
export function generateSecureQrHash(byteLength: number = env.QR_HASH_BYTES): string {
  if (!Number.isInteger(byteLength) || byteLength < 16 || byteLength > 64) {
    throw new RangeError('QR hash byte length must be an integer between 16 and 64');
  }
  return randomBytes(byteLength).toString('base64url');
}

/**
 * Generates a batch of hashes that are guaranteed unique *within the batch*.
 * Across batches, the `hash` unique index in MongoDB is the final guard.
 */
export function generateSecureQrHashes(
  count: number,
  byteLength: number = env.QR_HASH_BYTES,
): string[] {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError('count must be a non-negative integer');
  }

  const hashes = new Set<string>();
  while (hashes.size < count) {
    hashes.add(generateSecureQrHash(byteLength));
  }
  return [...hashes];
}

/** Structural guard: is this string a well-formed QR hash? (not an existence check) */
export function isValidQrHashFormat(value: string): boolean {
  if (typeof value !== 'string') return false;
  if (value.length !== hashLengthForBytes(env.QR_HASH_BYTES)) return false;
  return BASE64URL_PATTERN.test(value);
}

/**
 * A 4-digit delivery verification PIN, generated server-side with a CSPRNG and
 * drawn from a uniform range (no modulo bias).
 */
export function generateVerificationPin(digits: number = 4): string {
  if (!Number.isInteger(digits) || digits < 4 || digits > 10) {
    throw new RangeError('PIN length must be an integer between 4 and 10');
  }
  const max = 10 ** digits;
  // Rejection sampling keeps the distribution uniform across the whole range.
  const limit = Math.floor(0xffffffff / max) * max;
  let value = randomBytes(4).readUInt32BE(0);
  while (value >= limit) {
    value = randomBytes(4).readUInt32BE(0);
  }
  return String(value % max).padStart(digits, '0');
}

/** Constant-time comparison for short secrets such as the delivery PIN. */
export function safeCompare(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}
