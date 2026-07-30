// Service for the shared InterviewQuestionEntry bank: CRUD, embedding-backed semantic search with hard taxonomy filters, and AI-fallback generation on thin results.
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, QuestionQualityGateStatus } from '@prisma/client';

import { CreateInterviewQuestionDto } from './dto/create-interview-question.dto';
import { InterviewQuestionQueryDto } from './dto/interview-question-query.dto';
import { SearchInterviewQuestionsDto } from './dto/search-interview-questions.dto';
import { UpdateInterviewQuestionDto } from './dto/update-interview-question.dto';
import { InterviewQuestionGeneratorService } from './interview-question-generator.service';
import { AppException } from '../../common/exceptions/app.exception';
import { INTERVIEW_QUESTION_TAXONOMY } from '../../common/constants/interview-question-taxonomy';
import { PrismaService } from '../../database/prisma/prisma.service';
import { GeminiEmbeddingService } from '../../integrations/llm-providers/gemini-embedding.service';

export interface SearchResultRow {
  id: string;
  questionText: string;
  specialization: string;
  businessContext: string;
  competency: string;
  competencyType: string;
  assessmentTarget: string;
  experienceBucket: string;
  autonomyLevel: string;
  questionType: string;
  rubric: string[];
  similarity: number;
}

export interface SearchOrGenerateResult {
  existing: SearchResultRow[];
  generated: Awaited<ReturnType<InterviewQuestionsService['create']>>[];
}

@Injectable()
export class InterviewQuestionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddingService: GeminiEmbeddingService,
    private readonly generatorService: InterviewQuestionGeneratorService,
    private readonly configService: ConfigService,
  ) {}

  // Called by createBulk, searchOrGenerate, and InterviewQuestionsController.create — embeds and persists a new InterviewQuestionEntry.
  async create(dto: CreateInterviewQuestionDto) {
    const embedding = await this.embeddingService.embed(dto.questionText);

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.interviewQuestionEntry.create({
        data: {
          questionText: dto.questionText,
          occupationFamily: dto.occupationFamily,
          specialization: dto.specialization,
          enablers: dto.enablers,
          businessContext: dto.businessContext,
          competency: dto.competency,
          competencyType: dto.competencyType,
          assessmentTarget: dto.assessmentTarget,
          experienceBucket: dto.experienceBucket,
          autonomyLevel: dto.autonomyLevel,
          questionType: dto.questionType,
          rubric: dto.rubric,
          source: dto.source,
          qualityGateStatus: dto.qualityGateStatus ?? QuestionQualityGateStatus.APPROVED,
        },
      });

      await this.setEmbedding(tx, created.id, embedding);

      return created;
    });
  }

  // Called by InterviewQuestionsController.createBulk — runs create() per item, collecting per-index success/failure results.
  async createBulk(items: CreateInterviewQuestionDto[]) {
    const results: Array<
      { index: number; success: true; data: Awaited<ReturnType<InterviewQuestionsService['create']>> }
      | { index: number; success: false; error: string }
    > = [];

    for (const [index, dto] of items.entries()) {
      try {
        const created = await this.create(dto);
        results.push({ index, success: true, data: created });
      } catch (error) {
        results.push({
          index,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  }

  // Called by InterviewQuestionsController.update — partial update that re-embeds only if questionText changed.
  async update(id: string, dto: UpdateInterviewQuestionDto) {
    const existing = await this.ensureExists(id);
    const newEmbedding =
      dto.questionText && dto.questionText !== existing.questionText
        ? await this.embeddingService.embed(dto.questionText)
        : null;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.interviewQuestionEntry.update({
        where: { id },
        data: {
          questionText: dto.questionText,
          occupationFamily: dto.occupationFamily,
          specialization: dto.specialization,
          enablers: dto.enablers,
          businessContext: dto.businessContext,
          competency: dto.competency,
          competencyType: dto.competencyType,
          assessmentTarget: dto.assessmentTarget,
          experienceBucket: dto.experienceBucket,
          autonomyLevel: dto.autonomyLevel,
          questionType: dto.questionType,
          rubric: dto.rubric,
          qualityGateStatus: dto.qualityGateStatus,
        },
      });

      if (newEmbedding) {
        await this.setEmbedding(tx, id, newEmbedding);
      }

      return updated;
    });
  }

  // Called by InterviewQuestionsController.reembed — recomputes the vector embedding for an existing question's text.
  async reembed(id: string) {
    const existing = await this.ensureExists(id);
    const embedding = await this.embeddingService.embed(existing.questionText);
    await this.setEmbedding(this.prisma, id, embedding);
    return this.ensureExists(id);
  }

  // Called by InterviewQuestionsController.remove — hard-deletes an InterviewQuestionEntry after existence check.
  async remove(id: string) {
    await this.ensureExists(id);
    await this.prisma.interviewQuestionEntry.delete({ where: { id } });
    return { id, deleted: true };
  }

  // Called by InterviewQuestionsController.search and by searchOrGenerate — pgvector similarity search filtered by taxonomy fields.
  async search(dto: SearchInterviewQuestionsDto): Promise<SearchResultRow[]> {
    this.ensureKnownSpecialization(dto.occupationFamily, dto.specialization);

    const queryEmbedding = await this.embeddingService.embed(dto.queryText);
    const vectorLiteral = `[${queryEmbedding.join(',')}]`;

    const enablersFilter =
      dto.enablers && dto.enablers.length > 0
        ? Prisma.sql`AND enablers && ${dto.enablers}::text[]`
        : Prisma.empty;

    return this.prisma.$queryRaw<SearchResultRow[]>`
      SELECT
        id,
        "questionText",
        specialization,
        "businessContext",
        competency,
        "competencyType",
        "assessmentTarget",
        "experienceBucket",
        "autonomyLevel",
        "questionType",
        rubric,
        1 - (embedding <=> ${vectorLiteral}::vector) AS similarity
      FROM "InterviewQuestionEntry"
      WHERE "occupationFamily" = ${dto.occupationFamily}::"OccupationFamily"
        AND specialization = ${dto.specialization}
        AND "qualityGateStatus" = 'APPROVED'
        ${enablersFilter}
      ORDER BY embedding <=> ${vectorLiteral}::vector
      LIMIT ${dto.limit}
    `;
  }

  // Called by InterviewQuestionsController.searchOrGenerate — falls back to InterviewQuestionGeneratorService when results are thin/off-topic.
  async searchOrGenerate(dto: SearchInterviewQuestionsDto): Promise<SearchOrGenerateResult> {
    const existing = await this.search(dto);

    const threshold = this.configService.get<number>('INTERVIEW_QUESTION_SIMILARITY_THRESHOLD') ?? 0.55;
    const needsFallback =
      existing.length < dto.limit || (existing.length > 0 && existing[0].similarity < threshold);

    if (!needsFallback) {
      return { existing, generated: [] };
    }

    const generateCount = this.configService.get<number>('INTERVIEW_QUESTION_FALLBACK_GENERATE_COUNT') ?? 5;
    const candidates = await this.generatorService.generate({
      queryText: dto.queryText,
      occupationFamily: dto.occupationFamily,
      specialization: dto.specialization,
      enablers: dto.enablers,
      count: generateCount,
    });

    const generated: SearchOrGenerateResult['generated'] = [];
    for (const candidate of candidates) {
      try {
        generated.push(await this.create(candidate));
      } catch {}
    }

    return { existing, generated };
  }

  // Called by InterviewQuestionsController.findAll — paginated listing with taxonomy/status filters.
  async findAll(query: InterviewQuestionQueryDto) {
    const where = {
      occupationFamily: query.occupationFamily,
      questionType: query.questionType,
      qualityGateStatus: query.qualityGateStatus,
    };

    const [data, total] = await Promise.all([
      this.prisma.interviewQuestionEntry.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.interviewQuestionEntry.count({ where }),
    ]);

    return {
      data,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  // Called by InterviewQuestionsController.findOne — thin wrapper over ensureExists.
  async findOne(id: string) {
    return this.ensureExists(id);
  }

  // Shared existence check used by findOne, update, reembed, and remove; throws 404 AppException when missing.
  private async ensureExists(id: string) {
    const entry = await this.prisma.interviewQuestionEntry.findUnique({ where: { id } });
    if (!entry) {
      throw new AppException('Interview question not found', 404);
    }
    return entry;
  }

  // Called by search() — validates specialization against INTERVIEW_QUESTION_TAXONOMY before running the DB query.
  private ensureKnownSpecialization(occupationFamily: string, specialization: string): void {
    const taxonomyEntry = INTERVIEW_QUESTION_TAXONOMY.find(
      (entry) => entry.occupationFamily === occupationFamily,
    );
    const known = taxonomyEntry?.specializations ?? [];
    if (!known.includes(specialization)) {
      throw new AppException(
        `Unknown specialization "${specialization}" for occupationFamily "${occupationFamily}". Must be exactly one of: ${known.join(', ')}`,
        400,
      );
    }
  }

  // Called by create() and update()/reembed() — writes the pgvector embedding column via raw SQL.
  private async setEmbedding(
    client: PrismaService | Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    id: string,
    embedding: number[],
  ) {
    const vectorLiteral = `[${embedding.join(',')}]`;
    await client.$executeRaw`UPDATE "InterviewQuestionEntry" SET embedding = ${vectorLiteral}::vector WHERE id = ${id}`;
  }
}
