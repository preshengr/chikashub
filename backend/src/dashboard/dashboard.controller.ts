import { Controller, Get } from '@nestjs/common';
import { SessionUser, SessionUserParam } from '../common/decorators/session-user.decorator';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  /**
   * GET /dashboard - authenticated payload for the Game Dashboard:
   * profile, team badge, age/reading-level filtered games grouped by the
   * child's primary learning goals, and progress aggregates.
   */
  @Get()
  getDashboard(@SessionUserParam() user: SessionUser) {
    return this.dashboard.getDashboard(user.username);
  }
}
