// Wires AiService with an HttpClient configured from AI_SERVICE_URL / AI_REQUEST_TIMEOUT_MS.
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { AiService } from './ai.service';
import { AiActivityLogModule } from '../../modules/ai-activity-log/ai-activity-log.module';

@Module({
  imports: [
    ConfigModule,
    AiActivityLogModule,
    HttpModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        baseURL: configService.get<string>('AI_SERVICE_URL'),
        timeout: configService.get<number>('AI_REQUEST_TIMEOUT_MS') ?? 30000,
      }),
    }),
  ],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
