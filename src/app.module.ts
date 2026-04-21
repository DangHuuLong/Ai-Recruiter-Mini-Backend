import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './modules/health/health.module';
import { FilesModule } from './modules/files/files.module';
import { CvModule } from './modules/cv/cv.module';
import { JdModule } from './modules/jd/jd.module';
import { ScreeningModule } from './modules/screening/screening.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    HealthModule,
    FilesModule,
    CvModule,
    JdModule,
    ScreeningModule,
  ],
})
export class AppModule { }