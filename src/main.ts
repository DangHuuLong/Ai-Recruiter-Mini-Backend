// App entrypoint: bootstraps Nest, global pipes/filters/interceptors, Swagger docs, and Bull Board.
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';
import { ANON_SESSION_HEADER } from './common/middleware/anonymous-session.middleware';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformResponseInterceptor } from './common/interceptors/transform-response.interceptor';
import { setupBullBoard } from './queue/bull-board.setup';

// Entry point invoked at the bottom of this file; boots the whole app (Nest, Swagger, Bull Board) when the process starts.
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();

  const configService = app.get(ConfigService);

  const nodeEnv = configService.get<string>('app.nodeEnv') ?? 'development';
  const port = configService.get<number>('app.port') ?? 3000;

  app.setGlobalPrefix('api');

  app.enableCors({
    origin: true,
    credentials: true,
    // Without this, browsers silently drop the x-anon-session-id response header before
    // client JS can read it (fetch() only exposes a small safe-list of headers by default)
    // — the public/anonymous batch flow would create a session that the browser can never
    // persist, then 404 on every follow-up request. Confirmed via curl (unaffected by CORS,
    // worked fine) vs a real browser (silently failed) on the deployed frontend.
    exposedHeaders: [ANON_SESSION_HEADER],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.useGlobalInterceptors(new TransformResponseInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter(nodeEnv));

  if (nodeEnv !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('AI Recruiter Mini Backend')
      .setDescription('API documentation for AI Recruiter Mini Backend')
      .setVersion('1.0.0')
      .addTag('health')
      .addTag('candidates')
      .addTag('resumes')
      .addTag('job-descriptions')
      .addTag('applications')
      .addTag('evaluations')
      .addTag('files')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
  }

  setupBullBoard(app);

  await app.listen(port);
}

bootstrap();
