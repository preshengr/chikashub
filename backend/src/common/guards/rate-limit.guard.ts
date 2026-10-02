import { SetMetadata, applyDecorators, CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiException, ErrorCode } from '../api-error';

export type RateLimitScope = 'auth' | 'event';

export const RATE_LIMIT_KEY = 'rateLimitScope';
export const RateLimit = (scope: RateLimitScope) => SetMetadata(RATE_LIMIT_KEY, scope);

interface Bucket {
  hits: number[];
}

/**
 * Fixed-window in-memory rate limiter (per client IP + scope).
 * Deliberately dependency-free and process-local; for horizontal deployments
 * swap it for a shared store (Redis) behind the same guard interface.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);
  private readonly buckets = new Map<string, Bucket>();
  private lastSweep = Date.now();

  constructor(private readonly reflector: Reflector) {}

  private limits(): { windowMs: number; authMax: number; eventMax: number } {
    return {
      windowMs: parseInt(process.env.RL_WINDOW_MS ?? '60000', 10),
      authMax: parseInt(process.env.RL_AUTH_MAX ?? '20', 10),
      eventMax: parseInt(process.env.RL_EVENT_MAX ?? '300', 10),
    };
  }

  canActivate(context: ExecutionContext): boolean {
    const scope = this.reflector.getAllAndOverride<RateLimitScope | undefined>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!scope) return true;

    const request = context.switchToHttp().getRequest<{ ip?: string; headers: Record<string, unknown> }>();
    const ip = clientIp(request);
    const { windowMs, authMax, eventMax } = this.limits();
    const max = scope === 'auth' ? authMax : eventMax;
    const key = `${scope}:${ip}`;
    const now = Date.now();

    this.sweep(now, windowMs);

    const bucket = this.buckets.get(key) ?? { hits: [] };
    bucket.hits = bucket.hits.filter((t) => now - t < windowMs);
    if (bucket.hits.length >= max) {
      this.buckets.set(key, bucket);
      this.logger.warn(`Rate limit exceeded for ${key} (${bucket.hits.length}/${max})`);
      throw new ApiException(
        ErrorCode.RATE_LIMITED,
        'Too many requests. Please wait a moment and try again.',
        429,
      );
    }
    bucket.hits.push(now);
    this.buckets.set(key, bucket);
    return true;
  }

  private sweep(now: number, windowMs: number): void {
    if (now - this.lastSweep < windowMs) return;
    this.lastSweep = now;
    for (const [key, bucket] of this.buckets) {
      const fresh = bucket.hits.filter((t) => now - t < windowMs);
      if (fresh.length === 0) this.buckets.delete(key);
      else bucket.hits = fresh;
    }
  }
}

function clientIp(req: { ip?: string; headers: Record<string, unknown> }): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip ?? 'unknown';
}
