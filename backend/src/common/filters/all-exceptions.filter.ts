import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger as NestLogger,
} from '@nestjs/common';
import type { Response, Request } from 'express';
import { ApiException, ErrorCode } from '../api-error';

interface ValidationDetail {
  field: string;
  message: string;
}

/**
 * Normalizes every thrown error into the API envelope:
 *   { success:false, error:{ code, message, details? } }
 * while logging enough context (path, method, status, stack) for debugging.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new NestLogger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: string = ErrorCode.INTERNAL_ERROR;
    let message = 'Something went wrong on our side';
    let details: unknown;

    if (exception instanceof ApiException) {
      const body = exception.getResponse() as { error: { code: string; message: string; details?: unknown } };
      status = exception.getStatus();
      code = body.error.code;
      message = body.error.message;
      details = body.error.details;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
        code = statusToCode(status);
      } else if (typeof body === 'object' && body !== null) {
        const b = body as Record<string, unknown>;
        message = typeof b.message === 'string' ? b.message : exception.message;
        code = statusToCode(status);
        if (Array.isArray(b.message)) {
          code = ErrorCode.VALIDATION_ERROR;
          details = b.message;
          message = 'Please correct the highlighted fields.';
        }
      }
    } else if (exception instanceof Error) {
      message = exception.message || message;
    }

    const logPayload = {
      path: request.url,
      method: request.method,
      status,
      code,
      message,
      stack: exception instanceof Error ? exception.stack : undefined,
    };

    if (status >= 500) {
      this.logger.error(`Unhandled error ${status} ${code}: ${message}`, JSON.stringify(logPayload));
    } else {
      this.logger.warn(`Request error ${status} ${code}: ${message} (${request.method} ${request.url})`);
    }

    if (!response.headersSent) {
      response.status(status).json({ success: false, error: { code, message, details } });
    }
  }
}

function statusToCode(status: number): string {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return ErrorCode.VALIDATION_ERROR;
    case HttpStatus.UNAUTHORIZED:
      return ErrorCode.UNAUTHORIZED;
    case HttpStatus.NOT_FOUND:
      return ErrorCode.NOT_FOUND;
    case HttpStatus.CONFLICT:
      return ErrorCode.CONFLICT;
    case HttpStatus.TOO_MANY_REQUESTS:
      return ErrorCode.RATE_LIMITED;
    case HttpStatus.SERVICE_UNAVAILABLE:
      return ErrorCode.SERVICE_UNAVAILABLE;
    default:
      return status >= 500 ? ErrorCode.INTERNAL_ERROR : ErrorCode.NOT_FOUND;
  }
}
