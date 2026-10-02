import { HttpException, HttpStatus } from '@nestjs/common';

export enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  UNAUTHORIZED = 'UNAUTHORIZED',
  INVALID_TOKEN = 'INVALID_TOKEN',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  USERNAME_TAKEN = 'USERNAME_TAKEN',
  REGISTRATION_EXPIRED = 'REGISTRATION_EXPIRED',
  INVALID_GAME_EVENT = 'INVALID_GAME_EVENT',
  UNKNOWN_GAME = 'UNKNOWN_GAME',
  RATE_LIMITED = 'RATE_LIMITED',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  DATABASE_ERROR = 'DATABASE_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
}

export interface ApiErrorBody {
  success: false;
  error: {
    code: ErrorCode | string;
    message: string;
    details?: unknown;
  };
}

/**
 * Application-level HTTP exception that always renders through the
 * { success:false, error:{ code, message, details } } envelope.
 */
export class ApiException extends HttpException {
  constructor(
    public readonly code: ErrorCode | string,
    message: string,
    status: HttpStatus,
    details?: unknown,
  ) {
    super({ success: false, error: { code, message, details } }, status);
  }

  static validation(message = 'Please correct the highlighted fields.', details?: unknown) {
    return new ApiException(ErrorCode.VALIDATION_ERROR, message, HttpStatus.BAD_REQUEST, details);
  }

  static unauthorized(message = 'Authentication required') {
    return new ApiException(ErrorCode.UNAUTHORIZED, message, HttpStatus.UNAUTHORIZED);
  }

  static userNotFound() {
    // Exact copy required by the product spec for failed logins.
    return new ApiException(ErrorCode.USER_NOT_FOUND, 'User Does Not Exist - Try Again', HttpStatus.NOT_FOUND);
  }

  static notFound(message = 'Resource not found') {
    return new ApiException(ErrorCode.NOT_FOUND, message, HttpStatus.NOT_FOUND);
  }

  static conflict(code: ErrorCode, message: string) {
    return new ApiException(code, message, HttpStatus.CONFLICT);
  }

  static internal(message = 'Something went wrong on our side', details?: unknown) {
    return new ApiException(ErrorCode.INTERNAL_ERROR, message, HttpStatus.INTERNAL_SERVER_ERROR, details);
  }

  static unavailable(message = 'Service temporarily unavailable') {
    return new ApiException(ErrorCode.SERVICE_UNAVAILABLE, message, HttpStatus.SERVICE_UNAVAILABLE);
  }
}
