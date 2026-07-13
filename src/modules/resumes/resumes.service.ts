import { Injectable } from '@nestjs/common';
import { FileAssetStatus, ParseStatus, Prisma } from '@prisma/client';

import { CreateResumeDto } from './dto/create-resume.dto';
import { ResumeQueryDto } from './dto/resume-query.dto';
import { UpdateResumeDto } from './dto/update-resume.dto';
import { getResumeParsingErrorMessage } from './utils/resume-error.util';
import { getResumeInclude } from './utils/resume-include.util';
import { AppException } from '../../common/exceptions/app.exception';
import {
  ensureCandidateExists,
  ensureFileAssetExists,
  ensureResumeExists,
} from '../../common/utils/entity-exists.util';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AiService } from '../../integrations/ai/ai.service';
import { SupabaseStorageService } from '../../integrations/storage/supabase-storage.service';

const RESUME_SIGNED_URL_EXPIRES_IN_SECONDS = 300;
const FALLBACK_RESUME_PARSER_VERSION = 'ai-service-file-parser-v1';

@Injectable()
export class ResumesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly storageService: SupabaseStorageService,
  ) {}

  async create(createResumeDto: CreateResumeDto, organizationId: string) {
    await ensureCandidateExists(this.prisma, createResumeDto.candidateId, organizationId);

    const fileAsset = await ensureFileAssetExists(
      this.prisma,
      createResumeDto.fileAssetId,
      organizationId,
    );

    if (fileAsset.status !== FileAssetStatus.ACTIVE) {
      throw new AppException('File asset is not active', 409);
    }

    const existingResume = await this.prisma.resume.findFirst({
      where: {
        fileAssetId: createResumeDto.fileAssetId,
      },
      select: {
        id: true,
      },
    });

    if (existingResume) {
      throw new AppException('File asset is already linked to a resume', 409);
    }

    return this.prisma.resume.create({
      data: {
        candidateId: createResumeDto.candidateId,
        fileAssetId: createResumeDto.fileAssetId,
        parseStatus: ParseStatus.PENDING,
      },
      include: getResumeInclude(),
    });
  }

  async findAll(query: ResumeQueryDto, organizationId: string) {
    const page = query.page;
    const limit = query.limit;
    const skip = (page - 1) * limit;

    const where: Prisma.ResumeWhereInput = {
      candidate: { organizationId },
      ...(query.candidateId ? { candidateId: query.candidateId } : {}),
      ...(query.parseStatus ? { parseStatus: query.parseStatus as ParseStatus } : {}),
      ...(query.search
        ? {
            OR: [
              { id: { contains: query.search, mode: 'insensitive' } },
              { rawText: { contains: query.search, mode: 'insensitive' } },
              {
                candidate: {
                  OR: [
                    { fullName: { contains: query.search, mode: 'insensitive' } },
                    { primaryEmail: { contains: query.search, mode: 'insensitive' } },
                    { primaryPhone: { contains: query.search, mode: 'insensitive' } },
                  ],
                },
              },
              {
                fileAsset: {
                  OR: [
                    { fileName: { contains: query.search, mode: 'insensitive' } },
                    { checksum: { contains: query.search, mode: 'insensitive' } },
                  ],
                },
              },
            ],
          }
        : {}),
    };

    const [resumes, total] = await this.prisma.$transaction([
      this.prisma.resume.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          [query.sortBy]: query.sortOrder,
        },
        include: getResumeInclude(),
      }),
      this.prisma.resume.count({ where }),
    ]);

    return {
      data: resumes,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string, organizationId: string) {
    const resume = await this.prisma.resume.findFirst({
      where: { id, candidate: { organizationId } },
      include: getResumeInclude(),
    });

    if (!resume) {
      throw new AppException('Resume not found', 404);
    }

    return resume;
  }

  async parse(id: string, organizationId: string) {
    const resume = await this.prisma.resume.findFirst({
      where: { id, candidate: { organizationId } },
      include: getResumeInclude(),
    });

    if (!resume) {
      throw new AppException('Resume not found', 404);
    }

    await this.prisma.resume.update({
      where: { id },
      data: {
        parseStatus: ParseStatus.PROCESSING,
        parsingError: null,
      },
    });

    try {
      const signedUrl = await this.storageService.createSignedUrl(
        resume.fileAsset.storageKey,
        RESUME_SIGNED_URL_EXPIRES_IN_SECONDS,
        resume.fileAsset.bucket,
      );

      const parseResult = await this.aiService.parseResume({
        resume_id: resume.id,
        file_name: resume.fileAsset.fileName,
        file_type: resume.fileAsset.fileType,
        signed_url: signedUrl,
        checksum: resume.fileAsset.checksum,
      });

      const updatedResume = await this.prisma.resume.update({
        where: { id },
        data: {
          rawText: parseResult.raw_text,
          parsedData: parseResult.parsed_data as unknown as Prisma.InputJsonValue,
          parserVersion: parseResult.parser_version || FALLBACK_RESUME_PARSER_VERSION,
          parseStatus: ParseStatus.SUCCESS,
          parsingError: null,
        },
        include: getResumeInclude(),
      });

      await this.updateCandidateNormalizedProfile(resume.candidateId, parseResult.parsed_data);

      return updatedResume;
    } catch (error) {
      const parsingError = getResumeParsingErrorMessage(error);

      await this.prisma.resume.update({
        where: { id },
        data: {
          parseStatus: ParseStatus.FAILED,
          parsingError,
        },
      });

      if (error instanceof AppException) {
        throw error;
      }

      throw new AppException(parsingError, 502);
    }
  }

  async getParsedData(id: string, organizationId: string) {
    const resume = await this.prisma.resume.findFirst({
      where: { id, candidate: { organizationId } },
      select: {
        id: true,
        candidateId: true,
        rawText: true,
        parsedData: true,
        parseStatus: true,
        parserVersion: true,
        parsingError: true,
        updatedAt: true,
      },
    });

    if (!resume) {
      throw new AppException('Resume not found', 404);
    }

    return resume;
  }

  async update(id: string, updateResumeDto: UpdateResumeDto, organizationId: string) {
    await ensureResumeExists(this.prisma, id, organizationId);

    return this.prisma.resume.update({
      where: { id },
      data: {
        rawText: updateResumeDto.rawText,
        parsedData: updateResumeDto.parsedData as Prisma.InputJsonValue,
        parseStatus: updateResumeDto.parseStatus as ParseStatus,
        parserVersion: updateResumeDto.parserVersion,
        parsingError: updateResumeDto.parsingError,
      },
      include: getResumeInclude(),
    });
  }

  async remove(id: string, organizationId: string) {
    await ensureResumeExists(this.prisma, id, organizationId);

    const relatedApplicationCount = await this.prisma.application.count({
      where: {
        resumeId: id,
      },
    });

    if (relatedApplicationCount > 0) {
      throw new AppException('Resume already has applications and cannot be deleted', 409);
    }

    await this.prisma.resume.delete({
      where: { id },
    });

    return {
      id,
      deleted: true,
    };
  }

  private async updateCandidateNormalizedProfile(candidateId: string, parsedData: unknown) {
    await this.prisma.candidate.update({
      where: { id: candidateId },
      data: {
        normalizedProfile: parsedData as Prisma.InputJsonValue,
      },
    });
  }
}
