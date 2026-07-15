import { Injectable } from '@nestjs/common';
import { ParseStatus, Prisma } from '@prisma/client';

import { CreateJobDescriptionDto } from './dto/create-job-description.dto';
import { JobDescriptionQueryDto } from './dto/job-description-query.dto';
import { UpdateJobDescriptionDto } from './dto/update-job-description.dto';
import { JobSkillsService } from './job-skills.service';
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
  ) {}

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

  async parse(id: string, organizationId: string) {
    const jobDescription = await this.prisma.jobDescription.findFirst({
      where: { id, isActive: true, organizationId },
    });

    if (!jobDescription) {
      throw new AppException('Job description not found', 404);
    }

    await this.prisma.jobDescription.update({
      where: { id },
      data: { parseStatus: ParseStatus.PROCESSING, parsingError: null },
    });

    try {
      const parsedData = await this.aiService.parseJobDescription({
        raw_text: jobDescription.rawText,
      });

      await this.prisma.jobDescription.update({
        where: { id },
        data: {
          parsedData: parsedData as unknown as Prisma.InputJsonValue,
          parserVersion: JOB_DESCRIPTION_PARSER_VERSION,
          parseStatus: ParseStatus.SUCCESS,
          parsingError: null,
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

  async update(
    id: string,
    updateJobDescriptionDto: UpdateJobDescriptionDto,
    organizationId: string,
  ) {
    await this.findOne(id, organizationId);

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
      },
    });
  }

  async deactivate(id: string, organizationId: string) {
    await this.findOne(id, organizationId);

    return this.prisma.jobDescription.update({ where: { id }, data: { isActive: false } });
  }

  private getParsingErrorMessage(error: unknown): string {
    if (error instanceof AppException) return error.message;
    if (error instanceof Error) return error.message;
    return 'Failed to parse job description';
  }
}
