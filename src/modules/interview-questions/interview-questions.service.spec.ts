import { describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { OccupationFamily } from '@prisma/client';

import { CreateInterviewQuestionDto } from './dto/create-interview-question.dto';
import { SearchInterviewQuestionsDto } from './dto/search-interview-questions.dto';
import { InterviewQuestionsService } from './interview-questions.service';
import { InterviewQuestionGeneratorService } from './interview-question-generator.service';
import { AppException } from '../../common/exceptions/app.exception';
import { PrismaService } from '../../database/prisma/prisma.service';
import { GeminiEmbeddingService } from '../../integrations/llm-providers/gemini-embedding.service';

function buildPrismaMock() {
  const findUnique = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const findMany = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const count = jest.fn<(...args: unknown[]) => Promise<number>>();
  const deleteEntry = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const txCreate = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const txUpdate = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const executeRaw = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const queryRaw = jest.fn<(...args: unknown[]) => Promise<unknown>>();

  const transaction = jest.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
    callback({
      interviewQuestionEntry: { create: txCreate, update: txUpdate },
      $executeRaw: executeRaw,
    }),
  );

  const prisma = {
    interviewQuestionEntry: { findUnique, findMany, count, delete: deleteEntry },
    $transaction: transaction,
    $executeRaw: executeRaw,
    $queryRaw: queryRaw,
  } as unknown as PrismaService;

  return { prisma, findUnique, findMany, count, deleteEntry, txCreate, txUpdate, executeRaw, queryRaw, transaction };
}

function buildEmbeddingMock() {
  const embed = jest.fn<(...args: unknown[]) => Promise<number[]>>().mockResolvedValue([0.1, 0.2, 0.3]);
  const embeddingService = { embed } as unknown as GeminiEmbeddingService;
  return { embeddingService, embed };
}

function buildGeneratorMock() {
  const generate = jest.fn<(...args: unknown[]) => Promise<unknown[]>>().mockResolvedValue([]);
  const generatorService = { generate } as unknown as InterviewQuestionGeneratorService;
  return { generatorService, generate };
}

function buildConfigMock() {
  const get = jest.fn().mockReturnValue(undefined);
  const configService = { get } as unknown as ConfigService;
  return { configService, get };
}

function buildService() {
  const prismaMock = buildPrismaMock();
  const embeddingMock = buildEmbeddingMock();
  const generatorMock = buildGeneratorMock();
  const configMock = buildConfigMock();

  const service = new InterviewQuestionsService(
    prismaMock.prisma,
    embeddingMock.embeddingService,
    generatorMock.generatorService,
    configMock.configService,
  );

  return { service, prismaMock, embeddingMock, generatorMock, configMock };
}

const CREATE_DTO: CreateInterviewQuestionDto = {
  questionText: 'How would you design a caching strategy for a read-heavy API?',
  occupationFamily: OccupationFamily.IT,
  specialization: 'Backend',
  enablers: ['Redis'],
  businessContext: 'E-commerce',
  competency: 'Caching Strategies',
  competencyType: 'HARD_SKILL',
  assessmentTarget: 'DECISION_MAKING',
  experienceBucket: 'TWO_TO_FOUR',
  autonomyLevel: 'WORKS_INDEPENDENTLY',
  questionType: 'DECISION_MAKING',
  rubric: ['Mentions TTL', 'Mentions cache invalidation'],
} as unknown as CreateInterviewQuestionDto;

const SEARCH_DTO: SearchInterviewQuestionsDto = {
  queryText: 'caching strategy for a read-heavy API',
  occupationFamily: OccupationFamily.IT,
  specialization: 'Backend',
  limit: 5,
};

describe('InterviewQuestionsService.create', () => {
  it('embeds the question text and defaults qualityGateStatus to APPROVED when omitted', async () => {
    const { service, prismaMock, embeddingMock } = buildService();
    prismaMock.txCreate.mockResolvedValue({ id: 'q-1' });

    const result = await service.create(CREATE_DTO);

    expect(result).toEqual({ id: 'q-1' });
    expect(embeddingMock.embed).toHaveBeenCalledWith(CREATE_DTO.questionText);
    expect(prismaMock.txCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ qualityGateStatus: 'APPROVED' }) }),
    );
    expect(prismaMock.executeRaw).toHaveBeenCalled();
  });
});

describe('InterviewQuestionsService.createBulk', () => {
  it('collects per-item success/failure without stopping on the first error', async () => {
    const { service, prismaMock } = buildService();
    prismaMock.txCreate
      .mockResolvedValueOnce({ id: 'q-1' })
      .mockRejectedValueOnce(new Error('duplicate question'))
      .mockResolvedValueOnce({ id: 'q-3' });

    const results = await service.createBulk([CREATE_DTO, CREATE_DTO, CREATE_DTO]);

    expect(results).toEqual([
      { index: 0, success: true, data: { id: 'q-1' } },
      { index: 1, success: false, error: 'duplicate question' },
      { index: 2, success: true, data: { id: 'q-3' } },
    ]);
  });
});

describe('InterviewQuestionsService.update', () => {
  it('re-embeds when questionText changes', async () => {
    const { service, prismaMock, embeddingMock } = buildService();
    prismaMock.findUnique.mockResolvedValue({ id: 'q-1', questionText: 'old text' });
    prismaMock.txUpdate.mockResolvedValue({ id: 'q-1', questionText: 'new text' });

    await service.update('q-1', { questionText: 'new text' });

    expect(embeddingMock.embed).toHaveBeenCalledWith('new text');
    expect(prismaMock.executeRaw).toHaveBeenCalled();
  });

  it('does not re-embed when questionText is unchanged or omitted', async () => {
    const { service, prismaMock, embeddingMock } = buildService();
    prismaMock.findUnique.mockResolvedValue({ id: 'q-1', questionText: 'same text' });
    prismaMock.txUpdate.mockResolvedValue({ id: 'q-1', qualityGateStatus: 'APPROVED' });

    await service.update('q-1', { qualityGateStatus: 'APPROVED' });

    expect(embeddingMock.embed).not.toHaveBeenCalled();
    expect(prismaMock.executeRaw).not.toHaveBeenCalled();
  });

  it('throws 404 when the question does not exist', async () => {
    const { service, prismaMock } = buildService();
    prismaMock.findUnique.mockResolvedValue(null);

    await expect(service.update('missing', {})).rejects.toThrow(AppException);
  });
});

describe('InterviewQuestionsService.search', () => {
  it('throws 400 for a specialization not known for the given occupationFamily', async () => {
    const { service } = buildService();

    await expect(
      service.search({ ...SEARCH_DTO, specialization: 'Not A Real Specialization' }),
    ).rejects.toThrow(AppException);
  });

  it('runs the vector query for a known specialization', async () => {
    const { service, prismaMock } = buildService();
    prismaMock.queryRaw.mockResolvedValue([{ id: 'q-1', similarity: 0.8 }]);

    const result = await service.search(SEARCH_DTO);

    expect(result).toEqual([{ id: 'q-1', similarity: 0.8 }]);
  });
});

describe('InterviewQuestionsService.searchOrGenerate', () => {
  it('skips the AI fallback when enough high-similarity results already exist', async () => {
    const { service, prismaMock, generatorMock } = buildService();
    prismaMock.queryRaw.mockResolvedValue(
      Array.from({ length: 5 }, (_, i) => ({ id: `q-${i}`, similarity: 0.8 })),
    );

    const result = await service.searchOrGenerate(SEARCH_DTO);

    expect(result.generated).toEqual([]);
    expect(generatorMock.generate).not.toHaveBeenCalled();
  });

  it('triggers the AI fallback when there are fewer results than requested', async () => {
    const { service, prismaMock, generatorMock } = buildService();
    prismaMock.queryRaw.mockResolvedValue([{ id: 'q-1', similarity: 0.9 }]);
    generatorMock.generate.mockResolvedValue([CREATE_DTO]);
    prismaMock.txCreate.mockResolvedValue({ id: 'generated-1' });

    const result = await service.searchOrGenerate(SEARCH_DTO);

    expect(generatorMock.generate).toHaveBeenCalled();
    expect(result.generated).toEqual([{ id: 'generated-1' }]);
  });

  it('triggers the AI fallback when the top result is below the similarity threshold', async () => {
    const { service, prismaMock, generatorMock, configMock } = buildService();
    configMock.get.mockImplementation((key: unknown) =>
      key === 'INTERVIEW_QUESTION_SIMILARITY_THRESHOLD' ? 0.55 : undefined,
    );
    prismaMock.queryRaw.mockResolvedValue(
      Array.from({ length: 5 }, (_, i) => ({ id: `q-${i}`, similarity: 0.3 })),
    );
    generatorMock.generate.mockResolvedValue([]);

    await service.searchOrGenerate(SEARCH_DTO);

    expect(generatorMock.generate).toHaveBeenCalled();
  });

  it('tolerates one generated candidate failing to persist without dropping the others', async () => {
    const { service, prismaMock, generatorMock } = buildService();
    prismaMock.queryRaw.mockResolvedValue([]);
    generatorMock.generate.mockResolvedValue([CREATE_DTO, CREATE_DTO]);
    prismaMock.txCreate
      .mockRejectedValueOnce(new Error('embedding failed'))
      .mockResolvedValueOnce({ id: 'generated-2' });

    const result = await service.searchOrGenerate(SEARCH_DTO);

    expect(result.generated).toEqual([{ id: 'generated-2' }]);
  });
});

describe('InterviewQuestionsService.remove', () => {
  it('throws 404 when the question does not exist', async () => {
    const { service, prismaMock } = buildService();
    prismaMock.findUnique.mockResolvedValue(null);

    await expect(service.remove('missing')).rejects.toThrow(AppException);
  });

  it('deletes the question when it exists', async () => {
    const { service, prismaMock } = buildService();
    prismaMock.findUnique.mockResolvedValue({ id: 'q-1' });

    await expect(service.remove('q-1')).resolves.toEqual({ id: 'q-1', deleted: true });
    expect(prismaMock.deleteEntry).toHaveBeenCalledWith({ where: { id: 'q-1' } });
  });
});
