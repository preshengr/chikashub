import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import appConfig, { assertProductionConfig, type AppConfig } from './config/configuration';

/**
 * Bootstrap the NestJS HTTP server.
 *
 * - helmet: security headers (CSP disabled for the JSON API; the gateway
 *   serves HTML with its own CSP)
 * - CORS: restricted to the configured frontend origins
 * - global prefix: all routes live under /api (API_PREFIX)
 * - trust proxy: honours X-Forwarded-For only when explicitly enabled
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  assertProductionConfig(process.env);

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });

  // registerAs() factories are registered as providers under their KEY token.
  const config = app.get<AppConfig>(appConfig.KEY as string);
  const { port, apiPrefix, corsOrigins, trustProxy, env } = config;

  if (env === 'production' && process.env.CORS_ORIGINS === undefined) {
    logger.warn(
      'CORS_ORIGINS is unset — falling back to localhost origins. Set it to your ' +
        'frontend origin (e.g. https://<site>.up.railway.app) when the browser calls ' +
        'this API cross-origin.',
    );
  }

  app.setGlobalPrefix(apiPrefix);
  app.enableShutdownHooks();

  app.use(
    helmet({
      contentSecurityPolicy: false, // API returns JSON only
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  app.enableCors({
    origin: corsOrigins,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 86_400,
  });

  if (trustProxy) {
    const instance = app.getHttpAdapter().getInstance() as {
      set(key: string, value: unknown): void;
    };
    instance.set('trust proxy', true);
    logger.log('Trusting X-Forwarded-For (TRUST_PROXY=true)');
  }

  await app.listen(port, '0.0.0.0');
  logger.log(`Chika's Game Hub API (${env}) listening on http://localhost:${port}/${apiPrefix}`);
}

void (async () => {
  try {
    await bootstrap();
  } catch (err) {
    // Never leave a half-booted process running.
    // eslint-disable-next-line no-console
    console.error('Fatal error during bootstrap:', err);
    process.exit(1);
  }
})();

process.on('unhandledRejection', (reason) => {
  // eslint-disable-next-line no-console
  console.error('Unhandled promise rejection:', reason);
});

process.on('uncaughtException', (err) => {
  // eslint-disable-next-line no-console
  console.error('Uncaught exception:', err);
  process.exit(1);
});

export { bootstrap };
