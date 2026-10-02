import { MemoryStore } from '../database/memory.store';
import { ApiException, ErrorCode } from '../common/api-error';
import { GAMES } from './catalog';
import { GameService } from './game.service';
import type { GameEventDto } from './dto/game-event.dto';

const USERNAME = 'chi00001';

function event(overrides: Partial<GameEventDto> = {}): GameEventDto {
  return {
    gameId: 'number-ninja',
    eventType: 'start',
    level: 0,
    score: 0,
    ...overrides,
  } as GameEventDto;
}

describe('GameService', () => {
  let store: MemoryStore;
  let service: GameService;

  beforeEach(() => {
    store = new MemoryStore();
    service = new GameService(store);
  });

  describe('logEvent', () => {
    it('accepts a start event and marks the game as started', async () => {
      const result = await service.logEvent(USERNAME, event({ eventType: 'start' }));
      expect(result).toEqual({
        accepted: true,
        event: { gameId: 'number-ninja', eventType: 'start', level: 0, score: 0 },
      });

      const summary = await service.getProgressSummary(USERNAME);
      expect(summary.byGame).toHaveLength(1);
      expect(summary.byGame[0].started).toBe(true);
      expect(summary.byGame[0].percent).toBe(0);
    });

    it('tracks the highest level reached', async () => {
      await service.logEvent(USERNAME, event({ eventType: 'start' }));
      await service.logEvent(USERNAME, event({ eventType: 'level_complete', level: 3, score: 300 }));
      await service.logEvent(USERNAME, event({ eventType: 'level_complete', level: 1, score: 100 }));

      const [row] = (await service.getProgressSummary(USERNAME)).byGame;
      expect(row.maxLevel).toBe(3);
      expect(row.bestScore).toBe(300);
    });

    it('counts failures but never lets them exceed the aggregate', async () => {
      await service.logEvent(USERNAME, event({ eventType: 'failure', level: 2, score: 50 }));
      await service.logEvent(USERNAME, event({ eventType: 'failure', level: 2, score: 50 }));
      const [row] = (await service.getProgressSummary(USERNAME)).byGame;
      expect(row.failures).toBe(2);
      expect(row.started).toBe(true);
    });

    it('records game completion', async () => {
      await service.logEvent(USERNAME, event({ eventType: 'start' }));
      await service.logEvent(
        USERNAME,
        event({ eventType: 'game_complete', level: 10, score: 1200 }),
      );

      const summary = await service.getProgressSummary(USERNAME);
      expect(summary.byGame[0].completed).toBe(true);
      expect(summary.byGame[0].completions).toBe(1);
      expect(summary.overall.gamesCompleted).toBe(1);
      expect(summary.overall.percent).toBe(100);
    });

    it('keeps an auditable event log', async () => {
      await service.logEvent(USERNAME, event({ eventType: 'start' }));
      await service.logEvent(USERNAME, event({ eventType: 'failure', level: 1 }));
      const rows = await store.query<{ eventType: string; gameId: string; username: string }>(
        'events',
        { orderBy: { field: 'createdAt' } },
      );
      expect(rows.map((row) => row.data.eventType)).toEqual(['start', 'failure']);
      expect(rows[0].data.gameId).toBe('number-ninja');
      expect(rows.every((row) => row.data.username === USERNAME)).toBe(true);
    });

    it('rejects events for games that are not in the catalogue', async () => {
      let thrown: unknown;
      try {
        await service.logEvent(USERNAME, event({ gameId: 'fortnite' }));
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(ApiException);
      expect((thrown as ApiException).code).toBe(ErrorCode.UNKNOWN_GAME);
      expect((thrown as ApiException).getStatus()).toBe(400);
      expect(await store.query('events')).toHaveLength(0);
    });

    it('truncates oversized payloads', async () => {
      await service.logEvent(USERNAME, event({ payload: { blob: 'x'.repeat(5000) } }));
      const rows = await store.query<{ payload: string | null }>('events');
      expect(rows[0].data.payload!.length).toBeLessThanOrEqual(2000);
    });

    it('stores the client timestamp when supplied', async () => {
      const clientTs = '2026-05-04T12:00:00.000Z';
      await service.logEvent(USERNAME, event({ clientTimestamp: clientTs }));
      const rows = await store.query<{ clientTimestamp: string }>('events');
      expect(rows[0].data.clientTimestamp).toBe(clientTs);
    });
  });

  describe('getProgressSummary', () => {
    it('returns no rows for a child who has never played', async () => {
      const summary = await service.getProgressSummary(USERNAME);
      expect(summary.byGame).toEqual([]);
      expect(summary.overall).toMatchObject({
        gamesStarted: 0,
        gamesCompleted: 0,
        levelsCompleted: 0,
        percent: 0,
        bestScore: 0,
        failures: 0,
      });
    });

    it('aggregates across multiple games', async () => {
      await service.logEvent(USERNAME, event({ eventType: 'level_complete', level: 4, score: 400 }));
      await service.logEvent(
        USERNAME,
        event({ gameId: 'color-castle', eventType: 'level_complete', level: 6, score: 600 }),
      );

      const summary = await service.getProgressSummary(USERNAME);
      expect(summary.byGame).toHaveLength(2);
      expect(summary.overall.levelsCompleted).toBe(10);
      expect(summary.overall.bestScore).toBe(1000);
      expect(summary.overall.gamesStarted).toBe(2);
      expect(summary.overall.totalLevels).toBe(20);
      expect(summary.overall.percent).toBe(50);
    });

    it('caps levels at the game total and computes a percentage', async () => {
      await service.logEvent(USERNAME, event({ eventType: 'level_complete', level: 999, score: 10 }));
      const [row] = (await service.getProgressSummary(USERNAME)).byGame;
      expect(row.maxLevel).toBeLessThanOrEqual(row.totalLevels);
      expect(row.percent).toBeLessThanOrEqual(100);
    });

    it('only includes the requested game when asked for one', async () => {
      await service.logEvent(USERNAME, event({ eventType: 'level_complete', level: 1, score: 10 }));
      await service.logEvent(
        USERNAME,
        event({ gameId: 'color-castle', eventType: 'level_complete', level: 2, score: 20 }),
      );
      const single = await service.getGameProgress(USERNAME, 'color-castle');
      expect(single?.gameId).toBe('color-castle');
      expect(single?.maxLevel).toBe(2);
      expect(await service.getGameProgress(USERNAME, 'never-played')).toBeUndefined();
    });

    it('exposes catalogue metadata for every progress row', async () => {
      await service.logEvent(USERNAME, event({ eventType: 'start' }));
      const [row] = (await service.getProgressSummary(USERNAME, GAMES)).byGame;
      expect(row.title).toBe('Number Ninja');
      expect(row.icon).toBeTruthy();
      expect(row.accent).toMatch(/^#/);
    });
  });
});
