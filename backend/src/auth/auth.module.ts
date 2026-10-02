import { Global, Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsernameService } from './username.service';

@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthService, UsernameService],
  exports: [AuthService, UsernameService],
})
export class AuthModule {}
