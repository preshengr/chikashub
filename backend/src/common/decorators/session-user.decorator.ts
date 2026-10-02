import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface SessionUser {
  username: string;
  childId: string;
  tokenIdHash: string;
}

/**
 * Injects the authenticated session user (populated by SessionGuard).
 */
export const SessionUserParam = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): SessionUser => {
    const request = ctx.switchToHttp().getRequest<{ sessionUser?: SessionUser }>();
    return request.sessionUser as SessionUser;
  },
);
