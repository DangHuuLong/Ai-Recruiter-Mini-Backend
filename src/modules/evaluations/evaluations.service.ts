import { Injectable } from '@nestjs/common';
import { EvaluationStatus, Prisma } from '@prisma/client';

import { CreateEvaluationDto } from './dto/create-evaluation.dto';
import { EvaluationQueryDto } from './dto/evaluation-query.dto';
import { JobDescriptionTaxonomy, ScoringResultMapperService } from './scoring/scoring.service';
import { DEFAULT_EVALUATION_CRITERIA } from '../../common/constants/default-evaluation-criteria';
import { AppException } from '../../common/exceptions/app.exception';
import {
  EvaluationResult,
  ParsedJobDescriptionData,
  ParsedResumeData,
  ScoreCriterionConfig,
} from '../../common/types/ai-service.types';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AiService } from '../../integrations/ai/ai.service';

const APPLICATION_EVENT_EVALUATION_COMPLETED = 'EVALUATION_COMPLETED';
const APPLICATION_EVENT_EVALUATION_FAILED = 'EVALUATION_FAILED';

@Injectable()
export class EvaluationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly scoringMapper: ScoringResultMapperService,
  ) {}

  async create(createEvaluationDto: CreateEvaluationDto, currentUserId: string, organizationId: string) {
    const context = await this.buildScoringContext(createEvaluationDto, organizationId);

    const evaluation = await this.prisma.evaluation.create({
      data: {
        organizationId,
        applicationId: context.application.id,
        configId: context.configId,
        createdById: currentUserId,
        status: EvaluationStatus.PROCESSING,
        startedAt: new Date(),
      },
      include: this.getEvaluationInclude(),
    });

    return this.scoreAndPersistEvaluation(
      evaluation.id,
      context.application.id,
      context.resumeData,
      context.jobDescriptionData,
      context.criteria,
      context.jobDescriptionTaxonomy,
    );
  }

  async findAll(query: EvaluationQueryDto, organizationId: string) {
    const page = query.page;
    const limit = query.limit;
    const skip = (page - 1) * limit;

    const where: Prisma.EvaluationWhereInput = {
      organizationId,
      ...(query.applicationId ? { applicationId: query.applicationId } : {}),
      ...(query.configId ? { configId: query.configId } : {}),
      ...(query.createdById ? { createdById: query.createdById } : {}),
      ...(query.status ? { status: query.status as EvaluationStatus } : {}),
      ...(query.search
        ? {
            OR: [
              { id: { contains: query.search, mode: 'insensitive' } },
              { summary: { contains: query.search, mode: 'insensitive' } },
              { skillGapSummary: { contains: query.search, mode: 'insensitive' } },
              { evaluationError: { contains: query.search, mode: 'insensitive' } },
              {
                application: {
                  candidate: {
                    OR: [
                      { fullName: { contains: query.search, mode: 'insensitive' } },
                      { primaryEmail: { contains: query.search, mode: 'insensitive' } },
                      { primaryPhone: { contains: query.search, mode: 'insensitive' } },
                    ],
                  },
                },
              },
              {
                application: {
                  jobDescription: {
                    OR: [
                      { title: { contains: query.search, mode: 'insensitive' } },
                      { companyName: { contains: query.search, mode: 'insensitive' } },
                      { department: { contains: query.search, mode: 'insensitive' } },
                    ],
                  },
                },
              },
              {
                config: {
                  OR: [
                    { name: { contains: query.search, mode: 'insensitive' } },
                    { description: { contains: query.search, mode: 'insensitive' } },
                    { version: { contains: query.search, mode: 'insensitive' } },
                  ],
                },
              },
            ],
          }
        : {}),
    };

    const [evaluations, total] = await this.prisma.$transaction([
      this.prisma.evaluation.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          [query.sortBy]: query.sortOrder,
        },
        select: this.getEvaluationListSelect(),
      }),
      this.prisma.evaluation.count({ where }),
    ]);

    return {
      data: evaluations,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string, organizationId: string) {
    const evaluation = await this.prisma.evaluation.findFirst({
      where: { id, organizationId },
      include: this.getEvaluationInclude(),
    });

    if (!evaluation) {
      throw new AppException('Evaluation not found', 404);
    }

    return evaluation;
  }

  async findByApplicationId(applicationId: string, organizationId: string) {
    await this.ensureApplicationExists(applicationId, organizationId);

    return this.prisma.evaluation.findMany({
      where: { applicationId },
      orderBy: { createdAt: 'desc' },
      select: this.getEvaluationListSelect(),
    });
  }

  async findBreakdown(id: string, organizationId: string) {
    await this.ensureEvaluationExists(id, organizationId);

    return this.prisma.evaluationCriterionScore.findMany({
      where: { evaluationId: id },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findSkills(id: string, organizationId: string) {
    await this.ensureEvaluationExists(id, organizationId);

    return this.prisma.evaluationSkill.findMany({
      where: { evaluationId: id },
      orderBy: [{ type: 'asc' }, { skillName: 'asc' }],
    });
  }

  async findInterviewQuestions(id: string, organizationId: string) {
    await this.ensureEvaluationExists(id, organizationId);

    return this.prisma.evaluationInterviewQuestion.findMany({
      where: { evaluationId: id },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async findEvidence(id: string, organizationId: string) {
    const evaluation = await this.prisma.evaluation.findFirst({
      where: { id, organizationId },
      select: {
        id: true,
        evidenceMap: true,
        criterionScores: {
          select: {
            criterion: true,
            evidence: true,
          },
        },
        skills: {
          select: {
            skillName: true,
            type: true,
            evidence: true,
          },
        },
      },
    });

    if (!evaluation) {
      throw new AppException('Evaluation not found', 404);
    }

    return evaluation;
  }

  async retry(id: string, currentUserId: string, organizationId: string) {
    const evaluation = await this.prisma.evaluation.findFirst({
      where: { id, organizationId },
      select: {
        id: true,
        applicationId: true,
        configId: true,
        status: true,
      },
    });

    if (!evaluation) {
      throw new AppException('Evaluation not found', 404);
    }

    if (evaluation.status === EvaluationStatus.PROCESSING) {
      throw new AppException('Evaluation is already processing', 409);
    }

    const context = await this.buildScoringContext(
      {
        applicationId: evaluation.applicationId,
        configId: evaluation.configId ?? undefined,
      },
      organizationId,
    );

    await this.prisma.$transaction([
      this.prisma.evaluationCriterionScore.deleteMany({ where: { evaluationId: id } }),
      this.prisma.evaluationSkill.deleteMany({ where: { evaluationId: id } }),
      this.prisma.evaluationInterviewQuestion.deleteMany({ where: { evaluationId: id } }),
      this.prisma.evaluation.update({
        where: { id },
        data: {
          createdById: currentUserId,
          status: EvaluationStatus.PROCESSING,
          overallScore: null,
          summary: null,
          explanation: null,
          skillGapSummary: null,
          interviewQuestions: Prisma.JsonNull,
          evidenceMap: Prisma.JsonNull,
          evaluationError: null,
          startedAt: new Date(),
          completedAt: null,
        },
      }),
    ]);

    return this.scoreAndPersistEvaluation(
      id,
      context.application.id,
      context.resumeData,
      context.jobDescriptionData,
      context.criteria,
      context.jobDescriptionTaxonomy,
    );
  }

  private async scoreAndPersistEvaluation(
    evaluationId: string,
    applicationId: string,
    resumeData: ParsedResumeData,
    jobDescriptionData: ParsedJobDescriptionData,
    criteria: ScoreCriterionConfig[],
    jobDescriptionTaxonomy: JobDescriptionTaxonomy,
  ) {
    try {
      const result = await this.aiService.scoreApplication(
        resumeData,
        jobDescriptionData,
        criteria,
      );

      return this.persistSuccessfulEvaluation(evaluationId, applicationId, result, jobDescriptionTaxonomy);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Evaluation failed';

      await this.prisma.$transaction([
        this.prisma.evaluation.update({
          where: { id: evaluationId },
          data: {
            status: EvaluationStatus.FAILED,
            evaluationError: message,
            completedAt: new Date(),
          },
        }),
        this.prisma.application.update({
          where: { id: applicationId },
          data: { lastActivityAt: new Date() },
        }),
        this.prisma.applicationEvent.create({
          data: {
            applicationId,
            eventType: APPLICATION_EVENT_EVALUATION_FAILED,
            eventData: {
              evaluationId,
              error: message,
            },
          },
        }),
      ]);

      throw error;
    }
  }

  private async persistSuccessfulEvaluation(
    evaluationId: string,
    applicationId: string,
    result: EvaluationResult,
    jobDescriptionTaxonomy: JobDescriptionTaxonomy,
  ) {
    const interviewQuestionRows = await this.scoringMapper.buildInterviewQuestions(jobDescriptionTaxonomy, result);
    const mappedCriteria = this.scoringMapper.mapCriteria(result);
    const criterionRows = mappedCriteria.map((item) => ({
      evaluationId,
      criterion: this.scoringMapper.toCriterionName(item.criterion),
      weight: item.weight,
      scoreNormalized: item.scoreNormalized,
      reason: item.reason,
      evidence: this.toJsonArray(item.evidence),
    }));

    const overallScore = this.scoringMapper.calculateOverallScore(mappedCriteria);

    return this.prisma.$transaction(async (tx) => {
      await tx.evaluationCriterionScore.createMany({ data: criterionRows });

      if (result.skills.length > 0) {
        const mappedSkills = this.scoringMapper.mapSkills(result);

        await tx.evaluationSkill.createMany({
          data: mappedSkills.map((item) => ({
            evaluationId,
            skillName: item.skillName,
            normalizedSkillName: item.normalizedSkillName,
            type: this.scoringMapper.toSkillMatchType(item.type),
            importance: item.importance,
            evidence: this.toJsonNullable(item.evidence),
            note: item.note,
          })),
        });
      }

      if (interviewQuestionRows.length > 0) {
        await tx.evaluationInterviewQuestion.createMany({
          data: interviewQuestionRows.map((item) => ({
            evaluationId,
            question: item.question,
            category: item.category,
            linkedSkill: item.linkedSkill,
            difficulty: item.difficulty,
            rationale: item.rationale,
            displayOrder: item.displayOrder,
          })),
        });
      }

      const evaluation = await tx.evaluation.update({
        where: { id: evaluationId },
        data: {
          status: EvaluationStatus.COMPLETED,
          overallScore,
          summary: result.summary,
          explanation: result.explanation,
          skillGapSummary: result.skill_gap_summary,
          interviewQuestions: this.toJsonArray(result.interview_questions),
          evidenceMap: this.toJsonObject(result.evidence_map),
          evaluationError: null,
          completedAt: new Date(),
        },
        include: this.getEvaluationInclude(),
      });

      await tx.application.update({
        where: { id: applicationId },
        data: { lastActivityAt: new Date() },
      });

      await tx.applicationEvent.create({
        data: {
          applicationId,
          eventType: APPLICATION_EVENT_EVALUATION_COMPLETED,
          eventData: {
            evaluationId,
            status: evaluation.status,
            overallScore: evaluation.overallScore,
          },
        },
      });

      return evaluation;
    });
  }

  private async buildScoringContext(
    input: Pick<CreateEvaluationDto, 'applicationId' | 'configId'>,
    organizationId: string,
  ) {
    const application = await this.prisma.application.findFirst({
      where: { id: input.applicationId, organizationId },
      include: {
        resume: true,
        jobDescription: {
          include: {
            skills: true,
          },
        },
      },
    });

    if (!application) {
      throw new AppException('Application not found', 404);
    }

    if (application.resume.parseStatus !== 'SUCCESS') {
      throw new AppException('Resume has not been parsed successfully', 409);
    }

    if (!application.resume.parsedData) {
      throw new AppException('Resume parsed data is missing', 409);
    }

    if (application.jobDescription.parseStatus !== 'SUCCESS') {
      throw new AppException('Job description has not been parsed successfully', 409);
    }

    if (!application.jobDescription.parsedData) {
      throw new AppException('Job description parsed data is missing', 409);
    }

    if (application.jobDescription.skills.length === 0) {
      throw new AppException('Job description has no skills for evaluation', 409);
    }

    const config = await this.resolveEvaluationConfig(
      input.configId,
      application.jobDescriptionId,
      organizationId,
    );

    return {
      application,
      configId: config?.id,
      criteria: config?.criteria ?? DEFAULT_EVALUATION_CRITERIA,
      resumeData: application.resume.parsedData as unknown as ParsedResumeData,
      jobDescriptionData: application.jobDescription
        .parsedData as unknown as ParsedJobDescriptionData,
      jobDescriptionTaxonomy: {
        occupationFamily: application.jobDescription.occupationFamily,
        specialization: application.jobDescription.specialization,
      },
    };
  }

  private async resolveEvaluationConfig(
    configId: string | undefined,
    jobDescriptionId: string,
    organizationId: string,
  ) {
    if (configId) {
      const config = await this.prisma.evaluationConfig.findFirst({
        where: { id: configId, organizationId },
      });

      if (!config) {
        throw new AppException('Evaluation config not found', 404);
      }

      if (config.jobDescriptionId && config.jobDescriptionId !== jobDescriptionId) {
        throw new AppException('Evaluation config does not belong to this job description', 409);
      }

      return {
        id: config.id,
        criteria: this.parseCriteriaConfig(config.criteriaDefinition),
      };
    }

    const config = await this.prisma.evaluationConfig.findFirst({
      where: {
        organizationId,
        OR: [{ jobDescriptionId }, { jobDescriptionId: null }],
        isDefault: true,
      },
      orderBy: [{ jobDescriptionId: 'desc' }, { createdAt: 'desc' }],
    });

    if (!config) {
      return null;
    }

    return {
      id: config.id,
      criteria: this.parseCriteriaConfig(config.criteriaDefinition),
    };
  }

  private parseCriteriaConfig(value: Prisma.JsonValue): ScoreCriterionConfig[] {
    if (!Array.isArray(value) || value.length === 0) {
      throw new AppException('Evaluation config criteria definition is invalid', 409);
    }

    return value.map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        throw new AppException('Evaluation config criteria definition is invalid', 409);
      }

      const criterion = (item as Record<string, unknown>).criterion;
      const weight = (item as Record<string, unknown>).weight;

      if (typeof criterion !== 'string' || typeof weight !== 'number') {
        throw new AppException('Evaluation config criteria definition is invalid', 409);
      }

      return {
        criterion,
        weight,
      };
    });
  }

  private async ensureApplicationExists(id: string, organizationId: string) {
    const application = await this.prisma.application.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });

    if (!application) {
      throw new AppException('Application not found', 404);
    }
  }

  private async ensureEvaluationExists(id: string, organizationId: string) {
    const evaluation = await this.prisma.evaluation.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });

    if (!evaluation) {
      throw new AppException('Evaluation not found', 404);
    }
  }

  private toJsonArray(value: unknown): Prisma.InputJsonArray {
    return Array.isArray(value) ? (value as Prisma.InputJsonArray) : [];
  }

  private toJsonObject(value: unknown): Prisma.InputJsonObject {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Prisma.InputJsonObject;
    }

    return {};
  }

  private toJsonNullable(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
    if (value === null || value === undefined) {
      return Prisma.JsonNull;
    }

    return value as Prisma.InputJsonValue;
  }

  private getEvaluationListSelect(): Prisma.EvaluationSelect {
    return {
      id: true,
      applicationId: true,
      configId: true,
      createdById: true,
      status: true,
      overallScore: true,
      summary: true,
      skillGapSummary: true,
      evaluationError: true,
      startedAt: true,
      completedAt: true,
      createdAt: true,
      updatedAt: true,
      application: {
        select: {
          id: true,
          status: true,
          appliedAt: true,
          lastActivityAt: true,
          candidate: {
            select: {
              id: true,
              fullName: true,
              primaryEmail: true,
              primaryPhone: true,
            },
          },
          jobDescription: {
            select: {
              id: true,
              title: true,
              companyName: true,
              department: true,
            },
          },
        },
      },
      config: {
        select: {
          id: true,
          name: true,
          isDefault: true,
          totalWeight: true,
          version: true,
        },
      },
      createdBy: {
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
        },
      },
    };
  }

  private getEvaluationInclude(): Prisma.EvaluationInclude {
    return {
      application: {
        include: {
          candidate: true,
          resume: true,
          jobDescription: true,
        },
      },
      config: true,
      createdBy: {
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
        },
      },
      criterionScores: true,
      skills: true,
      interviewQuestionRows: {
        orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
      },
    };
  }
}
