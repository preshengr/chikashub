import {
  cert,
  getApp,
  getApps,
  initializeApp,
  type AppOptions,
  type ServiceAccount,
} from 'firebase-admin/app';
import {
  getFirestore,
  type Firestore,
  type Query,
  type QueryDocumentSnapshot,
  type Transaction,
} from 'firebase-admin/firestore';
import {
  DataExistsError,
  type DataStore,
  type Doc,
  type FilterOp,
  type QueryOptions,
  type StoreScope,
} from './data-store';

function isAlreadyExists(error: unknown): boolean {
  const code = (error as { code?: number | string } | null)?.code;
  return code === 6 || code === 'already-exists' || code === 'ALREADY_EXISTS';
}

/**
 * Credentials for hosts outside Google Cloud (Railway, a VPS, a laptop):
 * `FIRESTORE_SERVICE_ACCOUNT` holds the service-account JSON key verbatim.
 * When unset, firebase-admin falls back to Application Default Credentials —
 * the metadata server on GCP, or the emulator when FIRESTORE_EMULATOR_HOST is set.
 */
function firestoreCredentialOptions(): AppOptions | undefined {
  const raw = process.env.FIRESTORE_SERVICE_ACCOUNT?.trim();
  if (!raw) return undefined;

  let account: ServiceAccount & Record<string, unknown>;
  try {
    account = JSON.parse(raw) as ServiceAccount & Record<string, unknown>;
  } catch {
    throw new Error(
      'FIRESTORE_SERVICE_ACCOUNT is not valid JSON — paste the service-account key ' +
        'file contents exactly as downloaded.',
    );
  }
  if (!(account.clientEmail ?? account.client_email) || !(account.privateKey ?? account.private_key)) {
    throw new Error(
      'FIRESTORE_SERVICE_ACCOUNT must contain "client_email" and "private_key" ' +
        '(Firebase console → Project settings → Service accounts).',
    );
  }
  return { credential: cert(account) };
}

export class FirestoreStore implements DataStore {
  private readonly db: Firestore;

  constructor() {
    let app;
    try {
      app = getApps().length > 0 ? getApp() : initializeApp(firestoreCredentialOptions());
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to initialise Cloud Firestore: ${reason}. Outside Google Cloud, set ` +
          'FIRESTORE_SERVICE_ACCOUNT to the service-account JSON; locally use the ' +
          'Firestore emulator (FIRESTORE_EMULATOR_HOST) or Application Default Credentials.',
      );
    }
    this.db = getFirestore(app);
  }

  generateId(): string {
    return this.db.collection('_').doc().id;
  }

  async get<T>(path: string): Promise<Doc<T> | undefined> {
    const snapshot = await this.db.doc(path).get();
    if (!snapshot.exists) return undefined;
    return { id: snapshot.id, data: snapshot.data() as T };
  }

  async create<T>(path: string, data: T): Promise<void> {
    try {
      await this.db.doc(path).create(data as Record<string, unknown>);
    } catch (error) {
      if (isAlreadyExists(error)) throw new DataExistsError(path);
      throw error;
    }
  }

  async set<T>(path: string, data: T, options?: { merge?: boolean }): Promise<void> {
    const ref = this.db.doc(path);
    if (options?.merge) {
      await ref.set(data as Record<string, unknown>, { merge: true });
    } else {
      await ref.set(data as Record<string, unknown>);
    }
  }

  async delete(path: string): Promise<void> {
    await this.db.doc(path).delete();
  }

  async query<T>(collectionPath: string, options: QueryOptions = {}): Promise<Doc<T>[]> {
    let query: Query = this.db.collection(collectionPath);
    for (const filter of options.filters ?? []) {
      query = query.where(filter.field, filter.op as FilterOp, filter.value);
    }
    if (options.orderBy) {
      query = query.orderBy(options.orderBy.field, options.orderBy.direction ?? 'asc');
    }
    if (options.limit !== undefined) {
      query = query.limit(options.limit);
    }
    const snapshot = await query.get();
    return snapshot.docs.map((doc: QueryDocumentSnapshot) => ({ id: doc.id, data: doc.data() as T }));
  }

  async deleteMany(paths: string[]): Promise<void> {
    const CHUNK = 400;
    for (let index = 0; index < paths.length; index += CHUNK) {
      const batch = this.db.batch();
      for (const path of paths.slice(index, index + CHUNK)) {
        batch.delete(this.db.doc(path));
      }
      await batch.commit();
    }
  }

  async runTransaction<T>(fn: (tx: StoreScope) => Promise<T>): Promise<T> {
    return this.db.runTransaction((transaction: Transaction) =>
      fn(new TransactionScope(transaction, this.db)),
    );
  }
}

class TransactionScope implements StoreScope {
  constructor(
    private readonly tx: Transaction,
    private readonly db: Firestore,
  ) {}

  generateId(): string {
    return this.db.collection('_').doc().id;
  }

  async get<T>(path: string): Promise<Doc<T> | undefined> {
    const snapshot = await this.tx.get(this.db.doc(path));
    if (!snapshot.exists) return undefined;
    return { id: snapshot.id, data: snapshot.data() as T };
  }

  async create<T>(path: string, data: T): Promise<void> {
    try {
      await this.tx.create(this.db.doc(path), data as Record<string, unknown>);
    } catch (error) {
      if (isAlreadyExists(error)) throw new DataExistsError(path);
      throw error;
    }
  }

  async set<T>(path: string, data: T, options?: { merge?: boolean }): Promise<void> {
    const ref = this.db.doc(path);
    if (options?.merge) {
      this.tx.set(ref, data as Record<string, unknown>, { merge: true });
    } else {
      this.tx.set(ref, data as Record<string, unknown>);
    }
  }

  async delete(path: string): Promise<void> {
    this.tx.delete(this.db.doc(path));
  }
}
