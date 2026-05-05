import { beforeAll, describe, expect, it } from '@jest/globals';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { AiService } from './ai.service';

const shouldRunAiIntegrationTests = process.env.RUN_AI_INTEGRATION_TESTS === 'true';
const describeAiIntegration = shouldRunAiIntegrationTests ? describe : describe.skip;
const shouldRunResumeDocumentParseTest = Boolean(process.env.AI_RESUME_TEST_SIGNED_URL);
const resumeDocumentParseIt = shouldRunResumeDocumentParseTest ? it : it.skip;

describeAiIntegration('AiService Integration', () => {
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

  resumeDocumentParseIt('should call AI parse resume endpoint with a document reference', async () => {
    const result = await service.parseResume({
      resume_id: 'integration-test-resume',
      file_name: process.env.AI_RESUME_TEST_FILE_NAME || 'integration-test-resume.pdf',
      file_type: (process.env.AI_RESUME_TEST_FILE_TYPE as 'PDF' | 'DOCX') || 'PDF',
      signed_url: process.env.AI_RESUME_TEST_SIGNED_URL as string,
      checksum: null,
    });

    expect(result.raw_text).toBeDefined();
    expect(result.parsed_data.personal).toBeDefined();
    expect(result.parsed_data.skills).toBeDefined();
    expect(result.parser_version).toBeDefined();
  });

  it('should call AI parse job description endpoint', async () => {
    const result = await service.parseJobDescription(
      'We are looking for a Backend Developer with Python, FastAPI, PostgreSQL and Docker.',
    );

    expect(result.required_skills).toBeDefined();
  });

  it('should call AI score application endpoint', async () => {
    const resume = shouldRunResumeDocumentParseTest
      ? (
          await service.parseResume({
            resume_id: 'integration-test-resume',
            file_name: process.env.AI_RESUME_TEST_FILE_NAME || 'integration-test-resume.pdf',
            file_type: (process.env.AI_RESUME_TEST_FILE_TYPE as 'PDF' | 'DOCX') || 'PDF',
            signed_url: process.env.AI_RESUME_TEST_SIGNED_URL as string,
            checksum: null,
          })
        ).parsed_data
      : {
          personal: {
            full_name: 'Nguyen Van A',
            email: null,
            phone: null,
            location: null,
            linkedin_url: null,
            github_url: null,
            portfolio_url: null,
          },
          summary: 'Backend developer with Python, FastAPI and PostgreSQL.',
          skills: [
            {
              name: 'Python',
              normalized_name: 'python',
              category: 'language',
              evidence: 'Python, FastAPI and PostgreSQL',
            },
            {
              name: 'FastAPI',
              normalized_name: 'fastapi',
              category: 'framework',
              evidence: 'Python, FastAPI and PostgreSQL',
            },
          ],
          education: [],
          experience: [],
          projects: [],
          certifications: [],
          achievements: [],
          languages: [],
        };

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
