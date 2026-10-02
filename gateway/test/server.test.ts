import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';
import { createGateway } from '../src/server';

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (typeof address === 'object' && address) resolve(address.port);
      else reject(new Error('no port'));
    });
    server.on('error', reject);
  });
}

let backend: http.Server;
let backendPort = 0;
let backendUp = true;
let lastRequest: { method?: string; url?: string; auth?: string; body?: string } = {};

let frontendDir = '';

before(async () => {
  backend = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      if (!backendUp) {
        res.destroy();
        return;
      }
      lastRequest = {
        method: req.method,
        url: req.url,
        auth: req.headers.authorization,
        body: Buffer.concat(chunks).toString('utf8'),
      };
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ success: true, data: { echo: req.url } }));
    });
  });
  backendPort = await listen(backend);

  frontendDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chika-gateway-'));
  fs.writeFileSync(path.join(frontendDir, 'index.html'), '<html><body>LANDING</body></html>');
  fs.writeFileSync(path.join(frontendDir, 'login.html'), '<html><body>LOGIN</body></html>');
  fs.writeFileSync(path.join(frontendDir, 'dashboard.html'), '<html><body>DASH</body></html>');
  fs.mkdirSync(path.join(frontendDir, 'assets'));
  fs.writeFileSync(path.join(frontendDir, 'assets', 'app.js'), 'console.log(1)');
});

after(async () => {
  await new Promise<void>((resolve) => backend.close(() => resolve()));
  fs.rmSync(frontendDir, { recursive: true, force: true });
});

function withGateway(): Promise<{ port: number; close: () => Promise<void> }> {
  const app = createGateway({
    frontendDir,
    apiTarget: `http://127.0.0.1:${backendPort}`,
  });
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({
        port,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
    server.on('error', reject);
  });
}

test('serves the landing page at /', async () => {
  const gateway = await withGateway();
  try {
    const response = await fetch(`http://127.0.0.1:${gateway.port}/`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /LANDING/);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('x-frame-options'), 'SAMEORIGIN');
  } finally {
    await gateway.close();
  }
});

test('serves named routes and static assets, 404s missing files', async () => {
  const gateway = await withGateway();
  try {
    const base = `http://127.0.0.1:${gateway.port}`;
    assert.match(await (await fetch(`${base}/login`)).text(), /LOGIN/);
    assert.match(await (await fetch(`${base}/dashboard`)).text(), /DASH/);
    assert.equal((await fetch(`${base}/assets/app.js`)).status, 200);
    assert.equal((await fetch(`${base}/assets/missing.css`)).status, 404);
  } finally {
    await gateway.close();
  }
});

test('proxies /api requests to the backend with headers and body intact', async () => {
  const gateway = await withGateway();
  try {
    const response = await fetch(`http://127.0.0.1:${gateway.port}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer tok_1' },
      body: JSON.stringify({ username: 'chi12345' }),
    });
    assert.equal(response.status, 200);
    const payload = (await response.json()) as { success: boolean; data: { echo: string } };
    assert.equal(payload.success, true);
    assert.equal(payload.data.echo, '/api/auth/login');
    assert.equal(lastRequest.method, 'POST');
    assert.equal(lastRequest.auth, 'Bearer tok_1');
    assert.equal(lastRequest.body, JSON.stringify({ username: 'chi12345' }));
  } finally {
    await gateway.close();
  }
});

test('answers with a typed envelope when the backend is unavailable', async () => {
  const gateway = await withGateway();
  const previous = backendUp;
  backendUp = false;
  try {
    const response = await fetch(`http://127.0.0.1:${gateway.port}/api/games`);
    assert.equal(response.status, 502);
    const payload = (await response.json()) as {
      success: boolean;
      error: { code: string; message: string };
    };
    assert.equal(payload.success, false);
    assert.equal(payload.error.code, 'GATEWAY_UPSTREAM_UNAVAILABLE');
  } finally {
    backendUp = previous;
    await gateway.close();
  }
});
