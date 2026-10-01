import { env, isProduction, isTest } from '../config/env';

type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug';

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
};

const REDACTED_KEYS = new Set([
  'password',
  'pin',
  'verificationpin',
  'verificationpinhash',
  'token',
  'accesstoken',
  'refreshtoken',
  'secret',
  'apikey',
  'authorization',
  'cookie',
  'set-cookie',
  'mongouri',
  'mongodburi',
  'clientsecret',
  'signature',
  'razorpaysecret',
  'stripekey',
]);

const activeWeight = isTest ? LEVEL_WEIGHT.error : LEVEL_WEIGHT[env.LOG_LEVEL];

/**
 * Redacts anything that could be a credential. Defence in depth for logs, on top of
 * the rule that we never pass secrets into the logger in the first place.
 */
/**
 * Driver and third-party errors routinely embed the connection string they
 * failed on ("Authentication failed for mongodb://user:hunter2@host/db"). A
 * key-based redaction pass cannot see that, so credential-shaped substrings
 * are masked inside any string that reaches a log line.
 */
const CREDENTIAL_IN_TEXT = /([a-z][a-z0-9+.-]*:\/\/)([^\s/@:]+)(:[^\s/@]*)?@/gi;

function redactText(value: string): string {
  return value.replace(CREDENTIAL_IN_TEXT, (_match, scheme: string, user: string) => {
    // Keep enough shape to debug with, never the password.
    return `${scheme}${user}:***@`;
  });
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[DepthLimit]';
  if (value === null || value === undefined) return value;

  if (value instanceof Error) {
    return {
      name: redactText(value.name),
      message: redactText(value.message),
      stack: value.stack === undefined ? undefined : redactText(value.stack),
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, depth + 1));
  }

  if (value instanceof Date) return value.toISOString();

  if (typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      output[key] = REDACTED_KEYS.has(key.toLowerCase()) ? '[REDACTED]' : redact(entry, depth + 1);
    }
    return output;
  }

  if (typeof value === 'string') return redactText(value);

  return value;
}

function write(
  level: Exclude<LogLevel, 'silent'>,
  message: string,
  meta?: Record<string, unknown>,
): void {
  if (LEVEL_WEIGHT[level] > activeWeight) return;

  const payload: Record<string, unknown> = {
    level,
    time: new Date().toISOString(),
    message,
  };

  if (meta && Object.keys(meta).length > 0) {
    payload.meta = redact(meta);
  }

  if (isProduction) {
    // Structured single-line JSON is what log shippers and aggregators expect.
    process.stdout.write(`${JSON.stringify(payload)}\n`);
    return;
  }

  if (isTest) {
    // Keep the Jest output readable.
    const suffix = meta && Object.keys(meta).length > 0 ? ` ${safeStringify(redact(meta))}` : '';
    process.stdout.write(`[${level.toUpperCase()}] ${message}${suffix}\n`);
    return;
  }

  if (!env.LOG_PRETTY) {
    process.stdout.write(`${JSON.stringify(payload)}\n`);
    return;
  }

  const stream = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
  const colour = level === 'error' ? 31 : level === 'warn' ? 33 : level === 'debug' ? 90 : 36;
  const suffix = meta && Object.keys(meta).length > 0 ? ` ${safeStringify(redact(meta))}` : '';
  stream.write(`\x1b[${colour}m${level.toUpperCase().padEnd(5)}\x1b[0m ${message}${suffix}\n`);
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return '[Unserializable]';
  }
}

export const logger = {
  error: (message: string, meta?: Record<string, unknown>): void => write('error', message, meta),
  warn: (message: string, meta?: Record<string, unknown>): void => write('warn', message, meta),
  info: (message: string, meta?: Record<string, unknown>): void => write('info', message, meta),
  debug: (message: string, meta?: Record<string, unknown>): void => write('debug', message, meta),
  http: (message: string, meta?: Record<string, unknown>): void => write('info', message, meta),
  /** Verbose payloads must never surface in production. */
  trace: (message: string, meta?: Record<string, unknown>): void => {
    if (isProduction) return;
    write('debug', message, meta);
  },
};
