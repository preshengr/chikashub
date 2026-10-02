import { beforeEach, describe, expect, it } from 'vitest';
import {
  PROGRESS_PREFIX,
  formatBytes,
  getGameState,
  getQuota,
  listProgressKeys,
  loadProgress,
  measureBytes,
  recordCompletion,
  recordFailure,
  recordLevelComplete,
  recordStart,
  resetAllProgress,
  resetProgress,
} from '../src/core/storage';
import { readRaw, writeRaw } from '../src/core/session';

const USER = 'chi12345';

beforeEach(() => {
  localStorage.clear();
  resetProgress(USER);
});

describe('progress storage', () => {
  it('returns an empty store when nothing is saved', () => {
    const store = loadProgress(USER);
    expect(store.version).toBe(1);
    expect(store.games).toEqual({});
  });

  it('records a game start', () => {
    recordStart(USER, 'number-ninja');
    const state = getGameState(USER, 'number-ninja');
    expect(state).not.toBeNull();
    expect(state?.maxLevel).toBe(0);
    expect(state?.failures).toBe(0);
  });

  it('records level completions and tracks the best score', () => {
    recordLevelComplete(USER, 'number-ninja', 1, 10);
    recordLevelComplete(USER, 'number-ninja', 2, 25);
    recordLevelComplete(USER, 'number-ninja', 1, 5);
    const state = getGameState(USER, 'number-ninja');
    expect(state?.maxLevel).toBe(2);
    expect(state?.bestScore).toBe(25);
    expect(state?.levels).toEqual([1, 2]);
  });

  it('records failures and completions', () => {
    recordFailure(USER, 'pattern-peacock');
    recordFailure(USER, 'pattern-peacock');
    recordCompletion(USER, 'pattern-peacock', 90);
    const state = getGameState(USER, 'pattern-peacock');
    expect(state?.failures).toBe(2);
    expect(state?.completions).toBe(1);
    expect(state?.bestScore).toBe(90);
  });

  it('persists across reloads (module re-reads localStorage)', () => {
    recordLevelComplete(USER, 'word-wonders', 3, 30);
    const raw = readRaw(`${PROGRESS_PREFIX}${USER}`);
    expect(raw).toBeTruthy();
    const reloaded = loadProgress(USER);
    expect(reloaded.games['word-wonders']?.maxLevel).toBe(3);
  });

  it('survives corrupted JSON by starting fresh', () => {
    writeRaw(`${PROGRESS_PREFIX}${USER}`, '{not json');
    expect(loadProgress(USER).games).toEqual({});
  });

  it('scrubs absurd values from corrupted-but-valid payloads', () => {
    writeRaw(
      `${PROGRESS_PREFIX}${USER}`,
      JSON.stringify({
        version: 1,
        games: { 'number-ninja': { maxLevel: -50, bestScore: 'nope', levels: 'x', failures: 99999999 } },
      }),
    );
    const state = getGameState(USER, 'number-ninja');
    expect(state?.maxLevel).toBe(0);
    expect(state?.bestScore).toBe(0);
    expect(state?.levels).toEqual([]);
    expect(state?.failures).toBe(1_000_000);
  });

  it('resets one user without touching others', () => {
    recordLevelComplete(USER, 'number-ninja', 4, 40);
    recordLevelComplete('chi99999', 'number-ninja', 2, 20);
    resetProgress(USER);
    expect(getGameState(USER, 'number-ninja')).toBeNull();
    expect(getGameState('chi99999', 'number-ninja')?.maxLevel).toBe(2);
  });

  it('resets every saved profile on the device', () => {
    recordLevelComplete(USER, 'number-ninja', 1, 10);
    recordLevelComplete('chi99999', 'number-ninja', 1, 10);
    expect(listProgressKeys().length).toBeGreaterThanOrEqual(2);
    const removed = resetAllProgress();
    expect(removed.length).toBeGreaterThanOrEqual(2);
    expect(listProgressKeys()).toEqual([]);
  });
});

describe('quota reporting', () => {
  it('measures bytes for stored keys', () => {
    recordLevelComplete(USER, 'number-ninja', 1, 10);
    expect(measureBytes()).toBeGreaterThan(0);
  });

  it('returns a percentage-based quota estimate', async () => {
    const quota = await getQuota();
    expect(quota.quotaBytes).toBeGreaterThan(0);
    expect(quota.percent).toBeGreaterThanOrEqual(0);
    expect(quota.percent).toBeLessThanOrEqual(100);
    expect(['navigator', 'estimated']).toContain(quota.source);
  });

  it('formats byte sizes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.00 MB');
  });
});
