import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { GameModule } from '../game/game.module';

@Module({
  imports: [GameModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
