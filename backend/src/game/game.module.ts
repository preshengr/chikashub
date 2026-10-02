import { Module } from '@nestjs/common';
import { CatalogController, GameController } from './game.controller';
import { GameService } from './game.service';

@Module({
  controllers: [GameController, CatalogController],
  providers: [GameService],
  exports: [GameService],
})
export class GameModule {}
