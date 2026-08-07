/**
 * All errors thrown by API functions are instances of ApiError.
 * Network errors (no response) still produce an ApiError with status 0.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  override readonly message: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.message = message;
  }
}

export const API_ERROR_CODES = {
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  EMAIL_ALREADY_EXISTS: 'EMAIL_ALREADY_EXISTS',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  INVALID_START_TIME: 'INVALID_START_TIME',
  TIER_FULLY_BOOKED: 'TIER_FULLY_BOOKED',
  PROMOTION_EXHAUSTED: 'PROMOTION_EXHAUSTED',
  INVALID_BOOKING_STATUS: 'INVALID_BOOKING_STATUS',
  BOOKING_NOT_FOUND: 'BOOKING_NOT_FOUND',
  PAYMENT_NOT_FOUND: 'PAYMENT_NOT_FOUND',
  INVALID_SIGNATURE: 'INVALID_SIGNATURE',
  OWNER_KYC_INCOMPLETE: 'OWNER_KYC_INCOMPLETE',
  CAFE_NOT_FOUND: 'CAFE_NOT_FOUND',
  TIER_NOT_FOUND: 'TIER_NOT_FOUND',
  INVALID_PRICE: 'INVALID_PRICE',
  INVALID_SEATS: 'INVALID_SEATS',
  FORBIDDEN: 'FORBIDDEN',
  UNAUTHORIZED: 'UNAUTHORIZED',
} as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}
