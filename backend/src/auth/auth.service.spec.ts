import type { AppConfig } from '../config/configuration';
import { MemoryStore } from '../database/memory.store';
import { ApiException, ErrorCode } from '../common/api-error';
import { SessionService } from '../common/session.service';
import { AuthService, type RegisterResult } from './auth.service';
import { UsernameService } from './username.service';
import type { RegisterDto, ConfirmRegistrationDto, LoginDto } from './dto/auth.dto';

const config: AppConfig = {
  env: 'test',
  port: 0,
  apiPrefix: 'api',
  dataStore: 'memory',
  sessionTtlHours: 24,
  pendingRegistrationTtlMinutes: 30,
  corsOrigins: [],
  trustProxy: false,
  rateLimit: { windowMs: 60_000, authMax: 20, eventMax: 300 },
};

function registerDto(overrides: Partial<RegisterDto> = {}): RegisterDto {
  return {
    parent: {
      firstName: 'Ada',
      lastName: 'Lovelace',
      relationship: 'mother',
      email: 'ada@example.com',
      phone: '555 123 4567',
    },
    child: { firstName: 'Chika', age: 7, grade: 'grade_1' },
    preferences: {
      learningGoals: ['math', 'coding'],
      readingLevel: 'early_reader',
      gameplayStyle: 'story',
    },
    consent: {
      consentData: true,
      termsConsent: true,
      signatureFullName: 'Ada Lovelace',
      signatureDate: '2026-10-01',
    },
    ...overrides,
  } as RegisterDto;
}

describe('AuthService', () => {
  let store: MemoryStore;
  let auth: AuthService;
  let sessions: SessionService;

  beforeEach(() => {
    store = new MemoryStore();
    sessions = new SessionService(store);
    auth = new AuthService(store, new UsernameService(store), sessions, config);
  });

  function register(overrides: Partial<RegisterDto> = {}): Promise<RegisterResult> {
    return auth.register(registerDto(overrides));
  }

  describe('register', () => {
    it('stages a pending profile and returns a valid unique username', async () => {
      const result = await register();
      expect(result.username).toMatch(/^[a-z]{3}\d{5}$/);
      expect(result.childFirstName).toBe('Chika');
      expect(result.expiresInMinutes).toBe(30);
      expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now());

      const usernameDoc = await store.get<{ status: string }>(`usernames/${result.username}`);
      expect(usernameDoc?.data.status).toBe('pending');
      expect(await store.get(`pending/${result.username}`)).toBeDefined();
      expect(await store.get(`usernames/${result.username}/progress/number-ninja`)).toBeUndefined();
    });

    it('generates a different username for two children with the same name', async () => {
      const first = await register();
      const second = await register({
        parent: { ...registerDto().parent, email: 'other@example.com' },
      });
      expect(first.username).not.toBe(second.username);
      expect(await store.get(`usernames/${first.username}`)).toBeDefined();
      expect(await store.get(`usernames/${second.username}`)).toBeDefined();
    });

    it('reuses the parent record for the same guardian email', async () => {
      await register();
      await register({ child: { firstName: 'Nia', age: 5, grade: 'pre_k' } });
      const parents = await store.query('parents');
      const children = await store.query('children');
      expect(parents).toHaveLength(1);
      expect(children).toHaveLength(2);
    });

    it('updates guardian details when the same email registers again', async () => {
      await register();
      await register({
        parent: { ...registerDto().parent, firstName: 'Augusta', phone: '555 999 0000' },
        child: { firstName: 'Nia', age: 5, grade: 'pre_k' },
      });
      const parent = await store.get<{ firstName: string; phone: string | null }>(
        'parents/ada@example.com',
      );
      expect(parent?.data.firstName).toBe('Augusta');
      expect(parent?.data.phone).toBe('555 999 0000');
    });

    it('stores consent, signature and child preferences', async () => {
      const result = await register();
      const usernameDoc = await store.get<{ childId: string }>(`usernames/${result.username}`);
      const child = await store.get<{
        age: number;
        readingLevel: string;
        learningGoals: string[];
        coppaConsent: boolean;
        termsConsent: boolean;
        signatureName: string;
      }>(`children/${usernameDoc!.data.childId}`);

      expect(child?.data.age).toBe(7);
      expect(child?.data.readingLevel).toBe('early_reader');
      expect(child?.data.learningGoals).toEqual(['math', 'coding']);
      expect(child?.data.coppaConsent).toBe(true);
      expect(child?.data.termsConsent).toBe(true);
      expect(child?.data.signatureName).toBe('Ada Lovelace');
    });

    it('leaves the profile without an active session until confirmation', async () => {
      const result = await register();
      const active = await store.query('sessions', {
        filters: [{ field: 'username', op: '==', value: result.username }],
      });
      expect(active).toHaveLength(0);
    });
  });

  describe('confirm', () => {
    it('activates the account and opens a session on accept', async () => {
      const staged = await register();
      const confirmed = await auth.confirm({ username: staged.username, accept: true });
      if (!('token' in confirmed)) throw new Error('expected confirm() to open a session');

      expect(confirmed.username).toBe(staged.username);
      expect(confirmed.token.length).toBeGreaterThanOrEqual(20);
      expect(confirmed.profile.status).toBe('active');
      expect(confirmed.profile.child.firstName).toBe('Chika');
      expect(await store.get(`pending/${staged.username}`)).toBeUndefined();

      const usernameDoc = await store.get<{ childId: string }>(`usernames/${staged.username}`);
      const child = await store.get<{ consentedAt: string | null }>(
        `children/${usernameDoc!.data.childId}`,
      );
      expect(child?.data.consentedAt).toBeTruthy();
    });

    it('is idempotent when the account is already active', async () => {
      const staged = await register();
      await auth.confirm({ username: staged.username, accept: true });
      const again = await auth.confirm({ username: staged.username, accept: true });
      if (!('token' in again)) throw new Error('expected confirm() to return the active session');
      expect(again.profile.status).toBe('active');
      expect(again.token).toBeTruthy();
    });

    it('removes the staged profile on deny', async () => {
      const staged = await register();
      const result = await auth.confirm({ username: staged.username, accept: false });
      expect(result).toEqual({ username: staged.username, denied: true });
      expect(await store.get(`usernames/${staged.username}`)).toBeUndefined();
      expect(await store.query('children')).toHaveLength(0);
    });

    it('rejects an unknown username', async () => {
      await expect(auth.confirm({ username: 'zzz99999', accept: true })).rejects.toThrow(
        ApiException,
      );
      try {
        await auth.confirm({ username: 'zzz99999', accept: true });
        throw new Error('expected confirm to throw');
      } catch (err) {
        expect((err as ApiException).code).toBe(ErrorCode.REGISTRATION_EXPIRED);
        expect((err as ApiException).getStatus()).toBe(410);
      }
    });

    it('rejects and cleans up an expired registration window', async () => {
      const staged = await register();
      await store.set(
        `pending/${staged.username}`,
        { expiresAt: new Date(Date.now() - 60_000).toISOString() },
        { merge: true },
      );
      try {
        await auth.confirm({ username: staged.username, accept: true } as ConfirmRegistrationDto);
        throw new Error('expected confirm to throw');
      } catch (err) {
        expect((err as ApiException).code).toBe(ErrorCode.REGISTRATION_EXPIRED);
      }
      expect(await store.get(`usernames/${staged.username}`)).toBeUndefined();
      expect(await store.get(`pending/${staged.username}`)).toBeUndefined();
    });
  });

  describe('login', () => {
    it('authenticates an activated username and returns a session token', async () => {
      const staged = await register();
      await auth.confirm({ username: staged.username, accept: true });

      const result = await auth.login({ username: staged.username } as LoginDto);
      expect(result.username).toBe(staged.username);
      expect(result.token.length).toBeGreaterThanOrEqual(20);
      expect(result.profile.child.age).toBe(7);
    });

    it('tolerates mixed case and surrounding whitespace', async () => {
      const staged = await register();
      await auth.confirm({ username: staged.username, accept: true });
      const result = await auth.login({
        username: `  ${staged.username.toUpperCase()}  `,
      } as LoginDto);
      expect(result.username).toBe(staged.username);
    });

    it('rejects a username that does not exist with the product-spec message', async () => {
      let thrown: unknown;
      try {
        await auth.login({ username: 'zzz12345' } as LoginDto);
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(ApiException);
      expect((thrown as ApiException).code).toBe(ErrorCode.USER_NOT_FOUND);
      expect((thrown as ApiException).getStatus()).toBe(404);
      expect((thrown as ApiException).getResponse()).toMatchObject({
        error: { code: 'USER_NOT_FOUND', message: 'User Does Not Exist - Try Again' },
      });
    });

    it('rejects a malformed username without leaking whether it exists', async () => {
      await expect(auth.login({ username: 'not valid' } as LoginDto)).rejects.toThrow(
        ApiException,
      );
      await expect(auth.login({ username: '' } as LoginDto)).rejects.toThrow(ApiException);
    });

    it('rejects a pending (unconfirmed) registration', async () => {
      const staged = await register();
      let thrown: unknown;
      try {
        await auth.login({ username: staged.username } as LoginDto);
      } catch (err) {
        thrown = err;
      }
      expect((thrown as ApiException).code).toBe(ErrorCode.USER_NOT_FOUND);
    });

    it('creates a distinct token for every login', async () => {
      const staged = await register();
      await auth.confirm({ username: staged.username, accept: true });
      const a = (await auth.login({ username: staged.username } as LoginDto)).token;
      const b = (await auth.login({ username: staged.username } as LoginDto)).token;
      expect(a).not.toBe(b);
      expect((await sessions.validate(a)).username).toBe(staged.username);
      expect((await sessions.validate(b)).username).toBe(staged.username);
    });
  });

  describe('deny', () => {
    it('removes a pending registration', async () => {
      const staged = await register();
      expect(await auth.deny(staged.username)).toBe(true);
      expect(await store.get(`usernames/${staged.username}`)).toBeUndefined();
      expect(await store.get(`pending/${staged.username}`)).toBeUndefined();
      expect(await store.query('children')).toHaveLength(0);
    });

    it('never deletes an active account', async () => {
      const staged = await register();
      await auth.confirm({ username: staged.username, accept: true });
      expect(await auth.deny(staged.username)).toBe(false);
      expect(await store.get(`usernames/${staged.username}`)).toBeDefined();
      expect((await auth.login({ username: staged.username } as LoginDto)).username).toBe(
        staged.username,
      );
    });

    it('returns false for unknown usernames', async () => {
      expect(await auth.deny('zzz99999')).toBe(false);
    });
  });

  describe('purgeExpiredPending', () => {
    it('clears registrations whose confirmation window elapsed', async () => {
      const keep = await register();
      const drop = await register({
        parent: { ...registerDto().parent, email: 'two@example.com' },
      });
      await store.set(
        `pending/${drop.username}`,
        { expiresAt: new Date(Date.now() - 1000).toISOString() },
        { merge: true },
      );

      expect(await auth.purgeExpiredPending()).toBe(1);
      expect(await store.get(`usernames/${drop.username}`)).toBeUndefined();
      expect(await store.get(`usernames/${keep.username}`)).toBeDefined();
    });

    it('returns zero when nothing has expired', async () => {
      await register();
      expect(await auth.purgeExpiredPending()).toBe(0);
    });
  });

  describe('getProfile', () => {
    it('returns the full profile for an active username', async () => {
      const staged = await register();
      await auth.confirm({ username: staged.username, accept: true });
      const profile = await auth.getProfile(staged.username);
      expect(profile.parent.email).toBe('ada@example.com');
      expect(profile.child.learningGoals).toEqual(['math', 'coding']);
      expect(typeof profile.child.id).toBe('string');
    });

    it('throws USER_NOT_FOUND for unknown usernames', async () => {
      await expect(auth.getProfile('zzz99999')).rejects.toThrow(ApiException);
    });
  });
});
