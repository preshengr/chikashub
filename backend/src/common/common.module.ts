import { Global, Module } from '@nestjs/common';
import { SessionService } from './session.service';

/**
 * Cross-cutting providers shared by every feature module.
 * Marked @Global so SessionService (and future shared services) are
 * injectable without importing this module everywhere.
 */
@Global()
@Module({
  providers: [SessionService],
  exports: [SessionService],
})
export class CommonModule {}
