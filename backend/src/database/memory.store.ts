import {
  DataExistsError,
  type DataStore,
  type Doc,
  type QueryOptions,
  type StoreScope,
} from './data-store';

interface Entry {
  id: string;
  data: Record<string, unknown>;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function fieldPath(data: Record<string, unknown>, field: string): unknown {
  let current: unknown = data;
  for (const part of field.split('.')) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function scalarEquals(a: unknown, b: unknown): boolean {
  if (a instanceof Date || b instanceof Date) {
    return new Date(a as string | number | Date).getTime() === new Date(b as string | number | Date).getTime();
  }
  return a === b;
}

function compareValues(a: unknown, b: unknown): number {
  if (a === undefined && b === undefined) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return a === b ? 0 : a ? 1 : -1;
  return String(a).localeCompare(String(b));
}

function matches(data: Record<string, unknown>, field: string, op: string, value: unknown): boolean {
  const actual = fieldPath(data, field);
  switch (op) {
    case '==':
      return scalarEquals(actual, value);
    case '!=':
      return !scalarEquals(actual, value);
    case '<':
      return compareValues(actual, value) < 0;
    case '<=':
      return compareValues(actual, value) <= 0;
    case '>':
      return compareValues(actual, value) > 0;
    case '>=':
      return compareValues(actual, value) >= 0;
    case 'in':
      return Array.isArray(value) && value.some((candidate) => scalarEquals(actual, candidate));
    case 'array-contains':
      return Array.isArray(actual) && actual.some((candidate) => scalarEquals(candidate, value));
    default:
      throw new Error(`Unsupported query operator "${op}"`);
  }
}

export class MemoryStore implements DataStore {
  private readonly docs = new Map<string, Record<string, unknown>>();
  private counter = 0;

  generateId(): string {
    this.counter += 1;
    return `doc-${this.counter}-${Math.random().toString(36).slice(2, 10)}`;
  }

  async get<T>(path: string): Promise<Doc<T> | undefined> {
    const data = this.docs.get(path);
    if (!data) return undefined;
    return { id: path.split('/').pop() as string, data: clone(data) as T };
  }

  async create<T>(path: string, data: T): Promise<void> {
    if (this.docs.has(path)) throw new DataExistsError(path);
    this.docs.set(path, clone(data as Record<string, unknown>));
  }

  async set<T>(path: string, data: T, options?: { merge?: boolean }): Promise<void> {
    const incoming = clone(data as Record<string, unknown>);
    if (options?.merge) {
      const existing = this.docs.get(path) ?? {};
      this.docs.set(path, { ...existing, ...incoming });
    } else {
      this.docs.set(path, incoming);
    }
  }

  async delete(path: string): Promise<void> {
    this.docs.delete(path);
  }

  async query<T>(collectionPath: string, options: QueryOptions = {}): Promise<Doc<T>[]> {
    const prefix = `${collectionPath}/`;
    let entries: Entry[] = [];
    for (const [path, data] of this.docs) {
      if (!path.startsWith(prefix)) continue;
      const remainder = path.slice(prefix.length);
      if (remainder.includes('/')) continue;
      entries.push({ id: remainder, data });
    }

    for (const filter of options.filters ?? []) {
      entries = entries.filter((entry) => matches(entry.data, filter.field, filter.op, filter.value));
    }

    if (options.orderBy) {
      const { field, direction = 'asc' } = options.orderBy;
      const sign = direction === 'desc' ? -1 : 1;
      entries = [...entries].sort(
        (a, b) => sign * compareValues(fieldPath(a.data, field), fieldPath(b.data, field)),
      );
    }

    if (options.limit !== undefined) entries = entries.slice(0, options.limit);

    return entries.map((entry) => ({ id: entry.id, data: clone(entry.data) as T }));
  }

  async deleteMany(paths: string[]): Promise<void> {
    for (const path of paths) this.docs.delete(path);
  }

  async runTransaction<T>(fn: (tx: StoreScope) => Promise<T>): Promise<T> {
    return fn(this);
  }

  clear(): void {
    this.docs.clear();
  }
}
