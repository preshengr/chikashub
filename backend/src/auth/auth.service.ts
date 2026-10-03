import { Logger as NestLogger, Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import appConfig from '../config/configuration';
import { DataExistsError, DATA_STORE, type DataStore } from '../database/data-store';
import { ApiException, ErrorCode } from '../common/api-error';
import { SessionService } from '../common/session.service';
import { loadProfile, type FullProfile } from '../users/profile.repository';
import { isValidUsername, UsernameService } from './username.service';
import type { ConfirmRegistrationDto, LoginDto, RegisterDto } from './dto/auth.dto';

export interface RegisterResult {
  username: string;
  expiresAt: string;
  expiresInMinutes: number;
  childFirstName: string;
}

export interface ConfirmResult {
  username: string;
  token: string;
  expiresIn: number;
  expiresAt: string;
  profile: FullProfile;
}

interface UsernameRecord {
  childId: string;
  status: 'pending' | 'active';
  createdAt: string;
  prefix: string;
  activatedAt?: string | null;
}

interface PendingRecord {
  expiresAt: string;
  createdAt: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new NestLogger(AuthService.name);

  constructor(
    @Inject(DATA_STORE) private readonly store: DataStore,
    private readonly usernames: UsernameService,
    private readonly sessions: SessionService,
    @Inject(appConfig.KEY) private readonly config: ConfigType<typeof appConfig>,
  ) {}

  async register(dto: RegisterDto): Promise<RegisterResult> {
    const email = dto.parent.email.trim().toLowerCase();
    await this.purgeExpiredPending();

    try {
      return await this.store.runTransaction<RegisterResult>(async (tx) => {
        const now = new Date().toISOString();
        const parentPath = `parents/${email}`;
        const parentDoc = await tx.get(parentPath);
        const username = await this.usernames.generateUnique(dto.child.firstName, { scope: tx });
        const prefix = username.slice(0, 3);
        const prefixDoc = await tx.get<{ count: number }>(`usernamePrefixes/${prefix}`);
        const childId = tx.generateId();
        const expiresAt = new Date(
          Date.now() + this.config.pendingRegistrationTtlMinutes * 60_000,
        ).toISOString();

        if (!parentDoc) {
          await tx.create(parentPath, {
            firstName: dto.parent.firstName.trim(),
            lastName: dto.parent.lastName.trim(),
            relationship: dto.parent.relationship,
            email,
            phone: dto.parent.phone?.trim() || null,
            createdAt: now,
            updatedAt: now,
          });
        } else {
          await tx.set(
            parentPath,
            {
              firstName: dto.parent.firstName.trim(),
              lastName: dto.parent.lastName.trim(),
              relationship: dto.parent.relationship,
              phone: dto.parent.phone?.trim() || null,
              updatedAt: now,
            },
            { merge: true },
          );
        }

        await tx.create(`children/${childId}`, {
          parentId: email,
          firstName: dto.child.firstName.trim(),
          age: dto.child.age,
          grade: dto.child.grade,
          readingLevel: dto.preferences.readingLevel,
          learningGoals: dto.preferences.learningGoals,
          gameplayStyle: dto.preferences.gameplayStyle,
          signatureName: dto.consent.signatureFullName.trim(),
          signatureDate: dto.consent.signatureDate,
          coppaConsent: dto.consent.consentData,
          termsConsent: dto.consent.termsConsent,
          consentedAt: null,
          createdAt: now,
          updatedAt: now,
        });
        await tx.create(`usernames/${username}`, {
          childId,
          status: 'pending',
          prefix,
          createdAt: now,
          activatedAt: null,
        });
        await this.usernames.recordPrefix(username, tx, prefixDoc ?? null);
        await tx.create(`pending/${username}`, { expiresAt, createdAt: now });

        this.logger.log(
          `Staged registration username=${username} child="${dto.child.firstName}" age=${dto.child.age}`,
        );

        return {
          username,
          expiresAt,
          expiresInMinutes: this.config.pendingRegistrationTtlMinutes,
          childFirstName: dto.child.firstName.trim(),
        };
      });
    } catch (err) {
      this.rethrowAsApi('register', err);
    }
  }

  async confirm(
    dto: ConfirmRegistrationDto,
  ): Promise<ConfirmResult | { username: string; denied: true }> {
    const username = dto.username.trim().toLowerCase();
    await this.purgeExpiredPending();

    if (!dto.accept) {
      await this.deny(username);
      return { username, denied: true as const };
    }

    try {
      return await this.store.runTransaction<ConfirmResult>(async (tx) => {
        const pendingDoc = await tx.get<PendingRecord>(`pending/${username}`);
        const usernameDoc = await tx.get<UsernameRecord>(`usernames/${username}`);

        if (!pendingDoc) {
          if (usernameDoc?.data.status === 'active') {
            const profile = await loadProfile(tx, username);
            if (!profile) throw ApiException.userNotFound();
            const session = await this.sessions.create(username, tx, usernameDoc);
            return { username, profile, ...session };
          }
          throw new ApiException(
            ErrorCode.REGISTRATION_EXPIRED,
            'This registration is no longer valid. Please register again.',
            410,
          );
        }

        if (new Date(pendingDoc.data.expiresAt).getTime() <= Date.now()) {
          throw new ApiException(
            ErrorCode.REGISTRATION_EXPIRED,
            'Registration session expired. Please register again.',
            410,
          );
        }

        if (!usernameDoc) {
          throw ApiException.internal('Staged registration is missing account data');
        }

        const profile = await loadProfile(tx, username);
        if (!profile) throw ApiException.internal('Account could not be loaded after activation');

        const now = new Date().toISOString();
        await tx.set(`usernames/${username}`, { status: 'active', activatedAt: now }, { merge: true });
        await tx.set(
          `children/${usernameDoc.data.childId}`,
          { consentedAt: now, updatedAt: now },
          { merge: true },
        );
        await tx.delete(`pending/${username}`);
        const session = await this.sessions.create(username, tx, usernameDoc);

        this.logger.log(`Registration confirmed for username=${username}`);
        return {
          username,
          profile: { ...profile, status: 'active' as const },
          ...session,
        };
      });
    } catch (err) {
      this.rethrowAsApi('confirm', err);
    }
  }

  async deny(username: string): Promise<boolean> {
    try {
      return await this.store.runTransaction(async (tx) => {
        const usernameDoc = await tx.get<UsernameRecord>(`usernames/${username}`);
        if (!usernameDoc) {
          this.logger.warn(`Deny requested for unknown username=${username}`);
          return false;
        }
        if (usernameDoc.data.status === 'active') {
          this.logger.warn(`Deny requested for active username=${username} - ignored`);
          return false;
        }
        const prefixDoc = await tx.get<{ count: number }>(
          `usernamePrefixes/${usernameDoc.data.prefix}`,
        );
        await tx.delete(`children/${usernameDoc.data.childId}`);
        await tx.delete(`usernames/${username}`);
        await tx.delete(`pending/${username}`);
        await this.usernames.releasePrefix(usernameDoc.data.prefix, tx, prefixDoc ?? null);
        this.logger.log(`Staged registration denied and removed: username=${username}`);
        return true;
      });
    } catch (err) {
      this.rethrowAsApi('deny', err);
    }
  }

  async login(dto: LoginDto): Promise<ConfirmResult> {
    const username = dto.username.trim().toLowerCase();
    if (!isValidUsername(username)) {
      this.logger.warn(`Login rejected (malformed username): "${dto.username}"`);
      throw ApiException.userNotFound();
    }

    try {
      const usernameDoc = await this.store.get<UsernameRecord>(`usernames/${username}`);
      if (!usernameDoc || usernameDoc.data.status !== 'active') {
        this.logger.warn(`Login rejected (not found or not active): ${username}`);
        throw ApiException.userNotFound();
      }

      const session = await this.sessions.create(username);
      const profile = await loadProfile(this.store, username);
      if (!profile) throw ApiException.userNotFound();
      this.logger.log(`Login success username=${username}`);
      return { username, profile, ...session };
    } catch (err) {
      if (err instanceof ApiException) throw err;
      this.rethrowAsApi('login', err);
    }
  }

  async getProfile(username: string): Promise<FullProfile> {
    const profile = await loadProfile(this.store, username);
    if (!profile) throw ApiException.userNotFound();
    return profile;
  }

  async purgeExpiredPending(): Promise<number> {
    try {
      const expired = await this.store.query<{ expiresAt: string }>('pending', {
        filters: [{ field: 'expiresAt', op: '<=', value: new Date().toISOString() }],
      });
      for (const doc of expired) await this.removeStaged(doc.id);
      if (expired.length > 0) {
        this.logger.log(`Purged ${expired.length} expired pending registration(s)`);
      }
      return expired.length;
    } catch (err) {
      this.logger.warn(`Pending purge failed: ${(err as Error).message}`);
      return 0;
    }
  }

  private async removeStaged(username: string): Promise<void> {
    await this.store.runTransaction(async (tx) => {
      const usernameDoc = await tx.get<UsernameRecord>(`usernames/${username}`);
      const prefixDoc = usernameDoc
        ? await tx.get<{ count: number }>(`usernamePrefixes/${usernameDoc.data.prefix}`)
        : undefined;
      if (usernameDoc) {
        await tx.delete(`children/${usernameDoc.data.childId}`);
        await tx.delete(`usernames/${username}`);
        await this.usernames.releasePrefix(usernameDoc.data.prefix, tx, prefixDoc ?? null);
      }
      await tx.delete(`pending/${username}`);
    });
  }

  private rethrowAsApi(operation: string, err: unknown): never {
    if (err instanceof ApiException) throw err;
    const message = (err as Error)?.message ?? 'unknown error';
    this.logger.error(`AuthService.${operation} failed: ${message}`, (err as Error)?.stack);
    if (err instanceof DataExistsError) {
      throw ApiException.conflict(
        ErrorCode.CONFLICT,
        'That information conflicts with an existing record',
      );
    }
    throw ApiException.unavailable('We could not reach the database. Please try again.');
  }
}
