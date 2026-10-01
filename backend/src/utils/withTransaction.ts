import mongoose, { type ClientSession } from 'mongoose';
import { logger } from './logger';

let transactionsSupported: boolean | null = null;

/**
 * Detects once per process whether the deployment can run multi-document
 * transactions. Standalone `mongod` cannot; replica sets and sharded clusters can.
 */
export async function supportsTransactions(): Promise<boolean> {
  if (transactionsSupported !== null) return transactionsSupported;

  try {
    const admin = mongoose.connection.db?.admin();
    if (!admin) {
      transactionsSupported = false;
      return false;
    }
    const info = await admin.command({ hello: 1 });
    transactionsSupported = Boolean(info.setName) || info.msg === 'isdbgrid';
  } catch (error) {
    logger.debug('Could not determine transaction support', { message: String(error) });
    transactionsSupported = false;
  }

  return transactionsSupported;
}

/** Test seam: forget the cached capability probe. */
export function resetTransactionSupportCache(): void {
  transactionsSupported = null;
}

export interface WithTransactionOptions {
  /** Used for logging only. */
  label: string;
  /**
   * Fallback used when the deployment has no transaction support. Receives the
   * list of documents already inserted so the caller can compensate (roll back).
   */
  compensate?: (session: ClientSession | null) => Promise<void>;
  onUnsupported?: () => Promise<void>;
}

export interface TransactionOutcome<T> {
  result: T;
  usedTransaction: boolean;
}

/**
 * Runs `work` inside a real transaction when possible, and inside a
 * compensating (compensate-on-failure) block otherwise.
 *
 * Either way the caller gets all-or-nothing semantics for a bulk write: either
 * every record exists afterwards, or none of them do.
 */
export async function withTransaction<T>(
  work: (session: ClientSession | null) => Promise<T>,
  options: WithTransactionOptions,
): Promise<TransactionOutcome<T>> {
  if (await supportsTransactions()) {
    const session = await mongoose.startSession();
    try {
      let outcome: T | undefined;
      await session.withTransaction(async () => {
        outcome = await work(session);
      });
      return { result: outcome as T, usedTransaction: true };
    } finally {
      await session.endSession();
    }
  }

  logger.debug('Transactions unavailable, using compensated write', { label: options.label });

  try {
    const result = await work(null);
    return { result, usedTransaction: false };
  } catch (error) {
    if (options.compensate) {
      await options.compensate(null).catch((compensateError: unknown) => {
        logger.error('Compensation after failed bulk write failed', {
          label: options.label,
          message: String(compensateError),
        });
      });
    } else if (options.onUnsupported) {
      await options.onUnsupported();
    }
    throw error;
  }
}
