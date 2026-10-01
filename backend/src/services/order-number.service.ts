import { env } from '../config/env';
import { Counter, ORDER_NUMBER_COUNTER } from '../models/Counter';
import { ApiError } from '../utils/apiError';

/**
 * Allocates the next human-facing order number, e.g. `FM-1042`.
 *
 * The counter is advanced with a single atomic `$inc` on a dedicated document,
 * so two concurrent order creations are always handed different numbers. A
 * `countDocuments()`-derived number would collide under concurrency and would
 * also reissue a number after a deletion.
 *
 * Numbers are intentionally not gapless: a rolled-back transaction still
 * consumes its number, and a gap would leak order volume to customers.
 */
export async function nextOrderNumber(): Promise<string> {
  const counter = await Counter.findOneAndUpdate(
    { key: ORDER_NUMBER_COUNTER },
    { $inc: { value: 1 }, $setOnInsert: { key: ORDER_NUMBER_COUNTER } },
    { new: true, upsert: true },
  )
    .lean()
    .exec();

  if (!counter) {
    throw ApiError.internal('Could not allocate an order number');
  }

  return `${env.ORDER_NUMBER_PREFIX.toUpperCase()}-${counter.value}`;
}
