// Service for JobDescription CRUD, AI-driven parsing (raw text to structured data plus taxonomy classification), and skill sync.
import { Injectable } from '@nestjs/common';
import { ParseStatus, Prisma } from '@prisma/client';

import { CreateJobDescriptionDto } from './dto/create-job-description.dto';
import { JobDescriptionQueryDto } from './dto/job-description-query.dto';
import { UpdateJobDescriptionDto } from './dto/update-job-description.dto';
import { JobDescriptionClassifierService } from './job-description-classifier.service';
import { JobSkillsService } from './job-skills.service';
import { INTERVIEW_QUESTION_TAXONOMY } from '../../common/constants/interview-question-taxonomy';
import { AppException } from '../../common/exceptions/app.exception';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AiService } from '../../integrations/ai/ai.service';

const JOB_DESCRIPTION_PARSER_VERSION = 'ai-job-description-parser-v1';

@Injectable()
export class JobDescriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly jobSkillsService: JobSkillsService,
    private readonly classifierService: JobDescriptionClassifierService,
  ) {}

  // Called by JobDescriptionsController.create — persists a raw JobDescription prior to AI parsing.
  async create(
    createJobDescriptionDto: CreateJobDescriptionDto,
    currentUserId: string,
    organizationId: string,
  ) {
    return this.prisma.jobDescription.create({
      data: {
        organizationId,
        createdById: currentUserId,
        title: createJobDescriptionDto.title,
        companyName: createJobDescriptionDto.companyName,
        department: createJobDescriptionDto.department,
        location: createJobDescriptionDto.location,
        employmentType: createJobDescriptionDto.employmentType,
        seniority: createJobDescriptionDto.seniority,
        rawText: createJobDescriptionDto.rawText,
        parserVersion: createJobDescriptionDto.parserVersion,
      },
    });
  }

  // Called by JobDescriptionsController.findAll — paginated, org-scoped, searchable listing of active job descriptions.
  async findAll(query: JobDescriptionQueryDto, organizationId: string) {
    const page = query.page;
    const limit = query.limit;
    const skip = (page - 1) * limit;

    const where: Prisma.JobDescriptionWhereInput = {
      organizationId,
      isActive: true,
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              { companyName: { contains: query.search, mode: 'insensitive' } },
              { department: { contains: query.search, mode: 'insensitive' } },
              { location: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [jobDescriptions, total] = await this.prisma.$transaction([
      this.prisma.jobDescription.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [query.sortBy]: query.sortOrder },
        include: {
          _count: { select: { applications: true, skills: true, evaluationConfigs: true } },
        },
      }),
      this.prisma.jobDescription.count({ where }),
    ]);

    return {
      data: jobDescriptions,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  // Called by JobDescriptionsController.findOne, and internally by parse/update/deactivate — fetches an active, org-scoped JD or throws 404.
  async findOne(id: string, organizationId: string) {
    const jobDescription = await this.prisma.jobDescription.findFirst({
      where: { id, isActive: true, organizationId },
      include: {
        skills: true,
        _count: { select: { applications: true, evaluationConfigs: true } },
      },
    });

    if (!jobDescription) {
      throw new AppException('Job description not found', 404);
    }

    return jobDescription;
  }

  // Called by JobDescriptionsController.parse — runs AiService parsing + JobDescriptionClassifierService, then syncs skills via JobSkillsService.
  async parse(id: string, organizationId: string) {
    const jobDescription = await this.prisma.jobDescription.findFirst({
      where: { id, isActive: true, organizationId },
    });

    if (!jobDescription) {
      throw new AppException('Job description not found', 404);
    }

    if (!jobDescription.rawText) {
      throw new AppException('Job description has no raw text to parse', 409);
    }

    await this.prisma.jobDescription.update({
      where: { id },
      data: { parseStatus: ParseStatus.PROCESSING, parsingError: null },
    });

    try {
      const parsedData = await this.aiService.parseJobDescription(
        { raw_text: jobDescription.rawText },
        { tier: 'ENTERPRISE', organizationId, jobDescriptionId: id },
      );
      const classification = await this.classifierService.classify(parsedData);

      await this.prisma.jobDescription.update({
        where: { id },
        data: {
          parsedData: parsedData as unknown as Prisma.InputJsonValue,
          parserVersion: JOB_DESCRIPTION_PARSER_VERSION,
          parseStatus: ParseStatus.SUCCESS,
          parsingError: null,
          occupationFamily: classification?.occupationFamily ?? null,
          specialization: classification?.specialization ?? null,
        },
      });

      await this.jobSkillsService.syncFromParsedData(id, parsedData);

      return this.findOne(id, organizationId);
    } catch (error) {
      const parsingError = this.getParsingErrorMessage(error);

      await this.prisma.jobDescription.update({
        where: { id },
        data: { parseStatus: ParseStatus.FAILED, parsingError },
      });

      if (error instanceof AppException) {
        throw error;
      }

      throw new AppException(parsingError, 502);
    }
  }

  // Called by JobDescriptionsController.getParsedData — returns the structured AI-parsed fields for a JD.
  async getParsedData(id: string, organizationId: string) {
    const jobDescription = await this.prisma.jobDescription.findFirst({
      where: { id, isActive: true, organizationId },
      select: {
        id: true,
        title: true,
        rawText: true,
        parsedData: true,
        parseStatus: true,
        parserVersion: true,
        parsingError: true,
        updatedAt: true,
      },
    });

    if (!jobDescription) {
      throw new AppException('Job description not found', 404);
    }

    return jobDescription;
  }

  // Called by JobDescriptionsController.update — partial update; validates manual occupationFamily/specialization override against the taxonomy.
  async update(
    id: string,
    updateJobDescriptionDto: UpdateJobDescriptionDto,
    organizationId: string,
  ) {
    await this.findOne(id, organizationId);

    const { occupationFamily, specialization } = updateJobDescriptionDto;
    if (occupationFamily || specialization) {
      if (!occupationFamily || !specialization) {
        throw new AppException('occupationFamily and specialization must be provided together', 400);
      }
      const taxonomyEntry = INTERVIEW_QUESTION_TAXONOMY.find(
        (entry) => entry.occupationFamily === occupationFamily,
      );
      if (!taxonomyEntry?.specializations.includes(specialization)) {
        throw new AppException(
          `Unknown specialization "${specialization}" for occupationFamily "${occupationFamily}". Must be exactly one of: ${taxonomyEntry?.specializations.join(', ') ?? ''}`,
          400,
        );
      }
    }

    return this.prisma.jobDescription.update({
      where: { id },
      data: {
        title: updateJobDescriptionDto.title,
        companyName: updateJobDescriptionDto.companyName,
        department: updateJobDescriptionDto.department,
        location: updateJobDescriptionDto.location,
        employmentType: updateJobDescriptionDto.employmentType,
        seniority: updateJobDescriptionDto.seniority,
        rawText: updateJobDescriptionDto.rawText,
        parserVersion: updateJobDescriptionDto.parserVersion,
        occupationFamily,
        specialization,
      },
    });
  }

  // Called by JobDescriptionsController.remove — soft-deletes a JD by flipping isActive off.
  async deactivate(id: string, organizationId: string) {
    await this.findOne(id, organizationId);

    return this.prisma.jobDescription.update({ where: { id }, data: { isActive: false } });
  }

  // Called by JobDescriptionsController.deactivateBulk() — runs deactivate() per id, collecting per-item success/failure results.
  async deactivateMany(ids: string[], organizationId: string) {
    const results: Array<
      { id: string; success: true; data: Awaited<ReturnType<JobDescriptionsService['deactivate']>> }
      | { id: string; success: false; error: string }
    > = [];

    for (const id of ids) {
      try {
        const data = await this.deactivate(id, organizationId);
        results.push({ id, success: true, data });
      } catch (error) {
        results.push({ id, success: false, error: error instanceof Error ? error.message : String(error) });
      }
    }

    return results;
  }

  // Called by parse()'s catch block to normalize the error into a persisted parsingError message.
  private getParsingErrorMessage(error: unknown): string {
    if (error instanceof AppException) return error.message;
    if (error instanceof Error) return error.message;
    return 'Failed to parse job description';
  }
}
