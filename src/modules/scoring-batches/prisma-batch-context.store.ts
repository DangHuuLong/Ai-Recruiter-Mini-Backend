import { Injectable } from '@nestjs/common';
import { ScoringBatchStatus } from '@prisma/client';

import { DEFAULT_EVALUATION_CRITERIA } from '../../common/constants/default-evaluation-criteria';
import {
  ParsedJobDescriptionData,
  ParsedResumeData,
  ScoreCriterionConfig,
} from '../../common/types/ai-service.types';
import { PrismaService } from '../../database/prisma/prisma.service';
import {
  BatchContextStore,
  CounterResult,
  JdItemPatch,
  ResultPatch,
  ResumeItemPatch,
  ScoreCounterResult,
} from '../../queue/batch-store/batch-context-store.interface';

/** Enterprise (persisted) implementation of BatchContextStore, backed by the ScoringBatch* Postgres tables. */
@Injectable()
export class PrismaBatchContextStore implements BatchContextStore {
  constructor(private readonly prisma: PrismaService) {}

  async updateResumeItem(
    batchId: string,
    resumeItemId: string,
    patch: ResumeItemPatch,
  ): Promise<void> {
    await this.prisma.scoringBatchResume.update({
      where: { id: resumeItemId },
      data: {
        status: patch.status === 'SUCCESS' ? 'SUCCESS' : 'FAILED',
        rawText: patch.rawText,
        parsedData: patch.parsedData as object | undefined,
        parsingError: patch.parsingError,
      },
    });
  }

  async updateJdItem(batchId: string, jdItemId: string, patch: JdItemPatch): Promise<void> {
    await this.prisma.scoringBatchJobDescription.update({
      where: { id: jdItemId },
      data: {
        status: patch.status === 'SUCCESS' ? 'SUCCESS' : 'FAILED',
        parsedData: patch.parsedData as object | undefined,
        parsingError: patch.parsingError,
      },
    });
  }

  async upsertResult(
    batchId: string,
    resumeItemId: string,
    jdItemId: string,
    patch: ResultPatch,
  ): Promise<void> {
    const data = {
      status: patch.status,
      overallScore: patch.overallScore,
      summary: patch.summary,
      criteria: patch.criteria as object | undefined,
      skills: patch.skills as object | undefined,
      explanation: patch.explanation,
      skillGapSummary: patch.skillGapSummary,
      interviewQuestions: patch.interviewQuestions as object | undefined,
      evidenceMap: patch.evidenceMap as object | undefined,
      error: patch.error,
      scoredAt: new Date(),
    };

    await this.prisma.scoringBatchResult.upsert({
      where: { resumeItemId_jdItemId: { resumeItemId, jdItemId } },
      create: { batchId, resumeItemId, jdItemId, ...data },
      update: data,
    });
  }

  async incrementParseCompleted(batchId: string): Promise<CounterResult> {
    const batch = await this.prisma.scoringBatch.findUniqueOrThrow({
      where: { id: batchId },
      select: { totalCvCount: true, totalJdCount: true },
    });

    const [resumeCompleted, jdCompleted] = await Promise.all([
      this.prisma.scoringBatchResume.count({
        where: { batchId, status: { in: ['SUCCESS', 'FAILED'] } },
      }),
      this.prisma.scoringBatchJobDescription.count({
        where: { batchId, status: { in: ['SUCCESS', 'FAILED'] } },
      }),
    ]);

    return {
      completed: resumeCompleted + jdCompleted,
      total: batch.totalCvCount + batch.totalJdCount,
    };
  }

  async incrementScoreCompleted(batchId: string): Promise<ScoreCounterResult> {
    const batch = await this.prisma.scoringBatch.findUniqueOrThrow({
      where: { id: batchId },
      select: { totalPairCount: true },
    });

    const [completed, failed] = await Promise.all([
      this.prisma.scoringBatchResult.count({
        where: { batchId, status: { in: ['COMPLETED', 'FAILED'] } },
      }),
      this.prisma.scoringBatchResult.count({ where: { batchId, status: 'FAILED' } }),
    ]);

    return { completed, total: batch.totalPairCount, failed };
  }

  async getResumeParsedData(
    batchId: string,
    resumeItemId: string,
  ): Promise<ParsedResumeData | null> {
    const item = await this.prisma.scoringBatchResume.findUnique({
      where: { id: resumeItemId },
      select: { parsedData: true },
    });

    return (item?.parsedData as unknown as ParsedResumeData) ?? null;
  }

  async getJdParsedData(
    batchId: string,
    jdItemId: string,
  ): Promise<ParsedJobDescriptionData | null> {
    const item = await this.prisma.scoringBatchJobDescription.findUnique({
      where: { id: jdItemId },
      select: { parsedData: true },
    });

    return (item?.parsedData as unknown as ParsedJobDescriptionData) ?? null;
  }

  async findCachedParsedResumeByChecksum(
    scope: { organizationId?: string },
    checksum: string,
  ): Promise<ParsedResumeData | null> {
    if (!scope.organizationId || !checksum) {
      return null;
    }

    const cached = await this.prisma.scoringBatchResume.findFirst({
      where: {
        checksum,
        status: 'SUCCESS',
        parsedData: { not: null as never },
        batch: { organizationId: scope.organizationId },
      },
      orderBy: { updatedAt: 'desc' },
      select: { parsedData: true },
    });

    return (cached?.parsedData as unknown as ParsedResumeData) ?? null;
  }

  async markBatchStatus(batchId: string, status: ScoringBatchStatus): Promise<void> {
    const isTerminal =
      status === 'COMPLETED' ||
      status === 'COMPLETED_WITH_ERRORS' ||
      status === 'FAILED' ||
      status === 'CANCELLED';

    await this.prisma.scoringBatch.update({
      where: { id: batchId },
      data: {
        status,
        ...(status === 'PARSING' ? { startedAt: new Date() } : {}),
        ...(isTerminal ? { completedAt: new Date() } : {}),
      },
    });
  }

  async getNotifyTarget(
    batchId: string,
  ): Promise<{ webhookUrl?: string | null; email?: string | null }> {
    const batch = await this.prisma.scoringBatch.findUniqueOrThrow({
      where: { id: batchId },
      select: { notifyWebhookUrl: true, notifyEmail: true },
    });

    return { webhookUrl: batch.notifyWebhookUrl, email: batch.notifyEmail };
  }

  async getSuccessfullyParsedItemIds(
    batchId: string,
  ): Promise<{ resumeItemIds: string[]; jdItemIds: string[] }> {
    const [resumeItems, jdItems] = await Promise.all([
      this.prisma.scoringBatchResume.findMany({
        where: { batchId, status: 'SUCCESS' },
        select: { id: true },
      }),
      this.prisma.scoringBatchJobDescription.findMany({
        where: { batchId, status: 'SUCCESS' },
        select: { id: true },
      }),
    ]);

    return {
      resumeItemIds: resumeItems.map((item) => item.id),
      jdItemIds: jdItems.map((item) => item.id),
    };
  }

  async getBatchCriteria(batchId: string): Promise<ScoreCriterionConfig[]> {
    const batch = await this.prisma.scoringBatch.findUniqueOrThrow({
      where: { id: batchId },
      select: { evaluationConfig: { select: { criteriaDefinition: true } } },
    });

    if (!batch.evaluationConfig) {
      return DEFAULT_EVALUATION_CRITERIA;
    }

    return batch.evaluationConfig.criteriaDefinition as unknown as ScoreCriterionConfig[];
  }

  async getBatchTotals(
    batchId: string,
  ): Promise<{ totalCvCount: number; totalJdCount: number; totalPairCount: number }> {
    return this.prisma.scoringBatch.findUniqueOrThrow({
      where: { id: batchId },
      select: { totalCvCount: true, totalJdCount: true, totalPairCount: true },
    });
  }

  async setBatchPairCount(batchId: string, totalPairCount: number): Promise<void> {
    await this.prisma.scoringBatch.update({
      where: { id: batchId },
      data: { totalPairCount },
    });
  }
}
