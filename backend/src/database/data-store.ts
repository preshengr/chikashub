export const DATA_STORE = 'DATA_STORE';

export interface Doc<T = Record<string, unknown>> {
  id: string;
  data: T;
}

export type FilterOp = '==' | '!=' | '<' | '<=' | '>' | '>=' | 'in' | 'array-contains';

export interface QueryFilter {
  field: string;
  op: FilterOp;
  value: unknown;
}

export interface QueryOptions {
  filters?: QueryFilter[];
  orderBy?: { field: string; direction?: 'asc' | 'desc' };
  limit?: number;
}

export interface StoreScope {
  get<T>(path: string): Promise<Doc<T> | undefined>;
  create<T>(path: string, data: T): Promise<void>;
  set<T>(path: string, data: T, options?: { merge?: boolean }): Promise<void>;
  delete(path: string): Promise<void>;
  generateId(): string;
}

export interface DataStore extends StoreScope {
  query<T>(collectionPath: string, options?: QueryOptions): Promise<Doc<T>[]>;
  deleteMany(paths: string[]): Promise<void>;
  runTransaction<T>(fn: (tx: StoreScope) => Promise<T>): Promise<T>;
}

export class DataExistsError extends Error {
  readonly code = 'ALREADY_EXISTS';

  constructor(readonly path: string) {
    super(`Document already exists: ${path}`);
    this.name = 'DataExistsError';
  }
}
