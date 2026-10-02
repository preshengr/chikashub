import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { GameService } from './game.service';
import { GameEventDto } from './dto/game-event.dto';
import { Public } from '../common/decorators/public.decorator';
import { SessionUser, SessionUserParam } from '../common/decorators/session-user.decorator';
import { RateLimit } from '../common/guards/rate-limit.guard';
import { GAMES, getGameById } from './catalog';
import { ApiException } from '../common/api-error';

@Controller('game')
export class GameController {
  constructor(private readonly games: GameService) {}

  /** POST /game/event - realtime gameplay telemetry (start/level/failure/complete). */
  @RateLimit('event')
  @Post('event')
  logEvent(@SessionUserParam() user: SessionUser, @Body() dto: GameEventDto) {
    return this.games.logEvent(user.username, dto);
  }

  /** GET /game/progress - completed levels + progress for the signed-in child. */
  @Get('progress')
  async progress(@SessionUserParam() user: SessionUser, @Query('gameId') gameId?: string) {
    if (gameId) {
      const single = await this.games.getGameProgress(user.username, gameId);
      return { byGame: single ? [single] : [] };
    }
    return this.games.getProgressSummary(user.username);
  }

  /** GET /game/detail?gameId= - single game details (instructions etc.). */
  @Public()
  @Get('detail')
  detail(@Query('gameId') gameId?: string) {
    const game = gameId ? getGameById(gameId) : undefined;
    if (!game) throw ApiException.notFound('Game not found');
    return game;
  }
}

@Controller('games')
export class CatalogController {
  /** GET /games - public catalogue used by the landing page (offline fallback exists client-side). */
  @Public()
  @Get()
  catalog() {
    return { games: GAMES, count: GAMES.length };
  }
}
