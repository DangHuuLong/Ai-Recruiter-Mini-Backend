import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { AiService } from './ai.service';

@Module({
  imports: [
    ConfigModule,
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
export class AiModule { }