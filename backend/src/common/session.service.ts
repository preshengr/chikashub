import { Inject, Injectable, Logger as NestLogger } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { DATA_STORE, type DataStore, type StoreScope } from '../database/data-store';
import { ApiException, ErrorCode } from './api-error';

export interface SessionUser {
  username: string;
  childId: string;
  tokenIdHash: string;
}

interface SessionRecord {
  username: string;
  childId: string;
  createdAt: string;
  expiresAt: string;
  lastSeenAt: string;
}

const PURGE_INTERVAL_MS = 3_600_000;
const TOUCH_INTERVAL_MS = 60_000;

@Injectable()
export class SessionService {
  private readonly logger = new NestLogger(SessionService.name);
  private readonly lastSeen = new Map<string, number>();
  private lastPurge = 0;

  private readonly ttlHours = parseInt(process.env.SESSION_TTL_HOURS ?? '24', 10);

  constructor(@Inject(DATA_STORE) private readonly store: DataStore) {}

  static hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async create(
    username: string,
    scope: StoreScope = this.store,
  ): Promise<{ token: string; expiresIn: number; expiresAt: string }> {
    const userDoc = await scope.get<{ childId: string }>(`usernames/${username}`);
    if (!userDoc) throw ApiException.userNotFound();

    const token = randomBytes(32).toString('base64url');
    const hash = SessionService.hashToken(token);
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + this.ttlHours * 3600_000).toISOString();

    await scope.create(`sessions/${hash}`, {
      username,
      childId: userDoc.data.childId,
      createdAt: now,
      expiresAt,
      lastSeenAt: now,
    });
    return { token, expiresIn: this.ttlHours * 3600, expiresAt };
  }

  async validate(token: string): Promise<SessionUser> {
    if (!token || token.length < 20 || token.length > 128) {
      throw new ApiException(ErrorCode.INVALID_TOKEN, 'Invalid session token', 401);
    }
    const hash = SessionService.hashToken(token);
    const doc = await this.store.get<SessionRecord>(`sessions/${hash}`);
    if (!doc) {
      throw new ApiException(ErrorCode.INVALID_TOKEN, 'Session not recognized', 401);
    }
    if (new Date(doc.data.expiresAt).getTime() <= Date.now()) {
      await this.store.delete(`sessions/${hash}`);
      throw new ApiException(ErrorCode.SESSION_EXPIRED, 'Session expired, please log in again', 401);
    }
    this.touch(hash);
    void this.maybePurgeExpired();
    return { username: doc.data.username, childId: doc.data.childId, tokenIdHash: hash };
  }

  async revoke(token: string): Promise<void> {
    return this.revokeByHash(SessionService.hashToken(token));
  }

  async revokeByHash(hash: string): Promise<void> {
    try {
      await this.store.delete(`sessions/${hash}`);
    } catch (err) {
      this.logger.error('Failed to revoke session', err as Error);
    }
  }

  async revokeAllForUser(username: string): Promise<number> {
    try {
      const docs = await this.store.query('sessions', {
        filters: [{ field: 'username', op: '==', value: username }],
      });
      if (docs.length === 0) return 0;
      await this.store.deleteMany(docs.map((doc) => `sessions/${doc.id}`));
      return docs.length;
    } catch (err) {
      this.logger.error('Failed to revoke sessions', err as Error);
      return 0;
    }
  }

  async purgeExpired(): Promise<number> {
    try {
      const expired = await this.store.query<{ expiresAt: string }>('sessions', {
        filters: [{ field: 'expiresAt', op: '<=', value: new Date().toISOString() }],
      });
      if (expired.length === 0) return 0;
      await this.store.deleteMany(expired.map((doc) => `sessions/${doc.id}`));
      return expired.length;
    } catch (err) {
      this.logger.warn(`Session purge failed: ${(err as Error).message}`);
      return 0;
    }
  }

  private touch(hash: string): void {
    const now = Date.now();
    const seen = this.lastSeen.get(hash) ?? 0;
    if (now - seen < TOUCH_INTERVAL_MS) return;
    this.lastSeen.set(hash, now);
    void this.store
      .set(`sessions/${hash}`, { lastSeenAt: new Date(now).toISOString() }, { merge: true })
      .catch((err: Error) => this.logger.warn(`Failed to update session last_seen: ${err.message}`));
  }

  private async maybePurgeExpired(): Promise<void> {
    const now = Date.now();
    if (now - this.lastPurge < PURGE_INTERVAL_MS) return;
    this.lastPurge = now;
    await this.purgeExpired();
  }
}
