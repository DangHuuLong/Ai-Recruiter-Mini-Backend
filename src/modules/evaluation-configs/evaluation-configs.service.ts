// Service for evaluation configs — create/update/delete, criteria weight validation, and single-default enforcement per scope.
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { CreateEvaluationConfigDto } from './dto/create-evaluation-config.dto';
import { CriterionDefinitionDto } from './dto/criterion-definition.dto';
import { EvaluationConfigQueryDto } from './dto/evaluation-config-query.dto';
import { UpdateEvaluationConfigDto } from './dto/update-evaluation-config.dto';
import { AppException } from '../../common/exceptions/app.exception';
import { PrismaService } from '../../database/prisma/prisma.service';

const WEIGHT_SUM_TOLERANCE = 0.001;

@Injectable()
export class EvaluationConfigsService {
  constructor(private readonly prisma: PrismaService) {}

  // Called by EvaluationConfigsController.create() — validates weights, unsets any prior default, and persists the config.
  async create(dto: CreateEvaluationConfigDto, organizationId: string, currentUserId: string) {
    this.validateCriteria(dto.criteria);
    await this.ensureJobDescriptionBelongsToOrg(dto.jobDescriptionId, organizationId);

    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await this.clearExistingDefault(tx, organizationId, dto.jobDescriptionId ?? null);
      }

      return tx.evaluationConfig.create({
        data: {
          organizationId,
          createdById: currentUserId,
          name: dto.name,
          description: dto.description,
          jobDescriptionId: dto.jobDescriptionId,
          isDefault: dto.isDefault ?? false,
          criteriaDefinition: dto.criteria as unknown as Prisma.InputJsonValue,
          totalWeight: this.sumWeights(dto.criteria),
          version: dto.version,
        },
      });
    });
  }

  // Called by EvaluationConfigsController.findAll() — returns a paginated, optionally job-scoped list of configs.
  async findAll(query: EvaluationConfigQueryDto, organizationId: string) {
    const page = query.page;
    const limit = query.limit;
    const skip = (page - 1) * limit;

    const where: Prisma.EvaluationConfigWhereInput = {
      organizationId,
      ...(query.jobDescriptionId ? { jobDescriptionId: query.jobDescriptionId } : {}),
    };

    const [configs, total] = await this.prisma.$transaction([
      this.prisma.evaluationConfig.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [query.sortBy]: query.sortOrder },
      }),
      this.prisma.evaluationConfig.count({ where }),
    ]);

    return {
      data: configs,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  // Called by EvaluationConfigsController.findOne() — fetches a single config, 404s if not found in the org.
  async findOne(id: string, organizationId: string) {
    return this.ensureExists(id, organizationId);
  }

  // Called by EvaluationConfigsController.update() — revalidates weights/job scope and swaps the default config if needed.
  async update(id: string, dto: UpdateEvaluationConfigDto, organizationId: string) {
    const existing = await this.ensureExists(id, organizationId);

    if (dto.criteria) {
      this.validateCriteria(dto.criteria);
    }

    if (dto.jobDescriptionId !== undefined) {
      await this.ensureJobDescriptionBelongsToOrg(dto.jobDescriptionId, organizationId);
    }

    const nextJobDescriptionId =
      dto.jobDescriptionId !== undefined ? dto.jobDescriptionId : existing.jobDescriptionId;

    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await this.clearExistingDefault(tx, organizationId, nextJobDescriptionId, id);
      }

      return tx.evaluationConfig.update({
        where: { id },
        data: {
          name: dto.name,
          description: dto.description,
          jobDescriptionId: dto.jobDescriptionId,
          isDefault: dto.isDefault,
          version: dto.version,
          ...(dto.criteria
            ? {
                criteriaDefinition: dto.criteria as unknown as Prisma.InputJsonValue,
                totalWeight: this.sumWeights(dto.criteria),
              }
            : {}),
        },
      });
    });
  }

  // Called by EvaluationConfigsController.remove() — deletes a config after confirming it exists in the org.
  async remove(id: string, organizationId: string) {
    await this.ensureExists(id, organizationId);
    await this.prisma.evaluationConfig.delete({ where: { id } });

    return { id, deleted: true };
  }

  // Called by findOne()/update()/remove() to load a config scoped to the org or throw a 404.
  private async ensureExists(id: string, organizationId: string) {
    const config = await this.prisma.evaluationConfig.findFirst({ where: { id, organizationId } });

    if (!config) {
      throw new AppException('Evaluation config not found', 404);
    }

    return config;
  }

  // Called by create()/update() to verify an optional job description scope belongs to the org.
  private async ensureJobDescriptionBelongsToOrg(
    jobDescriptionId: string | undefined,
    organizationId: string,
  ) {
    if (!jobDescriptionId) {
      return;
    }

    const jobDescription = await this.prisma.jobDescription.findFirst({
      where: { id: jobDescriptionId, organizationId },
      select: { id: true },
    });

    if (!jobDescription) {
      throw new AppException('Job description not found', 404);
    }
  }

  // Called by create()/update() to unset the previous default config within the same org/job scope before setting a new one.
  private async clearExistingDefault(
    tx: Prisma.TransactionClient,
    organizationId: string,
    jobDescriptionId: string | null,
    excludeId?: string,
  ) {
    await tx.evaluationConfig.updateMany({
      where: {
        organizationId,
        jobDescriptionId,
        isDefault: true,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      data: { isDefault: false },
    });
  }

  // Called by create()/update() to reject duplicate criteria and enforce that weights sum to 1.0.
  private validateCriteria(criteria: CriterionDefinitionDto[]) {
    const seen = new Set<string>();

    for (const item of criteria) {
      if (seen.has(item.criterion)) {
        throw new AppException(`Duplicate criterion in definition: ${item.criterion}`, 400);
      }
      seen.add(item.criterion);
    }

    const total = this.sumWeights(criteria);

    if (Math.abs(total - 1) > WEIGHT_SUM_TOLERANCE) {
      throw new AppException(`Criteria weights must sum to 1.0, got ${total.toFixed(4)}`, 400);
    }
  }

  // Called by create()/update()/validateCriteria() to compute the total weight stored as totalWeight.
  private sumWeights(criteria: CriterionDefinitionDto[]): number {
    return Math.round(criteria.reduce((sum, item) => sum + item.weight, 0) * 10000) / 10000;
  }
}
