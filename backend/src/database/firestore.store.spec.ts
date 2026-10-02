import { MemoryStore } from './memory.store';
import { FirestoreStore } from './firestore.store';
import { DataExistsError, type DataStore } from './data-store';

const emulatorReady = Boolean(process.env.FIRESTORE_EMULATOR_HOST && process.env.GCLOUD_PROJECT);
const describeEmulator = emulatorReady ? describe : describe.skip;

function runStoreSuite(name: string, makeStore: () => DataStore | Promise<DataStore>): void {
  describe(name, () => {
    let store: DataStore;

    beforeAll(async () => {
      store = await makeStore();
    });

    beforeEach(async () => {
      const existing = await store.query('parity_probe');
      const nested = await store.query('parity_probe/nested_parent/child_field');
      await store.deleteMany([
        ...existing.map((doc) => `parity_probe/${doc.id}`),
        ...nested.map((doc) => `parity_probe/nested_parent/child_field/${doc.id}`),
      ]);
    });

    it('creates, reads, merges and deletes a document', async () => {
      await store.create('parity_probe/alpha', { count: 1, label: 'one' });
      const read = await store.get<{ count: number; label: string }>('parity_probe/alpha');
      expect(read?.id).toBe('alpha');
      expect(read?.data.count).toBe(1);

      await store.set('parity_probe/alpha', { count: 2 }, { merge: true });
      const merged = await store.get<{ count: number; label: string }>('parity_probe/alpha');
      expect(merged?.data).toEqual({ count: 2, label: 'one' });

      await store.delete('parity_probe/alpha');
      expect(await store.get('parity_probe/alpha')).toBeUndefined();
    });

    it('rejects creating a document that already exists', async () => {
      await store.create('parity_probe/beta', { value: 'first' });
      await expect(store.create('parity_probe/beta', { value: 'second' })).rejects.toThrow(
        DataExistsError,
      );
    });

    it('treats deleting a missing document as a no-op', async () => {
      await expect(store.delete('parity_probe/does-not-exist')).resolves.toBeUndefined();
    });

    it('queries direct children with filters, ordering and limits', async () => {
      await store.create('parity_probe/alpha', { rank: 3, active: true });
      await store.create('parity_probe/beta', { rank: 1, active: false });
      await store.create('parity_probe/gamma', { rank: 2, active: true });
      await store.create('parity_probe/nested_parent/child_field/deep', { rank: 99 });

      const all = await store.query<{ rank: number }>('parity_probe', {
        orderBy: { field: 'rank' },
      });
      expect(all.map((doc) => doc.data.rank)).toEqual([1, 2, 3]);

      const active = await store.query<{ rank: number }>('parity_probe', {
        filters: [{ field: 'active', op: '==', value: true }],
        orderBy: { field: 'rank', direction: 'desc' },
      });
      expect(active.map((doc) => doc.data.rank)).toEqual([3, 2]);

      const limited = await store.query<{ rank: number }>('parity_probe', {
        orderBy: { field: 'rank' },
        limit: 2,
      });
      expect(limited).toHaveLength(2);

      const range = await store.query<{ rank: number }>('parity_probe', {
        filters: [{ field: 'rank', op: '>', value: 1 }],
      });
      expect(range).toHaveLength(2);
    });

    it('runs transactions with create/set/delete semantics', async () => {
      await store.create('parity_probe/alpha', { n: 1 });
      await store.runTransaction(async (tx) => {
        const doc = await tx.get<{ n: number }>('parity_probe/alpha');
        expect(doc?.data.n).toBe(1);
        await tx.set('parity_probe/alpha', { n: (doc?.data.n ?? 0) + 1 }, { merge: true });
        await tx.create('parity_probe/beta', { n: 10 });
        await tx.delete('parity_probe/gamma');
      });

      expect((await store.get<{ n: number }>('parity_probe/alpha'))?.data.n).toBe(2);
      expect((await store.get<{ n: number }>('parity_probe/beta'))?.data.n).toBe(10);
    });

    it('fails the transaction when create hits an existing document', async () => {
      await store.create('parity_probe/gamma', { n: 1 });
      await expect(
        store.runTransaction(async (tx) => {
          await tx.create('parity_probe/gamma', { n: 2 });
        }),
      ).rejects.toThrow(DataExistsError);
    });
  });
}

runStoreSuite('MemoryStore parity', () => new MemoryStore());

describeEmulator('FirestoreStore parity (emulator)', () => {
  runStoreSuite('FirestoreStore', () => new FirestoreStore());
});
