import { Global, Module } from '@nestjs/common';

import { ScoringResultMapperService } from './scoring.service';

@Global()
@Module({
  providers: [ScoringResultMapperService],
  exports: [ScoringResultMapperService],
})
export class ScoringModule {}
