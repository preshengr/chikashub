import { beforeEach, describe, expect, it } from 'vitest';
import {
  SESSION_KEY,
  clearSession,
  getToken,
  isAuthenticated,
  loadSession,
  readRaw,
  saveSession,
  writeRaw,
} from '../src/core/session';
import type { SessionState } from '../src/core/session';

function makeSession(expiresAt: string): SessionState {
  return {
    username: 'chi12345',
    token: 'tok_abc',
    expiresAt,
    profile: {
      username: 'chi12345',
      status: 'active',
      createdAt: new Date().toISOString(),
      child: {
        id: 'child-1',
        firstName: 'Mia',
        age: 7,
        grade: 'grade_1',
        readingLevel: 'early_reader',
        learningGoals: ['math'],
        gameplayStyle: 'story',
      },
      parent: {
        firstName: 'Ada',
        lastName: 'Lovelace',
        relationship: 'mother',
        email: 'ada@example.com',
        phone: null,
      },
    },
  };
}

beforeEach(() => {
  localStorage.clear();
  clearSession();
});

describe('session state', () => {
  it('is empty by default', () => {
    expect(loadSession()).toBeNull();
    expect(isAuthenticated()).toBe(false);
    expect(getToken()).toBeNull();
  });

  it('persists and restores a valid session', () => {
    saveSession(makeSession(new Date(Date.now() + 60 * 60 * 1000).toISOString()));
    const restored = loadSession();
    expect(restored?.username).toBe('chi12345');
    expect(restored?.profile.child.firstName).toBe('Mia');
    expect(getToken()).toBe('tok_abc');
    expect(isAuthenticated()).toBe(true);
  });

  it('drops an expired session (with a 30s safety skew)', () => {
    saveSession(makeSession(new Date(Date.now() + 10_000).toISOString()));
    expect(loadSession()).toBeNull();
    expect(isAuthenticated()).toBe(false);
    expect(readRaw(SESSION_KEY)).toBeNull();
  });

  it('keeps a session that expires far in the future', () => {
    saveSession(makeSession(new Date(Date.now() + 60 * 60 * 1000).toISOString()));
    expect(loadSession()).not.toBeNull();
  });

  it('discards corrupted session JSON', () => {
    writeRaw(SESSION_KEY, '{{{');
    expect(loadSession()).toBeNull();
    expect(readRaw(SESSION_KEY)).toBeNull();
  });

  it('discards a session missing required fields', () => {
    writeRaw(SESSION_KEY, JSON.stringify({ username: 'chi12345' }));
    expect(loadSession()).toBeNull();
  });

  it('clears on demand', () => {
    saveSession(makeSession(new Date(Date.now() + 60 * 60 * 1000).toISOString()));
    clearSession();
    expect(loadSession()).toBeNull();
  });
});
