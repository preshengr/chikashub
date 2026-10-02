import { MemoryStore } from '../database/memory.store';
import { ApiException, ErrorCode } from '../common/api-error';
import {
  UsernameService,
  derivePrefixes,
  isValidUsername,
  normalizeName,
} from './username.service';

async function seedUsername(store: MemoryStore, username: string): Promise<void> {
  const prefix = username.slice(0, 3);
  await store.create(`usernames/${username}`, {
    childId: `child-${username}`,
    status: 'active',
    prefix,
    createdAt: new Date().toISOString(),
    activatedAt: new Date().toISOString(),
  });
  const prefixDoc = await store.get<{ count: number }>(`usernamePrefixes/${prefix}`);
  await store.set(
    `usernamePrefixes/${prefix}`,
    { prefix, count: (prefixDoc?.data.count ?? 0) + 1 },
    { merge: true },
  );
}

describe('normalizeName', () => {
  it('lowercases and strips accents', () => {
    expect(normalizeName('Chíka')).toBe('chika');
    expect(normalizeName('ÉLODIE')).toBe('elodie');
  });

  it('drops apostrophes, hyphens and spaces', () => {
    expect(normalizeName("O'Brien-Smith")).toBe('obriensmith');
    expect(normalizeName('Mary Jane')).toBe('maryjane');
  });

  it('handles empty and numeric input without throwing', () => {
    expect(normalizeName('')).toBe('');
    expect(normalizeName('123')).toBe('');
    expect(normalizeName(undefined as unknown as string)).toBe('');
  });
});

describe('derivePrefixes', () => {
  it('uses the first three letters as primary and last three as fallback', () => {
    expect(derivePrefixes('Chika')).toEqual({ primary: 'chi', fallback: 'ika' });
  });

  it('pads names shorter than three letters', () => {
    expect(derivePrefixes('Bo')).toEqual({ primary: 'bok', fallback: 'kid' });
    expect(derivePrefixes('A')).toEqual({ primary: 'aki', fallback: 'kid' });
  });

  it('returns identical prefixes for exactly three letter names', () => {
    expect(derivePrefixes('Ada')).toEqual({ primary: 'ada', fallback: 'ada' });
  });
});

describe('isValidUsername', () => {
  it('accepts three letters followed by five digits', () => {
    expect(isValidUsername('chi48291')).toBe(true);
    expect(isValidUsername('z99999')).toBe(false);
  });

  it('rejects wrong length, case and non-alphanumeric values', () => {
    expect(isValidUsername('chi4829')).toBe(false);
    expect(isValidUsername('chi482912')).toBe(false);
    expect(isValidUsername('CHI48291')).toBe(false);
    expect(isValidUsername('chiabcde')).toBe(false);
    expect(isValidUsername('')).toBe(false);
    expect(isValidUsername('chi48291 ')).toBe(false);
  });
});

describe('UsernameService.generateUnique', () => {
  let store: MemoryStore;
  let service: UsernameService;

  beforeEach(() => {
    store = new MemoryStore();
    service = new UsernameService(store);
  });

  it('generates an 8-character username in the documented format', async () => {
    const username = await service.generateUnique('Chika');
    expect(username).toMatch(/^[a-z]{3}\d{5}$/);
    expect(username).toHaveLength(8);
    expect(username.startsWith('chi')).toBe(true);
  });

  it('uses the injected random source deterministically', async () => {
    expect(await service.generateUnique('Chika', { random: () => '00001' })).toBe('chi00001');
    expect(await service.generateUnique('Chika', { random: () => '48291' })).toBe('chi48291');
  });

  it('retries when the random source yields a malformed value', async () => {
    const values = ['ab', '00002'];
    const random = jest.fn(() => values.shift() ?? '00002');
    expect(await service.generateUnique('Chika', { random })).toBe('chi00002');
    expect(random).toHaveBeenCalledTimes(2);
  });

  it('switches to the last three letters when similar names share the prefix', async () => {
    await seedUsername(store, 'chi99999');
    const username = await service.generateUnique('Chika', { random: () => '00007' });
    expect(username).toBe('ika00007');
  });

  it('still produces valid usernames for names that need padding', async () => {
    const username = await service.generateUnique('Bo', { random: () => '00050' });
    expect(username).toBe('bok00050');
  });

  it('never returns an existing username across many generations', async () => {
    for (let i = 0; i < 40; i++) {
      await seedUsername(store, `chi${String(i).padStart(5, '0')}`);
    }
    const generated = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const username = await service.generateUnique('Chika', {
        random: () => String(40 + i).padStart(5, '0'),
      });
      generated.add(username);
      await seedUsername(store, username);
    }
    expect(generated.size).toBe(30);
    for (const username of generated) {
      expect(await service.usernameExists(username)).toBe(true);
    }
  });

  it('throws a USERNAME_TAKEN api error when every candidate is taken', async () => {
    await seedUsername(store, 'chi00001');
    await seedUsername(store, 'ika00001');
    let thrown: unknown;
    try {
      await service.generateUnique('Chika', { random: () => '00001' });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(ApiException);
    expect((thrown as ApiException).code).toBe(ErrorCode.USERNAME_TAKEN);
    expect((thrown as ApiException).getStatus()).toBe(500);
  });

  it('reports prefix and username existence', async () => {
    await seedUsername(store, 'chi12345');
    expect(await service.prefixExists('chi')).toBe(true);
    expect(await service.prefixExists('xyz')).toBe(false);
    expect(await service.usernameExists('chi12345')).toBe(true);
    expect(await service.usernameExists('chi99999')).toBe(false);
  });

  it('records and releases prefix counters with the username lifecycle', async () => {
    await service.recordPrefix('chi00001', store);
    expect(await service.prefixExists('chi')).toBe(true);
    await service.recordPrefix('chi00002', store);
    await service.releasePrefix('chi', store);
    expect(await service.prefixExists('chi')).toBe(true);
    await service.releasePrefix('chi', store);
    expect(await service.prefixExists('chi')).toBe(false);
  });
});
