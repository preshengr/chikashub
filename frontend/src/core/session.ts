import type { FullProfile } from './types';

export const SESSION_KEY = 'chika.session';

export interface SessionState {
  username: string;
  token: string;
  expiresAt: string;
  profile: FullProfile;
}

const memoryStore = new Map<string, string>();
let storageAvailable: boolean | null = null;

function storage(): Storage | null {
  if (storageAvailable !== null) return storageAvailable ? window.localStorage : null;
  try {
    const probe = '__chika_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    storageAvailable = true;
  } catch {
    storageAvailable = false;
  }
  return storageAvailable ? window.localStorage : null;
}

/** Read raw value from localStorage, falling back to an in-memory store. */
export function readRaw(key: string): string | null {
  try {
    const store = storage();
    const value = store ? store.getItem(key) : memoryStore.get(key) ?? null;
    return value;
  } catch {
    return memoryStore.get(key) ?? null;
  }
}

/** Persist raw value (memory-only when localStorage is unavailable). */
export function writeRaw(key: string, value: string): boolean {
  memoryStore.set(key, value);
  try {
    const store = storage();
    if (!store) return false;
    store.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function removeRaw(key: string): void {
  memoryStore.delete(key);
  try {
    storage()?.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function isPersistentStorageAvailable(): boolean {
  return storage() !== null;
}

function isExpired(session: SessionState): boolean {
  if (!session.expiresAt) return false;
  const expires = Date.parse(session.expiresAt);
  if (Number.isNaN(expires)) return false;
  // Small skew so navigation never lands on a token that dies mid-request.
  return expires <= Date.now() + 30_000;
}

export function loadSession(): SessionState | null {
  const raw = readRaw(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SessionState;
    if (!parsed?.username || !parsed?.token || !parsed?.profile) {
      clearSession();
      return null;
    }
    if (isExpired(parsed)) {
      clearSession();
      return null;
    }
    return parsed;
  } catch {
    clearSession();
    return null;
  }
}

export function saveSession(state: SessionState): void {
  writeRaw(SESSION_KEY, JSON.stringify(state));
}

export function updateProfile(profile: FullProfile): SessionState | null {
  const current = loadSession();
  if (!current) return null;
  const next: SessionState = { ...current, profile };
  saveSession(next);
  return next;
}

export function clearSession(): void {
  removeRaw(SESSION_KEY);
}

export function getToken(): string | null {
  return loadSession()?.token ?? null;
}

export function isAuthenticated(): boolean {
  return loadSession() !== null;
}

/** Redirects to login.html when there is no usable session (returns false). */
export function requireSession(redirectTarget = 'login.html'): boolean {
  if (isAuthenticated()) return true;
  const target = encodeURIComponent(`${window.location.pathname.split('/').pop() ?? 'dashboard.html'}${window.location.search}`);
  window.location.assign(`${redirectTarget}?next=${target}&reason=auth`);
  return false;
}

export function logout(): void {
  clearSession();
}
