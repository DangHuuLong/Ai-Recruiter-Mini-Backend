import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

// import { AppConfig } from './config/app.config';
// import { DatabaseConfig } from './config/database.config';
// import { envValidationSchema } from './config/env.validation';
// import { PrismaModule } from './database/prisma/prisma.module';
// import { ApplicationsModule } from './modules/applications/applications.module';
// import { CandidatesModule } from './modules/candidates/candidates.module';
// import { EvaluationsModule } from './modules/evaluations/evaluations.module';
// import { FilesModule } from './modules/files/files.module';
import { HealthModule } from './modules/health/health.module';
// import { JobDescriptionsModule } from './modules/job-descriptions/job-descriptions.module';
// import { ResumesModule } from './modules/resumes/resumes.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // load: [AppConfig, DatabaseConfig],
      // validationSchema: envValidationSchema,
    }),
    // PrismaModule,
    HealthModule,
    // FilesModule,
    // CandidatesModule,
    // ResumesModule,
    // JobDescriptionsModule,
    // ApplicationsModule,
    // EvaluationsModule,
  ],
})
export class AppModule { }