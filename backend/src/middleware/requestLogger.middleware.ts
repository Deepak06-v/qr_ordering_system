import type { NextFunction, Request, RequestHandler, Response } from 'express';
import morgan from 'morgan';
import { env, isTest } from '../config/env';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

/**
 * Attaches a short request id used to correlate log lines.
 * Uses an inbound header when present (traced by an upstream proxy), never a random
 * value that could be spoofed into log injection.
 */
export const requestId: RequestHandler = (req, res, next) => {
  const inbound = req.header('x-request-id');
  const id = inbound && /^[\w-]{1,64}$/.test(inbound) ? inbound : undefined;
  if (id) {
    req.requestId = id;
    res.setHeader('X-Request-Id', id);
  }
  next();
};

/**
 * Structured HTTP access logging: `METHOD url status duration length`.
 * Deliberately omits request/response bodies, headers and cookies, so nothing
 * sensitive (a QR hash, a future payment token) can end up in an access log.
 */
const ACCESS_LOG_FORMAT = ':method :url :status :response-time ms - :res[content-length]';

export const httpLogger: RequestHandler =
  isTest || env.LOG_LEVEL === 'silent'
    ? (_req: Request, _res: Response, next: NextFunction) => next()
    : morgan(ACCESS_LOG_FORMAT, {
        stream: { write: (line: string) => process.stdout.write(line) },
        skip: (req: Request) => req.path === '/health',
      });
