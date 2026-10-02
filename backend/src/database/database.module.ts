import { Global, Module } from '@nestjs/common';
import appConfig from '../config/configuration';
import type { AppConfig } from '../config/configuration';
import { DATA_STORE, type DataStore } from './data-store';
import { FirestoreStore } from './firestore.store';
import { MemoryStore } from './memory.store';

@Global()
@Module({
  providers: [
    {
      provide: DATA_STORE,
      useFactory: (config: AppConfig): DataStore => {
        if (config.dataStore !== 'memory' && config.dataStore !== 'firestore') {
          throw new Error(`Unknown DATA_STORE "${config.dataStore}" (expected "memory" or "firestore")`);
        }
        if (config.env === 'production' && config.dataStore !== 'firestore') {
          throw new Error('DATA_STORE=firestore is required when NODE_ENV=production');
        }
        return config.dataStore === 'firestore' ? new FirestoreStore() : new MemoryStore();
      },
      inject: [appConfig.KEY as string],
    },
  ],
  exports: [DATA_STORE],
})
export class DatabaseModule {}
