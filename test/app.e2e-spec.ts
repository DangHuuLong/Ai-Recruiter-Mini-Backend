// Boots the real app against live DB/Redis/Supabase; gated by RUN_E2E_TESTS since it needs those services.
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from './../src/app.module';

const shouldRunE2eTests = process.env.RUN_E2E_TESTS === 'true';
const describeE2e = shouldRunE2eTests ? describe : describe.skip;

describeE2e('AppController (e2e)', () => {
  let app: INestApplication<App>;

  // Boots the whole app once per test, matching the real global prefix/pipes set up in main.ts.
  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  it('/api/health (GET) reports a healthy service', () => {
    return request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect((res) => {
        expect(res.body.status).toBe('healthy');
      });
  });

  afterEach(async () => {
    await app.close();
  });
});
