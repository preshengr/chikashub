import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from '../common/decorators/public.decorator';
import { SessionUser, SessionUserParam } from '../common/decorators/session-user.decorator';
import { RateLimit } from '../common/guards/rate-limit.guard';
import {
  ConfirmRegistrationDto,
  DenyRegistrationDto,
  LoginDto,
  RegisterDto,
} from './dto/auth.dto';
import { SessionService } from '../common/session.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
  ) {}

  /** POST /auth/register - validate form data, stage profile, generate username. */
  @Public()
  @RateLimit('auth')
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  /** POST /auth/register/confirm - "Accept" activates the account + opens a session. */
  @Public()
  @RateLimit('auth')
  @Post('register/confirm')
  confirm(@Body() dto: ConfirmRegistrationDto) {
    return this.auth.confirm(dto);
  }

  /** POST /auth/register/deny - "Deny" removes the staged profile. */
  @Public()
  @RateLimit('auth')
  @HttpCode(200)
  @Post('register/deny')
  async deny(@Body() dto: DenyRegistrationDto) {
    const username = dto.username.trim().toLowerCase();
    const removed = await this.auth.deny(username);
    return { username, removed };
  }

  /** POST /auth/login - validate username against the database. */
  @Public()
  @RateLimit('auth')
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  /** GET /auth/me - current session profile (used to restore state). */
  @Get('me')
  me(@SessionUserParam() user: SessionUser) {
    return this.auth.getProfile(user.username);
  }

  /** POST /auth/logout - revoke the current session token. */
  @HttpCode(200)
  @Post('logout')
  async logout(@SessionUserParam() user: SessionUser) {
    await this.sessions.revokeByHash(user.tokenIdHash);
    return { loggedOut: true };
  }
}
