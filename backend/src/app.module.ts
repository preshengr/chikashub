import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import appConfig from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { CommonModule } from './common/common.module';
import { AuthModule } from './auth/auth.module';
import { GameModule } from './game/game.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { SessionGuard } from './common/guards/session.guard';
import { RateLimitGuard } from './common/guards/rate-limit.guard';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseEnvelopeInterceptor } from './common/interceptors/response-envelope.interceptor';
import { validationExceptionFactory } from './common/validation';

/**
 * Application composition root.
 *
 * Global pipeline (applies to every route):
 *   guards      RateLimitGuard -> SessionGuard   (auth + abuse protection)
 *   interceptor ResponseEnvelopeInterceptor      ({ success, data } envelope)
 *   filter      AllExceptionsFilter              ({ success, error } envelope)
 *   pipe        ValidationPipe + whitelist       (class-validator DTOs)
 *
 * Routes opt out of authentication with @Public(), and opt into abuse
 * protection with @RateLimit('auth' | 'event').
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
      cache: true,
    }),
    DatabaseModule,
    CommonModule,
    AuthModule,
    GameModule,
    DashboardModule,
  ],
  providers: [
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: false,
        validateCustomDecorators: true,
        exceptionFactory: validationExceptionFactory,
      }),
    },
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
