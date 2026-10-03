import { HttpStatus, Inject, Injectable, Logger as NestLogger } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { DATA_STORE, type DataStore, type Doc, type StoreScope } from '../database/data-store';
import { ApiException, ErrorCode } from '../common/api-error';

export interface UsernamePrefixes {
  primary: string;
  fallback: string;
}

export const USERNAME_PATTERN = /^[a-z]{3}\d{5}$/;
const MAX_ATTEMPTS = 50;

export function normalizeName(raw: string): string {
  return (raw ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

export function derivePrefixes(childFirstName: string): UsernamePrefixes {
  const letters = normalizeName(childFirstName);
  const padded = (letters + 'kid').slice(0, 6);
  const primary = letters.length >= 3 ? letters.slice(0, 3) : padded.slice(0, 3);
  const fallbackSource = letters.length >= 3 ? letters : padded;
  const fallback = fallbackSource.slice(-3);
  return { primary, fallback };
}

export function isValidUsername(username: string): boolean {
  return USERNAME_PATTERN.test(username);
}

function randomDigits(): string {
  return String(randomInt(0, 100_000)).padStart(5, '0');
}

@Injectable()
export class UsernameService {
  private readonly logger = new NestLogger(UsernameService.name);

  constructor(@Inject(DATA_STORE) private readonly store: DataStore) {}

  async prefixExists(prefix: string, scope: StoreScope = this.store): Promise<boolean> {
    const doc = await scope.get(`usernamePrefixes/${prefix}`);
    return doc !== undefined;
  }

  async usernameExists(username: string, scope: StoreScope = this.store): Promise<boolean> {
    const doc = await scope.get(`usernames/${username}`);
    return doc !== undefined;
  }

  async generateUnique(
    childFirstName: string,
    options?: { random?: () => string; scope?: StoreScope },
  ): Promise<string> {
    const random = options?.random ?? randomDigits;
    const scope = options?.scope ?? this.store;
    const { primary, fallback } = derivePrefixes(childFirstName);
    const similarNames = await this.prefixExists(primary, scope);
    let prefix = primary;

    if (similarNames && fallback !== primary) {
      prefix = fallback;
      this.logger.log(
        `Similar-name collision on prefix "${primary}" - using last 3 letters ("${fallback}") for ${childFirstName}`,
      );
    }

    const allocate = async (candidatePrefix: string): Promise<string | undefined> => {
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const candidate = `${candidatePrefix}${random()}`;
        if (isValidUsername(candidate) && !(await this.usernameExists(candidate, scope))) {
          if (attempt > 1) {
            this.logger.log(`Username allocated after ${attempt} attempts: ${candidate}`);
          }
          return candidate;
        }
      }
      return undefined;
    };

    let candidate = await allocate(prefix);
    if (!candidate) {
      const alternate = prefix === primary ? fallback : primary;
      candidate = await allocate(alternate);
      if (candidate) {
        this.logger.warn(`Username allocated via alternate prefix "${alternate}": ${candidate}`);
      }
    }

    if (!candidate) {
      this.logger.error(
        `Failed to allocate a unique username after ${MAX_ATTEMPTS * 2} attempts (name="${childFirstName}")`,
      );
      throw new ApiException(
        ErrorCode.USERNAME_TAKEN,
        'We could not create a unique username right now. Please try again.',
        HttpStatus.INTERNAL_SERVER_ERROR,
        { attempts: MAX_ATTEMPTS * 2 },
      );
    }

    return candidate;
  }

  async recordPrefix(
    username: string,
    scope: StoreScope,
    existing?: Doc<{ count: number }> | null,
  ): Promise<void> {
    const prefix = username.slice(0, 3);
    const path = `usernamePrefixes/${prefix}`;
    const doc = existing !== undefined ? existing : await scope.get<{ count: number }>(path);
    await scope.set(
      path,
      { prefix, count: (doc?.data.count ?? 0) + 1, updatedAt: new Date().toISOString() },
      { merge: true },
    );
  }

  async releasePrefix(
    prefix: string,
    scope: StoreScope,
    existing?: Doc<{ count: number }> | null,
  ): Promise<void> {
    const path = `usernamePrefixes/${prefix}`;
    const doc = existing !== undefined ? existing : await scope.get<{ count: number }>(path);
    if (!doc) return;
    if ((doc.data.count ?? 1) <= 1) {
      await scope.delete(path);
    } else {
      await scope.set(path, { count: doc.data.count - 1 }, { merge: true });
    }
  }
}
