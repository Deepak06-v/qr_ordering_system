/**
 * Canonical, machine readable API error codes.
 * These are part of the public contract: clients may branch on `error.code`.
 */
export const ErrorCode = {
  INVALID_REQUEST: 'INVALID_REQUEST',
  VALIDATION_ERROR: 'VALIDATION_ERROR',

  THEATER_NOT_FOUND: 'THEATER_NOT_FOUND',
  THEATER_INACTIVE: 'THEATER_INACTIVE',
  THEATER_DUPLICATE: 'THEATER_DUPLICATE',

  QR_NOT_FOUND: 'QR_NOT_FOUND',
  QR_INACTIVE: 'QR_INACTIVE',
  DUPLICATE_QR: 'DUPLICATE_QR',
  INVALID_SEAT: 'INVALID_SEAT',
  INVALID_SEAT_HASH: 'INVALID_SEAT_HASH',

  MENU_ITEM_NOT_FOUND: 'MENU_ITEM_NOT_FOUND',
  MENU_ITEM_UNAVAILABLE: 'MENU_ITEM_UNAVAILABLE',
  MENU_ITEM_WRONG_THEATER: 'MENU_ITEM_WRONG_THEATER',
  DUPLICATE_MENU_ITEM: 'DUPLICATE_MENU_ITEM',

  ORDER_NOT_FOUND: 'ORDER_NOT_FOUND',
  ORDER_EMPTY: 'ORDER_EMPTY',
  ORDER_NOT_PAYABLE: 'ORDER_NOT_PAYABLE',
  ORDER_ALREADY_PAID: 'ORDER_ALREADY_PAID',
  INVALID_STATUS_TRANSITION: 'INVALID_STATUS_TRANSITION',
  ORDER_CANCELLED: 'ORDER_CANCELLED',

  PAYMENT_NOT_FOUND: 'PAYMENT_NOT_FOUND',
  PAYMENT_ALREADY_COMPLETED: 'PAYMENT_ALREADY_COMPLETED',
  PAYMENT_AMOUNT_MISMATCH: 'PAYMENT_AMOUNT_MISMATCH',
  PAYMENT_WRONG_ORDER: 'PAYMENT_WRONG_ORDER',
  PAYMENT_NOT_PENDING: 'PAYMENT_NOT_PENDING',
  INVALID_PAYMENT: 'INVALID_PAYMENT',
  PAYMENT_PROVIDER_UNAVAILABLE: 'PAYMENT_PROVIDER_UNAVAILABLE',
  PIN_INVALID: 'PIN_INVALID',
  PIN_NOT_ACTIVE: 'PIN_NOT_ACTIVE',

  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  RATE_LIMITED: 'RATE_LIMITED',
  DATABASE_UNAVAILABLE: 'DATABASE_UNAVAILABLE',
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ApiErrorBody {
  success: false;
  error: {
    code: ErrorCodeValue;
    message: string;
    /** Present only when the client sent a valid inbound `X-Request-Id`. */
    requestId?: string;
    details?: unknown;
  };
}

/**
 * Operational error that is safe to surface to the client.
 * Anything that is *not* an ApiError is treated as an unexpected fault and
 * reported as INTERNAL_SERVER_ERROR without leaking internals in production.
 */
export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCodeValue;
  public readonly details: unknown;
  public readonly isOperational = true;

  constructor(statusCode: number, code: ErrorCodeValue, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, ApiError);
  }

  static badRequest(
    message: string,
    code: ErrorCodeValue = ErrorCode.INVALID_REQUEST,
    details?: unknown,
  ): ApiError {
    return new ApiError(400, code, message, details);
  }

  static notFound(message: string, code: ErrorCodeValue = ErrorCode.INVALID_REQUEST): ApiError {
    return new ApiError(404, code, message);
  }

  static conflict(message: string, code: ErrorCodeValue = ErrorCode.DUPLICATE_QR): ApiError {
    return new ApiError(409, code, message);
  }

  /** 410 Gone - the resource existed but is permanently retired (inactive QR). */
  static gone(message: string, code: ErrorCodeValue = ErrorCode.QR_INACTIVE): ApiError {
    return new ApiError(410, code, message);
  }

  static internal(message = 'Internal server error'): ApiError {
    return new ApiError(500, ErrorCode.INTERNAL_SERVER_ERROR, message);
  }
}
