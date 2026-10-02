import { registerAs } from '@nestjs/config';

export interface AppConfig {
  env: 'development' | 'production' | 'test';
  port: number;
  apiPrefix: string;
  dataStore: 'memory' | 'firestore';
  sessionTtlHours: number;
  pendingRegistrationTtlMinutes: number;
  corsOrigins: string[];
  trustProxy: boolean;
  rateLimit: {
    windowMs: number;
    authMax: number;
    eventMax: number;
  };
}

export default registerAs(
  'app',
  (): AppConfig => {
    const env = (process.env.NODE_ENV ?? 'development') as AppConfig['env'];
    return {
      env,
      port: parseInt(process.env.PORT ?? '3001', 10),
      apiPrefix: process.env.API_PREFIX ?? 'api',
      dataStore: (process.env.DATA_STORE ?? 'memory') as 'memory' | 'firestore',
      sessionTtlHours: parseInt(process.env.SESSION_TTL_HOURS ?? '24', 10),
      pendingRegistrationTtlMinutes: parseInt(
        process.env.PENDING_TTL_MINUTES ?? '30',
        10,
      ),
      corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://localhost:3000')
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
      trustProxy: process.env.TRUST_PROXY === 'true',
      rateLimit: {
        windowMs: parseInt(process.env.RL_WINDOW_MS ?? '60000', 10),
        authMax: parseInt(process.env.RL_AUTH_MAX ?? '20', 10),
        eventMax: parseInt(process.env.RL_EVENT_MAX ?? '300', 10),
      },
    };
  },
);
