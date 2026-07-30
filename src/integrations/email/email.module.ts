// Global module exposing EmailService for sending transactional emails app-wide.
import { Global, Module } from '@nestjs/common';

import { EmailService } from './email.service';

@Global()
@Module({
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
