import { beforeAll, describe, expect, it } from '@jest/globals';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { AiService } from './ai.service';

describe('AiService Integration', () => {
  let service: AiService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
        }),
        HttpModule.register({
          baseURL: process.env.AI_SERVICE_URL || 'http://localhost:8000',
          timeout: Number(process.env.AI_REQUEST_TIMEOUT_MS || 30000),
        }),
      ],
      providers: [AiService],
    }).compile();

    service = module.get<AiService>(AiService);
  });

  it('should call AI health endpoint', async () => {
    const result = await service.checkHealth();

    expect(result.status).toBe('healthy');
  });

  it('should call AI parse resume endpoint', async () => {
    const result = await service.parseResume(
      'Nguyen Van A is a backend developer with Python, FastAPI and PostgreSQL.',
    );

    expect(result.personal).toBeDefined();
    expect(result.skills).toBeDefined();
  });

  it('should call AI parse job description endpoint', async () => {
    const result = await service.parseJobDescription(
      'We are looking for a Backend Developer with Python, FastAPI, PostgreSQL and Docker.',
    );

    expect(result.required_skills).toBeDefined();
  });

  it('should call AI score application endpoint', async () => {
    const resume = await service.parseResume(
      'Nguyen Van A is a backend developer with Python, FastAPI and PostgreSQL.',
    );

    const jobDescription = await service.parseJobDescription(
      'We are looking for a Backend Developer with Python, FastAPI, PostgreSQL and Docker.',
    );

    const result = await service.scoreApplication(resume, jobDescription, [
      {
        criterion: 'SKILLS_MATCH',
        weight: 0.35,
      },
      {
        criterion: 'EXPERIENCE_RELEVANCE',
        weight: 0.3,
      },
      {
        criterion: 'PROJECT_RELEVANCE',
        weight: 0.15,
      },
      {
        criterion: 'EDUCATION_CERTIFICATION',
        weight: 0.1,
      },
      {
        criterion: 'KEYWORD_DOMAIN_ALIGNMENT',
        weight: 0.1,
      },
    ]);

    expect(result.overall_score).toBeDefined();
    expect(result.criteria).toBeDefined();
    expect(result.skills).toBeDefined();
    expect(result.explanation).toBeDefined();
    expect(result.interview_questions).toBeDefined();
  });
});
