// Global module wiring for AuthTokenService (email verification / password reset tokens).
import { Global, Module } from '@nestjs/common';

import { AuthTokenService } from './auth-token.service';

@Global()
@Module({
  providers: [AuthTokenService],
  exports: [AuthTokenService],
})
export class AuthTokenModule {}
