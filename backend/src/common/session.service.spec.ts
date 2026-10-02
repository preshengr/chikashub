import { MemoryStore } from '../database/memory.store';
import { ApiException, ErrorCode } from './api-error';
import { SessionService } from './session.service';

const USERNAME = 'chi48291';

async function seedUser(store: MemoryStore): Promise<void> {
  await store.create(`usernames/${USERNAME}`, {
    childId: 'child-1',
    status: 'active',
    prefix: 'chi',
    createdAt: new Date().toISOString(),
    activatedAt: new Date().toISOString(),
  });
}

describe('SessionService', () => {
  let store: MemoryStore;
  let sessions: SessionService;

  beforeEach(async () => {
    store = new MemoryStore();
    await seedUser(store);
    sessions = new SessionService(store);
  });

  it('creates a high-entropy token and stores only its hash', async () => {
    const { token, expiresIn, expiresAt } = await sessions.create(USERNAME);
    expect(token.length).toBeGreaterThanOrEqual(40);
    expect(expiresIn).toBeGreaterThan(0);
    expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now());

    const stored = await store.query<{ username: string }>('sessions');
    expect(stored).toHaveLength(1);
    expect(stored[0].id).not.toContain(token);
    expect(stored[0].id).toBe(SessionService.hashToken(token));
    expect(stored[0].id).toMatch(/^[0-9a-f]{64}$/);
    expect(stored[0].data.username).toBe(USERNAME);
  });

  it('validates a token back to its user', async () => {
    const { token } = await sessions.create(USERNAME);
    const user = await sessions.validate(token);
    expect(user.username).toBe(USERNAME);
    expect(user.childId).toBe('child-1');
    expect(user.tokenIdHash).toBe(SessionService.hashToken(token));
  });

  it('rejects tokens that are too short, too long or unknown', async () => {
    await expect(sessions.validate('short')).rejects.toThrow(ApiException);
    await expect(sessions.validate('x'.repeat(200))).rejects.toThrow(ApiException);
    await expect(sessions.validate('a'.repeat(50))).rejects.toThrow(ApiException);

    try {
      await sessions.validate('a'.repeat(50));
      throw new Error('expected validate to throw');
    } catch (err) {
      expect((err as ApiException).code).toBe(ErrorCode.INVALID_TOKEN);
      expect((err as ApiException).getStatus()).toBe(401);
    }
  });

  it('expires stale sessions and removes them', async () => {
    const { token } = await sessions.create(USERNAME);
    const hash = SessionService.hashToken(token);
    await store.set(
      `sessions/${hash}`,
      { expiresAt: new Date(Date.now() - 1000).toISOString() },
      { merge: true },
    );
    try {
      await sessions.validate(token);
      throw new Error('expected validate to throw');
    } catch (err) {
      expect((err as ApiException).code).toBe(ErrorCode.SESSION_EXPIRED);
    }
    expect(await store.get(`sessions/${hash}`)).toBeUndefined();
  });

  it('revokes a single session', async () => {
    const { token } = await sessions.create(USERNAME);
    await sessions.revoke(token);
    await expect(sessions.validate(token)).rejects.toThrow(ApiException);
    expect(await store.get(`sessions/${SessionService.hashToken(token)}`)).toBeUndefined();
  });

  it('revokes every session for a user', async () => {
    await sessions.create(USERNAME);
    await sessions.create(USERNAME);
    expect(await sessions.revokeAllForUser(USERNAME)).toBe(2);
    expect(await store.query('sessions')).toHaveLength(0);
  });

  it('purges expired sessions in bulk', async () => {
    const keep = (await sessions.create(USERNAME)).token;
    const drop = await sessions.create(USERNAME);
    await store.set(
      `sessions/${SessionService.hashToken(drop.token)}`,
      { expiresAt: new Date(Date.now() - 1000).toISOString() },
      { merge: true },
    );
    expect(await sessions.purgeExpired()).toBe(1);
    expect((await sessions.validate(keep)).username).toBe(USERNAME);
  });

  it('produces a different token for every login', async () => {
    const first = (await sessions.create(USERNAME)).token;
    const second = (await sessions.create(USERNAME)).token;
    expect(first).not.toBe(second);
    expect((await sessions.validate(first)).username).toBe(
      (await sessions.validate(second)).username,
    );
  });

  it('rejects creating a session for an unknown username', async () => {
    await expect(sessions.create('zzz99999')).rejects.toThrow(ApiException);
  });
});
