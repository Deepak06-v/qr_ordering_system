import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Wraps an async route handler so rejected promises reach the Express error
 * middleware instead of becoming unhandled rejections.
 */
export function asyncHandler<
  TRequest extends Request = Request,
  TResponse extends Response = Response,
>(
  handler: (req: TRequest, res: TResponse, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    void Promise.resolve(handler(req as TRequest, res as TResponse, next)).catch(next);
  };
}
