import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { ApiError, ErrorCode, type ApiErrorBody, type ErrorCodeValue } from '../utils/apiError';
import { isDuplicateKeyError } from '../utils/mongo';
import { isDevelopment, isProduction } from '../config/env';
import { logger } from '../utils/logger';

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(
    ApiError.notFound(
      `Route ${req.method} ${req.originalUrl} does not exist`,
      ErrorCode.INVALID_REQUEST,
    ),
  );
}

/** JSON body parser guard: oversized payloads get a typed 413 instead of a raw HTML error. */
export function payloadTooLarge(
  error: unknown,
  _req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (error instanceof Error && 'type' in error && error.type === 'entity.too.large') {
    next(new ApiError(413, ErrorCode.PAYLOAD_TOO_LARGE, 'Request payload is too large'));
    return;
  }
  next(error);
}

interface NormalizedError {
  statusCode: number;
  code: ErrorCodeValue;
  message: string;
  details?: unknown;
}

function normalize(error: unknown): NormalizedError {
  if (error instanceof ApiError) {
    return {
      statusCode: error.statusCode,
      code: error.code,
      message: error.message,
      details: error.details,
    };
  }

  if (error instanceof mongoose.Error.ValidationError) {
    return {
      statusCode: 400,
      code: ErrorCode.VALIDATION_ERROR,
      message: 'Request validation failed',
      details: Object.values(error.errors).map((issue) => ({
        path: issue.path,
        message: issue.message,
      })),
    };
  }

  if (error instanceof mongoose.Error.CastError) {
    return {
      statusCode: 400,
      code: ErrorCode.INVALID_REQUEST,
      message: `Invalid value for "${error.path}"`,
    };
  }

  if (isDuplicateKeyError(error)) {
    return {
      statusCode: 409,
      code: ErrorCode.DUPLICATE_QR,
      message: 'A record with the same unique key already exists',
    };
  }

  if (error instanceof mongoose.Error.MongooseServerSelectionError) {
    return {
      statusCode: 503,
      code: ErrorCode.DATABASE_UNAVAILABLE,
      message: 'Database is temporarily unavailable, please retry',
    };
  }

  return {
    statusCode: 500,
    code: ErrorCode.INTERNAL_SERVER_ERROR,
    message: 'Internal server error',
  };
}

export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const normalized = normalize(error);

  const logMeta: Record<string, unknown> = {
    method: req.method,
    path: req.originalUrl,
    statusCode: normalized.statusCode,
    code: normalized.code,
  };

  // Only ever the validated inbound id, so a support ticket quoting the
  // requestId can be matched to exactly one line in the logs.
  if (req.requestId !== undefined) {
    logMeta.requestId = req.requestId;
  }

  if (normalized.statusCode >= 500) {
    logger.error('API error', { ...logMeta, err: error });
  } else {
    logger.warn('API error', { ...logMeta, message: (error as Error)?.message });
  }

  if (res.headersSent) {
    return;
  }

  const body: ApiErrorBody = {
    success: false,
    error: {
      code: normalized.code,
      // Never leak internals in production.
      message:
        isProduction && normalized.statusCode >= 500 ? 'Internal server error' : normalized.message,
      // Echoed so a customer can quote one string that ties their report to the
      // server log. Omitted entirely when no id was supplied.
      ...(req.requestId !== undefined ? { requestId: req.requestId } : {}),
    },
  };

  if (normalized.details !== undefined && !isProduction) {
    body.error.details = normalized.details;
  }

  // Stack traces are a development-only debugging aid. They are never sent in
  // test (keeps the response contract stable) or production.
  if (isDevelopment && error instanceof Error && error.stack) {
    body.error.details = { ...asRecord(body.error.details), stack: error.stack.split('\n') };
  }

  res.status(normalized.statusCode).json(body);
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}
