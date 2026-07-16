import { Injectable } from '@nestjs/common';
import { Prisma, ScoringBatchJobDescription, ScoringBatchResult } from '@prisma/client';

import { PromoteBatchDto, PromoteItemDto } from './dto/promote-batch.dto';
import { AppException } from '../../common/exceptions/app.exception';
import { ParsedJobDescriptionData, ParsedResumeData } from '../../common/types/ai-service.types';
import { PrismaService } from '../../database/prisma/prisma.service';
import {
  MappedCriterion,
  MappedInterviewQuestion,
  MappedSkill,
  ScoringResultMapperService,
} from '../evaluations/scoring/scoring.service';
import { JobSkillsService } from '../job-descriptions/job-skills.service';

const PROMOTED_PARSER_VERSION = 'promoted-from-scoring-batch';

export interface PromoteItemResult {
  resumeItemId: string;
  candidateId: string;
  resumeId: string;
  jdItemId?: string;
  jobDescriptionId?: string;
  applicationId?: string;
  evaluationId?: string;
}

/**
 * Turns a scored batch cell into the durable Candidate/Resume/JobDescription/
 * Application/Evaluation records. Written directly against Prisma rather
 * than reusing ResumesService.create()/EvaluationsService.create() — both
 * assume "call the AI service now", but a promoted item already has parsed
 * data and a finished score, so nothing needs to be parsed or scored again.
 */
@Injectable()
export class ScoringBatchPromoteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scoringMapper: ScoringResultMapperService,
    private readonly jobSkillsService: JobSkillsService,
  ) {}

  async promote(
    batchId: string,
    dto: PromoteBatchDto,
    organizationId: string,
    userId: string,
  ): Promise<PromoteItemResult[]> {
    const batch = await this.prisma.scoringBatch.findFirst({
      where: { id: batchId, organizationId },
      select: { id: true },
    });

    if (!batch) {
      throw new AppException('Scoring batch not found', 404);
    }

    const results: PromoteItemResult[] = [];

    for (const item of dto.items) {
      results.push(await this.promoteOne(batchId, item, organizationId, userId));
    }

    return results;
  }

  private async promoteOne(
    batchId: string,
    item: PromoteItemDto,
    organizationId: string,
    userId: string,
  ): Promise<PromoteItemResult> {
    const resumeItem = await this.prisma.scoringBatchResume.findFirst({
      where: { id: item.resumeItemId, batchId },
    });

    if (!resumeItem) {
      throw new AppException(`Resume item ${item.resumeItemId} not found in this batch`, 404);
    }

    if (resumeItem.status !== 'SUCCESS' || !resumeItem.parsedData) {
      throw new AppException(`Resume item ${item.resumeItemId} has not been parsed successfully`, 409);
    }

    const parsedResume = resumeItem.parsedData as unknown as ParsedResumeData;
    const candidateId = await this.findOrCreateCandidate(
      organizationId,
      parsedResume,
      resumeItem.candidateLabel,
    );

    const resume = await this.prisma.resume.create({
      data: {
        candidateId,
        fileAssetId: resumeItem.fileAssetId,
        rawText: resumeItem.rawText,
        parsedData: resumeItem.parsedData as Prisma.InputJsonValue,
        parseStatus: 'SUCCESS',
        parserVersion: PROMOTED_PARSER_VERSION,
      },
    });

    if (!resumeItem.candidateId) {
      await this.prisma.scoringBatchResume.update({
        where: { id: resumeItem.id },
        data: { candidateId },
      });
    }

    const result: PromoteItemResult = {
      resumeItemId: resumeItem.id,
      candidateId,
      resumeId: resume.id,
    };

    if (!item.jdItemId) {
      return result;
    }

    const jdItem = await this.prisma.scoringBatchJobDescription.findFirst({
      where: { id: item.jdItemId, batchId },
    });

    if (!jdItem) {
      throw new AppException(`Job description item ${item.jdItemId} not found in this batch`, 404);
    }

    if (jdItem.status !== 'SUCCESS' || !jdItem.parsedData) {
      throw new AppException(
        `Job description item ${item.jdItemId} has not been parsed successfully`,
        409,
      );
    }

    const jobDescriptionId =
      jdItem.jobDescriptionId ?? (await this.createJobDescription(organizationId, userId, jdItem));

    if (!jdItem.jobDescriptionId) {
      await this.prisma.scoringBatchJobDescription.update({
        where: { id: jdItem.id },
        data: { jobDescriptionId },
      });
    }

    const application = await this.findOrCreateApplication(
      organizationId,
      userId,
      candidateId,
      jobDescriptionId,
      resume.id,
    );

    const cell = await this.prisma.scoringBatchResult.findUnique({
      where: { resumeItemId_jdItemId: { resumeItemId: item.resumeItemId, jdItemId: item.jdItemId } },
    });

    if (!cell || cell.status !== 'COMPLETED') {
      throw new AppException(
        `No completed score for resume ${item.resumeItemId} x job description ${item.jdItemId}`,
        409,
      );
    }

    const evaluationId = await this.createEvaluationFromCell(
      organizationId,
      userId,
      application.id,
      cell,
    );

    return {
      ...result,
      jdItemId: jdItem.id,
      jobDescriptionId,
      applicationId: application.id,
      evaluationId,
    };
  }

  private async findOrCreateCandidate(
    organizationId: string,
    parsedResume: ParsedResumeData,
    fallbackName: string | null,
  ): Promise<string> {
    const email = parsedResume.personal?.email ?? null;

    if (email) {
      const existing = await this.prisma.candidate.findFirst({
        where: { organizationId, primaryEmail: email },
        select: { id: true },
      });

      if (existing) {
        return existing.id;
      }
    }

    const candidate = await this.prisma.candidate.create({
      data: {
        organizationId,
        fullName: parsedResume.personal?.full_name ?? fallbackName ?? undefined,
        primaryEmail: email ?? undefined,
        primaryPhone: parsedResume.personal?.phone ?? undefined,
        linkedinUrl: parsedResume.personal?.linkedin_url ?? undefined,
        githubUrl: parsedResume.personal?.github_url ?? undefined,
        portfolioUrl: parsedResume.personal?.portfolio_url ?? undefined,
        location: parsedResume.personal?.location ?? undefined,
        summary: parsedResume.summary ?? undefined,
      },
    });

    return candidate.id;
  }

  private async createJobDescription(
    organizationId: string,
    userId: string,
    jdItem: ScoringBatchJobDescription,
  ): Promise<string> {
    const parsedJd = jdItem.parsedData as unknown as ParsedJobDescriptionData;

    const jobDescription = await this.prisma.jobDescription.create({
      data: {
        organizationId,
        createdById: userId,
        title: jdItem.label ?? parsedJd.title ?? 'Untitled Job Description',
        employmentType: parsedJd.employment_type ?? undefined,
        seniority: parsedJd.seniority ?? undefined,
        rawText: jdItem.rawText,
        parsedData: jdItem.parsedData as Prisma.InputJsonValue,
        parserVersion: PROMOTED_PARSER_VERSION,
        parseStatus: 'SUCCESS',
      },
    });

    await this.jobSkillsService.syncFromParsedData(jobDescription.id, parsedJd);

    return jobDescription.id;
  }

  private async findOrCreateApplication(
    organizationId: string,
    userId: string,
    candidateId: string,
    jobDescriptionId: string,
    resumeId: string,
  ) {
    const existing = await this.prisma.application.findFirst({
      where: { organizationId, candidateId, jobDescriptionId, resumeId },
    });

    if (existing) {
      return existing;
    }

    return this.prisma.application.create({
      data: {
        organizationId,
        candidateId,
        jobDescriptionId,
        resumeId,
        createdById: userId,
        source: 'scoring_batch_promote',
      },
    });
  }

  private async createEvaluationFromCell(
    organizationId: string,
    userId: string,
    applicationId: string,
    cell: ScoringBatchResult,
  ): Promise<string> {
    const criteria = (cell.criteria as unknown as MappedCriterion[] | null) ?? [];
    const skills = (cell.skills as unknown as MappedSkill[] | null) ?? [];
    const interviewQuestions = (cell.interviewQuestions as unknown as MappedInterviewQuestion[] | null) ?? [];
    const scoredAt = cell.scoredAt ?? new Date();

    const evaluation = await this.prisma.$transaction(async (tx) => {
      const created = await tx.evaluation.create({
        data: {
          organizationId,
          applicationId,
          createdById: userId,
          status: 'COMPLETED',
          overallScore: cell.overallScore,
          summary: cell.summary,
          explanation: cell.explanation,
          skillGapSummary: cell.skillGapSummary,
          evidenceMap: (cell.evidenceMap ?? {}) as Prisma.InputJsonValue,
          startedAt: scoredAt,
          completedAt: scoredAt,
        },
      });

      if (criteria.length > 0) {
        await tx.evaluationCriterionScore.createMany({
          data: criteria.map((item) => ({
            evaluationId: created.id,
            criterion: this.scoringMapper.toCriterionName(item.criterion),
            weight: item.weight,
            scoreNormalized: item.scoreNormalized,
            reason: item.reason,
            evidence: (item.evidence ?? []) as Prisma.InputJsonArray,
          })),
        });
      }

      if (skills.length > 0) {
        await tx.evaluationSkill.createMany({
          data: skills.map((item) => ({
            evaluationId: created.id,
            skillName: item.skillName,
            normalizedSkillName: item.normalizedSkillName,
            type: this.scoringMapper.toSkillMatchType(item.type),
            importance: item.importance,
            evidence: item.evidence ? (item.evidence as Prisma.InputJsonValue) : Prisma.JsonNull,
            note: item.note,
          })),
        });
      }

      if (interviewQuestions.length > 0) {
        await tx.evaluationInterviewQuestion.createMany({
          data: interviewQuestions.map((item) => ({
            evaluationId: created.id,
            question: item.question,
            category: item.category,
            linkedSkill: item.linkedSkill,
            difficulty: item.difficulty,
            rationale: item.rationale,
            displayOrder: item.displayOrder,
          })),
        });
      }

      await tx.application.update({
        where: { id: applicationId },
        data: { lastActivityAt: new Date() },
      });

      await tx.applicationEvent.create({
        data: {
          applicationId,
          eventType: 'EVALUATION_COMPLETED',
          eventData: {
            evaluationId: created.id,
            status: 'COMPLETED',
            overallScore: cell.overallScore,
            promotedFromScoringBatch: true,
          },
        },
      });

      return created;
    });

    return evaluation.id;
  }
}
