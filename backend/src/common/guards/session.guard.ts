import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger as NestLogger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ApiException } from '../api-error';
import { SessionService, type SessionUser } from '../session.service';

@Injectable()
export class SessionGuard implements CanActivate {
  private readonly logger = new NestLogger(SessionGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request & { sessionUser?: SessionUser }>();
    const header = request.headers['authorization'];
    const match = typeof header === 'string' ? /^Bearer\s+(.+)$/i.exec(header.trim()) : null;
    if (!match) {
      throw ApiException.unauthorized('Missing bearer token. Please log in.');
    }
    try {
      request.sessionUser = await this.sessions.validate(match[1]);
      return true;
    } catch (err) {
      if (err instanceof ApiException) throw err;
      this.logger.error(`Session validation failed: ${(err as Error).message}`);
      throw ApiException.unauthorized();
    }
  }
}
