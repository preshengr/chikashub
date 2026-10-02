import express, { type Express, type Request, type Response } from 'express';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

export interface GatewayOptions {
  /** Directory of the built frontend (frontend/dist). */
  frontendDir: string;
  /** Base URL of the NestJS backend, e.g. http://localhost:3001 */
  apiTarget: string;
  /** Vite dev server used when the frontend has not been built yet. */
  devTarget?: string;
  /** Serve cache headers for static assets. */
  staticMaxAgeSec?: number;
}

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

function securityHeaders(res: Response): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
}

function gatewayError(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({
    success: false,
    error: { code, message, details: [] },
  });
}

/**
 * Streams the incoming request to another HTTP service, preserving method,
 * headers and body. Used for /api/* and for the Vite dev fallback.
 */
function proxy(
  req: Request,
  res: Response,
  target: string,
  onUnavailable: () => void,
): void {
  let targetUrl: URL;
  try {
    targetUrl = new URL(req.originalUrl || req.url || '/', target);
  } catch {
    onUnavailable();
    return;
  }

  const headers: Record<string, string | string[] | undefined> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (HOP_BY_HOP.has(key.toLowerCase())) continue;
    headers[key] = value;
  }
  headers.host = targetUrl.host;

  const upstream = http.request(
    {
      protocol: targetUrl.protocol,
      hostname: targetUrl.hostname,
      port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
      path: `${targetUrl.pathname}${targetUrl.search}`,
      method: req.method,
      headers,
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    },
  );

  upstream.on('error', () => {
    if (!res.headersSent) onUnavailable();
    else res.end();
  });

  req.pipe(upstream);
}

const HTML_ROUTES = new Map<string, string>([
  ['/', 'index.html'],
  ['/index', 'index.html'],
  ['/login', 'login.html'],
  ['/register', 'register.html'],
  ['/dashboard', 'dashboard.html'],
]);

export function createGateway(options: GatewayOptions): Express {
  const { frontendDir, apiTarget, devTarget } = options;
  const maxAge = options.staticMaxAgeSec ?? 3600;
  const app = express();
  app.disable('x-powered-by');

  app.use((_req, res, next) => {
    securityHeaders(res);
    next();
  });

  app.use('/api', (req, res) => {
    proxy(req, res, apiTarget, () => {
      gatewayError(
        res,
        502,
        'GATEWAY_UPSTREAM_UNAVAILABLE',
        'The game server is not responding. Please try again in a moment.',
      );
    });
  });

  const distExists = fs.existsSync(path.join(frontendDir, 'index.html'));
  if (distExists) {
    app.use(
      express.static(frontendDir, {
        index: false,
        maxAge,
        setHeaders: (res, filePath) => {
          if (/\.(html)$/i.test(filePath)) res.setHeader('Cache-Control', 'no-cache');
        },
      }),
    );

    app.use((req, res) => {
      const clean = req.path.split('?')[0];
      const route = HTML_ROUTES.get(clean);
      if (route) {
        res.sendFile(path.join(frontendDir, route));
        return;
      }
      if (/\.[a-z0-9]+$/i.test(clean)) {
        res.status(404).type('text').send('Not found');
        return;
      }
      const asHtml = path.join(frontendDir, `${clean.replace(/^\//, '')}.html`);
      if (fs.existsSync(asHtml)) {
        res.sendFile(asHtml);
        return;
      }
      res.sendFile(path.join(frontendDir, 'index.html'));
    });
  } else if (devTarget) {
    app.use((req, res) => {
      proxy(req, res, devTarget, () => {
        res
          .status(503)
          .type('text')
          .send('Frontend not built and the dev server is offline. Run `npm run dev`.');
      });
    });
  } else {
    app.use((_req, res) => {
      res
        .status(503)
        .type('text')
        .send('Frontend build missing. Run `npm run build` first.');
    });
  }

  return app;
}

export interface RunningGateway {
  server: http.Server;
  port: number;
  close(): Promise<void>;
}

export function startGateway(
  options: GatewayOptions & { port: number; host?: string },
): Promise<RunningGateway> {
  const app = createGateway(options);
  return new Promise((resolve, reject) => {
    const server = app.listen(options.port, options.host ?? '0.0.0.0', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : options.port;
      resolve({
        server,
        port,
        close: () =>
          new Promise<void>((done, fail) => server.close((err) => (err ? fail(err) : done()))),
      });
    });
    server.on('error', reject);
  });
}

async function main(): Promise<void> {
  const port = Number(process.env.PORT ?? 3000);
  const apiTarget = process.env.API_TARGET ?? 'http://localhost:3001';
  const devTarget = process.env.DEV_TARGET ?? 'http://localhost:5173';
  const frontendDir =
    process.env.FRONTEND_DIR ?? path.resolve(__dirname, '..', '..', 'frontend', 'dist');

  const gateway = await startGateway({ port, apiTarget, devTarget, frontendDir });
  const mode = fs.existsSync(path.join(frontendDir, 'index.html')) ? 'static' : 'dev-proxy';
  console.log(`[gateway] listening on http://localhost:${gateway.port} (${mode})`);
  console.log(`[gateway] /api -> ${apiTarget}`);

  const shutdown = (): void => {
    void gateway.close().then(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error('[gateway] failed to start', error);
    process.exit(1);
  });
}
