import { readRaw, removeRaw, writeRaw } from './session';

export const PROGRESS_PREFIX = 'chika.progress.';
export const PROGRESS_VERSION = 1;
export const STORAGE_QUOTA_FALLBACK_BYTES = 5 * 1024 * 1024;

export interface StoredGameState {
  maxLevel: number;
  bestScore: number;
  failures: number;
  completions: number;
  lastPlayedAt: string;
  levels: number[];
}

export interface ProgressStore {
  version: number;
  updatedAt: string;
  games: Record<string, StoredGameState>;
}

export interface QuotaInfo {
  usedBytes: number;
  quotaBytes: number;
  percent: number;
  source: 'navigator' | 'estimated';
}

const memoryOnly: Record<string, ProgressStore> = {};

function progressKey(username: string): string {
  return `${PROGRESS_PREFIX}${username}`;
}

export function emptyStore(): ProgressStore {
  return { version: PROGRESS_VERSION, updatedAt: new Date().toISOString(), games: {} };
}

function sanitize(value: unknown): ProgressStore {
  if (!value || typeof value !== 'object') return emptyStore();
  const candidate = value as Partial<ProgressStore>;
  const games: Record<string, StoredGameState> = {};
  if (candidate.games && typeof candidate.games === 'object') {
    for (const [gameId, raw] of Object.entries(candidate.games as Record<string, unknown>)) {
      const g = raw as Partial<StoredGameState> | null;
      if (!g || typeof g !== 'object') continue;
      games[gameId] = {
        maxLevel: clampInt(g.maxLevel, 0, 10_000),
        bestScore: clampInt(g.bestScore, 0, 10_000_000),
        failures: clampInt(g.failures, 0, 1_000_000),
        completions: clampInt(g.completions, 0, 10_000),
        lastPlayedAt: typeof g.lastPlayedAt === 'string' ? g.lastPlayedAt : new Date().toISOString(),
        levels: Array.isArray(g.levels)
          ? g.levels.filter((n) => Number.isInteger(n)).slice(0, 10_000)
          : [],
      };
    }
  }
  return { version: PROGRESS_VERSION, updatedAt: candidate.updatedAt ?? new Date().toISOString(), games };
}

function clampInt(value: unknown, min: number, max: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : min;
  return Math.min(Math.max(n, min), max);
}

/** Load the on-device progress for a username (never throws). */
export function loadProgress(username: string): ProgressStore {
  if (!username) return emptyStore();
  try {
    const raw = readRaw(progressKey(username));
    if (raw) return sanitize(JSON.parse(raw));
  } catch {
    /* corrupted data is replaced with an empty store */
  }
  if (memoryOnly[username]) return memoryOnly[username];
  return emptyStore();
}

function persist(username: string, store: ProgressStore): boolean {
  store.updatedAt = new Date().toISOString();
  memoryOnly[username] = store;
  return writeRaw(progressKey(username), JSON.stringify(store));
}

/** Record that a game was launched for the first time. */
export function recordStart(username: string, gameId: string): ProgressStore {
  const store = loadProgress(username);
  const entry = (store.games[gameId] ??= {
    maxLevel: 0,
    bestScore: 0,
    failures: 0,
    completions: 0,
    lastPlayedAt: new Date().toISOString(),
    levels: [],
  });
  entry.lastPlayedAt = new Date().toISOString();
  persist(username, store);
  return store;
}

/** Record a completed level: returns the updated store. */
export function recordLevelComplete(
  username: string,
  gameId: string,
  level: number,
  score: number,
): ProgressStore {
  const store = loadProgress(username);
  const entry = (store.games[gameId] ??= {
    maxLevel: 0,
    bestScore: 0,
    failures: 0,
    completions: 0,
    lastPlayedAt: new Date().toISOString(),
    levels: [],
  });
  entry.maxLevel = Math.max(entry.maxLevel, level);
  entry.bestScore = Math.max(entry.bestScore, score);
  if (!entry.levels.includes(level)) entry.levels.push(level);
  entry.levels.sort((a, b) => a - b);
  entry.lastPlayedAt = new Date().toISOString();
  persist(username, store);
  return store;
}

export function recordFailure(username: string, gameId: string): ProgressStore {
  const store = loadProgress(username);
  const entry = (store.games[gameId] ??= {
    maxLevel: 0,
    bestScore: 0,
    failures: 0,
    completions: 0,
    lastPlayedAt: new Date().toISOString(),
    levels: [],
  });
  entry.failures += 1;
  entry.lastPlayedAt = new Date().toISOString();
  persist(username, store);
  return store;
}

export function recordCompletion(username: string, gameId: string, score: number): ProgressStore {
  const store = loadProgress(username);
  const entry = (store.games[gameId] ??= {
    maxLevel: 0,
    bestScore: 0,
    failures: 0,
    completions: 0,
    lastPlayedAt: new Date().toISOString(),
    levels: [],
  });
  entry.completions += 1;
  entry.bestScore = Math.max(entry.bestScore, score);
  entry.lastPlayedAt = new Date().toISOString();
  persist(username, store);
  return store;
}

export function getGameState(username: string, gameId: string): StoredGameState | null {
  return loadProgress(username).games[gameId] ?? null;
}

/** Remove every stored level for one user (no backup - matches the reset spec). */
export function resetProgress(username: string): void {
  if (!username) return;
  delete memoryOnly[username];
  removeRaw(progressKey(username));
}

/** Remove stored levels for ALL users on this device. Returns keys removed. */
export function resetAllProgress(): string[] {
  const removed: string[] = [];
  const keys = Object.keys(window.localStorage ?? {});
  for (const key of [...keys, ...Object.keys(memoryOnly)]) {
    if (!key.startsWith(PROGRESS_PREFIX)) continue;
    removed.push(key);
    removeRaw(key);
  }
  for (const key of Object.keys(memoryOnly)) {
    if (key.startsWith(PROGRESS_PREFIX)) delete memoryOnly[key];
  }
  return [...new Set(removed)];
}

export function listProgressKeys(): string[] {
  const keys = new Set<string>(Object.keys(window.localStorage ?? {}));
  for (const key of Object.keys(memoryOnly)) keys.add(key);
  return [...keys].filter((key) => key.startsWith(PROGRESS_PREFIX));
}

/** Approximate bytes used by this app's localStorage entries. */
export function measureBytes(keys?: string[]): number {
  const all = keys ?? [...Object.keys(window.localStorage ?? {})];
  let total = 0;
  for (const key of all) {
    const value = readRaw(key);
    total += (key.length + (value?.length ?? 0)) * 2;
  }
  return total;
}

/** Quota reporting for the storage bar (never throws). */
export async function getQuota(): Promise<QuotaInfo> {
  const usedBytes = measureBytes();
  try {
    if (navigator.storage?.estimate) {
      const estimate = await navigator.storage.estimate();
      const quota = estimate.quota ?? STORAGE_QUOTA_FALLBACK_BYTES;
      const usage = Math.max(estimate.usage ?? 0, usedBytes);
      return {
        usedBytes: usage,
        quotaBytes: quota,
        percent: quota > 0 ? Math.min(100, Math.round((usage / quota) * 100)) : 0,
        source: 'navigator',
      };
    }
  } catch {
    /* fall through to the estimate below */
  }
  return {
    usedBytes,
    quotaBytes: STORAGE_QUOTA_FALLBACK_BYTES,
    percent: Math.min(100, Math.round((usedBytes / STORAGE_QUOTA_FALLBACK_BYTES) * 100)),
    source: 'estimated',
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
