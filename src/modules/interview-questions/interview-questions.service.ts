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

  async create(dto: CreateInterviewQuestionDto) {
    // Embed before touching the DB — a question with no embedding is
    // useless for retrieval, so a failed embed must not leave a row behind.
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
          // A human (DEV role) typed this in directly, so it's reviewed by
          // definition — defaults to APPROVED here, unlike the future
          // AI-fallback write-back path which must start at PENDING_REVIEW.
          qualityGateStatus: dto.qualityGateStatus ?? QuestionQualityGateStatus.APPROVED,
        },
      });

      await this.setEmbedding(tx, created.id, embedding);

      return created;
    });
  }

  /**
   * Creates each item independently (sequential, not Promise.all — avoids
   * firing a burst of concurrent Gemini calls that would just trip rate
   * limits faster). One bad item doesn't block the rest, matching the
   * partial-failure philosophy already used for ScoringBatch: the caller
   * gets a per-item result list rather than an all-or-nothing failure.
   */
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

  /** Regenerates the embedding without changing any other field — for backfills after an embedding model change. */
  async reembed(id: string) {
    const existing = await this.ensureExists(id);
    const embedding = await this.embeddingService.embed(existing.questionText);
    await this.setEmbedding(this.prisma, id, embedding);
    return this.ensureExists(id);
  }

  async remove(id: string) {
    await this.ensureExists(id);
    await this.prisma.interviewQuestionEntry.delete({ where: { id } });
    return { id, deleted: true };
  }

  /**
   * Hard-filters on occupationFamily + specialization (+ enablers overlap if
   * given) first, then ranks the filtered set by pgvector cosine similarity —
   * "filter cứng trước, rank semantic sau" from PLAN.md Phase 7. Only
   * APPROVED questions are eligible; PENDING_REVIEW/REJECTED never surface
   * here. Returns raw similarity scores (not a pass/fail against a
   * threshold) — the threshold itself hasn't been decided yet, this is what
   * it gets decided from.
   */
  async search(dto: SearchInterviewQuestionsDto): Promise<SearchResultRow[]> {
    // Distinguishes "valid specialization, no data yet" (keep returning empty) from a typo'd one.
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

  // Wraps search() with an AI-generation fallback for thin/off-topic results — new questions are written back as PENDING_REVIEW.
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

    // Sequential, not Promise.all — same reasoning as createBulk: avoids a
    // burst of concurrent Gemini embedding calls, and one bad item shouldn't
    // stop the rest from being written back.
    const generated: SearchOrGenerateResult['generated'] = [];
    for (const candidate of candidates) {
      try {
        generated.push(await this.create(candidate));
      } catch {
        // create() already logs its own failures upstream (embedding call);
        // skip this item and keep going rather than losing the whole batch.
      }
    }

    return { existing, generated };
  }

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

  async findOne(id: string) {
    return this.ensureExists(id);
  }

  private async ensureExists(id: string) {
    const entry = await this.prisma.interviewQuestionEntry.findUnique({ where: { id } });
    if (!entry) {
      throw new AppException('Interview question not found', 404);
    }
    return entry;
  }

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

  // embedding is Unsupported("vector(768)") — writes always need raw SQL.
  private async setEmbedding(
    client: PrismaService | Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    id: string,
    embedding: number[],
  ) {
    const vectorLiteral = `[${embedding.join(',')}]`;
    await client.$executeRaw`UPDATE "InterviewQuestionEntry" SET embedding = ${vectorLiteral}::vector WHERE id = ${id}`;
  }
}
