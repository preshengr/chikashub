import { assertProductionConfig } from './configuration';

describe('assertProductionConfig', () => {
  it('allows the default (development) environment without DATA_STORE', () => {
    expect(() => assertProductionConfig({})).not.toThrow();
    expect(() => assertProductionConfig({ NODE_ENV: 'development' })).not.toThrow();
  });

  it('allows the test environment to keep the in-memory store', () => {
    expect(() => assertProductionConfig({ NODE_ENV: 'test' })).not.toThrow();
    expect(() => assertProductionConfig({ NODE_ENV: 'test', DATA_STORE: 'memory' })).not.toThrow();
  });

  it('allows production when DATA_STORE=firestore', () => {
    expect(() =>
      assertProductionConfig({ NODE_ENV: 'production', DATA_STORE: 'firestore' }),
    ).not.toThrow();
  });

  it('fails production when DATA_STORE is missing', () => {
    expect(() => assertProductionConfig({ NODE_ENV: 'production' })).toThrow(
      /DATA_STORE=firestore is required/,
    );
  });

  it('fails production when DATA_STORE=memory', () => {
    expect(() =>
      assertProductionConfig({ NODE_ENV: 'production', DATA_STORE: 'memory' }),
    ).toThrow(/loses all data on restart/);
  });
});
