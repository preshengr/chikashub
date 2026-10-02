import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * Wraps successful payloads in { success:true, data } so the frontend
 * has one consistent response shape for both success and failure paths.
 * Explicit `raw: true` responses (e.g. health checks) pass through untouched.
 */
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((payload) => {
        if (payload && typeof payload === 'object' && 'raw' in (payload as object)) {
          return payload;
        }
        return { success: true, data: payload };
      }),
    );
  }
}
