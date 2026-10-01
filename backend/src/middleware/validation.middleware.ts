import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny, z } from 'zod';
import { ApiError, ErrorCode } from '../utils/apiError';

export interface ValidationSchemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

type Source = keyof ValidationSchemas;

function formatIssues(error: z.ZodError): Array<{ path: string; message: string }> {
  return error.issues.map((issue) => ({
    path: issue.path.length > 0 ? issue.path.join('.') : '(root)',
    message: issue.message,
  }));
}

/**
 * Validates and REPLACES the request segment with the parsed value, so
 * controllers always receive coerced, trimmed, typed data.
 * Anything that fails here never reaches a controller.
 */
export function validate(schemas: ValidationSchemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      for (const source of Object.keys(schemas) as Source[]) {
        const schema = schemas[source];
        if (!schema) continue;

        const result = schema.safeParse(req[source]);
        if (!result.success) {
          const issues = formatIssues(result.error);
          throw ApiError.badRequest(
            issues.length === 1 && issues[0]?.path === '(root)'
              ? (issues[0]?.message ?? 'Invalid request')
              : 'Request validation failed',
            ErrorCode.VALIDATION_ERROR,
            issues,
          );
        }

        // Express 5 makes req.query a getter; assign defensively.
        Object.defineProperty(req, source, {
          value: result.data,
          writable: true,
          configurable: true,
          enumerable: true,
        });
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

export type ValidatedBody<T extends ZodTypeAny> = z.infer<T>;
