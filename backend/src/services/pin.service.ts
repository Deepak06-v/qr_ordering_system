import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { ApiError, ErrorCode } from '../utils/apiError';
import { generateVerificationPin } from '../utils/generateHash';
import { ACTIVE_ORDER_STATUSES, type OrderStatus } from '../models/order-status';

const SCRYPT_SCHEME = 'scrypt';
const SALT_BYTES = 16;
const KEY_BYTES = 32;

export interface GeneratedPin {
  /** The only time this value ever leaves the process. Never persisted, never logged. */
  plaintext: string;
  /** What actually goes into MongoDB. */
  hash: string;
}

/**
 * Generates a 4-digit delivery PIN and the scrypt hash to store in its place.
 *
 * Uses `crypto.randomBytes` with rejection sampling (see `generateVerificationPin`)
 * so the distribution over 0000-9999 is uniform - `Math.random() % 10000` is not,
 * and a biased PIN is guessable. Leading zeroes are preserved: the PIN is always
 * exactly four characters and is always treated as a string.
 */
export function createVerificationPin(): GeneratedPin {
  const plaintext = generateVerificationPin(4);
  return { plaintext, hash: hashVerificationPin(plaintext) };
}

/**
 * scrypt hash, self-describing (`scrypt$salt$key`) so the parameters can change
 * later without invalidating existing rows.
 */
export function hashVerificationPin(pin: string): string {
  const salt = randomBytes(SALT_BYTES);
  const derived = scryptSync(pin, salt, KEY_BYTES);
  return `${SCRYPT_SCHEME}$${salt.toString('base64')}$${derived.toString('base64')}`;
}

/**
 * Constant-time verification of a customer or staff supplied PIN.
 * A missing or malformed stored hash is a `false`, never a throw: this runs on
 * untrusted input.
 */
export function verifyVerificationPin(pin: string, stored: string | undefined): boolean {
  if (!stored) return false;
  if (typeof pin !== 'string' || !/^\d{4}$/.test(pin)) return false;

  const parts = stored.split('$');
  if (parts.length !== 3) return false;
  const [scheme, saltPart, hashPart] = parts;
  if (scheme !== SCRYPT_SCHEME || !saltPart || !hashPart) return false;

  let expected: Buffer;
  let actual: Buffer;
  try {
    expected = Buffer.from(hashPart, 'base64');
    actual = scryptSync(pin, Buffer.from(saltPart, 'base64'), expected.length);
  } catch {
    return false;
  }

  // timingSafeEqual throws on a length mismatch, which is itself a signal.
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/**
 * A PIN only means anything while the order is live. Once delivered or
 * cancelled it is dead weight, and accepting it would let a stale sticker from a
 * previous order at the same seat authorise a new delivery.
 */
export function assertPinUsable(status: OrderStatus): void {
  if (!ACTIVE_ORDER_STATUSES.includes(status)) {
    throw ApiError.gone(
      `The verification PIN is no longer valid: the order is ${status}`,
      ErrorCode.PIN_NOT_ACTIVE,
    );
  }
}
