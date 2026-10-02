import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadApiBase(): Promise<string> {
  vi.resetModules();
  const mod = await import('../src/core/api');
  return mod.API_BASE;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('API_BASE resolution', () => {
  it('defaults to /api when VITE_API_BASE is unset', async () => {
    vi.stubEnv('VITE_API_BASE', '');
    expect(await loadApiBase()).toBe('/api');
  });

  it('appends /api to a bare backend origin', async () => {
    vi.stubEnv('VITE_API_BASE', 'https://backend.up.railway.app');
    expect(await loadApiBase()).toBe('https://backend.up.railway.app/api');
  });

  it('accepts a full API base and strips trailing slashes', async () => {
    vi.stubEnv('VITE_API_BASE', 'https://backend.up.railway.app/api/');
    expect(await loadApiBase()).toBe('https://backend.up.railway.app/api');
  });

  it('ignores whitespace', async () => {
    vi.stubEnv('VITE_API_BASE', '  https://api.example.com  ');
    expect(await loadApiBase()).toBe('https://api.example.com/api');
  });
});
