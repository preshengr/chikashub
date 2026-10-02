import { Inject, Injectable, Logger as NestLogger } from '@nestjs/common';
import { DATA_STORE, type DataStore } from '../database/data-store';
import { ApiException, ErrorCode } from '../common/api-error';
import { getGameById, GAMES, type GameDefinition } from './catalog';
import { EventType, GameEventDto } from './dto/game-event.dto';

export interface GameProgressRow {
  gameId: string;
  title: string;
  icon: string;
  accent: string;
  started: boolean;
  maxLevel: number;
  totalLevels: number;
  bestScore: number;
  failures: number;
  completions: number;
  completed: boolean;
  percent: number;
  lastEventAt: string | null;
}

export interface ProgressSummary {
  byGame: GameProgressRow[];
  overall: {
    gamesStarted: number;
    gamesCompleted: number;
    levelsCompleted: number;
    totalLevels: number;
    percent: number;
    bestScore: number;
    failures: number;
  };
}

interface ProgressRecord {
  maxLevel: number;
  bestScore: number;
  failures: number;
  completions: number;
  started: boolean;
  lastEventAt: string | null;
  updatedAt: string;
}

const MAX_PAYLOAD_CHARS = 2000;

@Injectable()
export class GameService {
  private readonly logger = new NestLogger(GameService.name);

  constructor(@Inject(DATA_STORE) private readonly store: DataStore) {}

  async logEvent(
    username: string,
    dto: GameEventDto,
  ): Promise<{ accepted: true; event: Omit<GameEventDto, 'payload'> }> {
    const game = getGameById(dto.gameId);
    if (!game) {
      this.logger.warn(`Rejected event for unknown game "${dto.gameId}" from ${username}`);
      throw new ApiException(ErrorCode.UNKNOWN_GAME, `Unknown game "${dto.gameId}"`, 400);
    }

    const payload = dto.payload ? JSON.stringify(dto.payload).slice(0, MAX_PAYLOAD_CHARS) : null;
    const now = new Date().toISOString();

    try {
      await this.store.runTransaction(async (tx) => {
        const progressPath = `usernames/${username}/progress/${dto.gameId}`;
        const existing = await tx.get<ProgressRecord>(progressPath);
        const level = dto.level ?? 0;
        const score = dto.score ?? 0;

        let maxLevel = existing?.data.maxLevel ?? 0;
        let bestScore = existing?.data.bestScore ?? 0;
        let failures = existing?.data.failures ?? 0;
        let completions = existing?.data.completions ?? 0;
        let started = existing?.data.started ?? false;

        switch (dto.eventType as EventType) {
          case 'start':
            started = true;
            break;
          case 'level_complete':
            started = true;
            maxLevel = Math.max(maxLevel, level);
            bestScore = Math.max(bestScore, score);
            break;
          case 'failure':
            started = true;
            failures += 1;
            bestScore = Math.max(bestScore, score);
            break;
          case 'game_complete':
            started = true;
            completions += 1;
            maxLevel = Math.max(maxLevel, level);
            bestScore = Math.max(bestScore, score);
            break;
        }

        const eventId = tx.generateId();
        await tx.create(`events/${eventId}`, {
          username,
          gameId: dto.gameId,
          eventType: dto.eventType,
          level,
          score,
          payload,
          clientTimestamp: dto.clientTimestamp ?? now,
          createdAt: now,
        });
        await tx.set(progressPath, {
          maxLevel,
          bestScore,
          failures,
          completions,
          started,
          lastEventAt: now,
          updatedAt: now,
        });
      });
    } catch (err) {
      if (err instanceof ApiException) throw err;
      this.logger.error(
        `Failed to store gameplay event user=${username} game=${dto.gameId} type=${dto.eventType}`,
        (err as Error).stack,
      );
      throw ApiException.unavailable('We could not save that game event. Please keep playing.');
    }

    this.logger.log(
      `event user=${username} game=${dto.gameId} type=${dto.eventType} level=${dto.level ?? 0}`,
    );
    return {
      accepted: true,
      event: { gameId: dto.gameId, eventType: dto.eventType, level: dto.level, score: dto.score },
    };
  }

  async getProgressSummary(
    username: string,
    games: GameDefinition[] = GAMES,
  ): Promise<ProgressSummary> {
    const rows = await this.store.query<ProgressRecord>(`usernames/${username}/progress`);
    const byId = new Map(rows.map((row) => [row.id, row.data]));

    const byGame: GameProgressRow[] = games
      .filter((game) => byId.has(game.id))
      .map((game) => {
        const row = byId.get(game.id)!;
        const maxLevel = Math.min(row.maxLevel, game.totalLevels);
        return {
          gameId: game.id,
          title: game.title,
          icon: game.icon,
          accent: game.accent,
          started: row.started === true,
          maxLevel,
          totalLevels: game.totalLevels,
          bestScore: row.bestScore,
          failures: row.failures,
          completions: row.completions,
          completed: row.completions > 0 || maxLevel >= game.totalLevels,
          percent: Math.round((maxLevel / game.totalLevels) * 100),
          lastEventAt: row.lastEventAt,
        };
      });

    const totalLevels = byGame.reduce((sum, g) => sum + g.totalLevels, 0);
    const levelsCompleted = byGame.reduce((sum, g) => sum + g.maxLevel, 0);
    const overall = {
      gamesStarted: byGame.filter((g) => g.started).length,
      gamesCompleted: byGame.filter((g) => g.completed).length,
      levelsCompleted,
      totalLevels,
      percent: totalLevels > 0 ? Math.round((levelsCompleted / totalLevels) * 100) : 0,
      bestScore: byGame.reduce((sum, g) => sum + g.bestScore, 0),
      failures: byGame.reduce((sum, g) => sum + g.failures, 0),
    };

    return { byGame, overall };
  }

  async getGameProgress(username: string, gameId: string): Promise<GameProgressRow | undefined> {
    const summary = await this.getProgressSummary(
      username,
      GAMES.filter((g) => g.id === gameId),
    );
    return summary.byGame[0];
  }
}
