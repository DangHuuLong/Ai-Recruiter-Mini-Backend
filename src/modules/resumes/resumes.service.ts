import { Injectable } from '@nestjs/common';
import { FileAssetStatus, ParseStatus, Prisma } from '@prisma/client';

import { CreateResumeDto } from './dto/create-resume.dto';
import { ResumeQueryDto } from './dto/resume-query.dto';
import { UpdateResumeDto } from './dto/update-resume.dto';
import { AppException } from '../../common/exceptions/app.exception';
import {
  ensureCandidateExists,
  ensureFileAssetExists,
  ensureResumeExists,
} from '../../common/utils/entity-exists.util';
import { PrismaService } from '../../database/prisma/prisma.service';

@Injectable()
export class ResumesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createResumeDto: CreateResumeDto) {
    await ensureCandidateExists(this.prisma, createResumeDto.candidateId);

    const fileAsset = await ensureFileAssetExists(this.prisma, createResumeDto.fileAssetId);

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
      include: this.getResumeInclude(),
    });
  }

  async findAll(query: ResumeQueryDto) {
    const page = query.page;
    const limit = query.limit;
    const skip = (page - 1) * limit;

    const where: Prisma.ResumeWhereInput = {
      ...(query.candidateId ? { candidateId: query.candidateId } : {}),
      ...(query.parseStatus ? { parseStatus: query.parseStatus as ParseStatus } : {}),
    };

    const [resumes, total] = await this.prisma.$transaction([
      this.prisma.resume.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          [query.sortBy]: query.sortOrder,
        },
        include: this.getResumeInclude(),
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

  async findOne(id: string) {
    const resume = await this.prisma.resume.findUnique({
      where: { id },
      include: this.getResumeInclude(),
    });

    if (!resume) {
      throw new AppException('Resume not found', 404);
    }

    return resume;
  }

  async update(id: string, updateResumeDto: UpdateResumeDto) {
    await ensureResumeExists(this.prisma, id);

    return this.prisma.resume.update({
      where: { id },
      data: {
        rawText: updateResumeDto.rawText,
        parsedData: updateResumeDto.parsedData as Prisma.InputJsonValue,
        parseStatus: updateResumeDto.parseStatus as ParseStatus,
        parserVersion: updateResumeDto.parserVersion,
        parsingError: updateResumeDto.parsingError,
      },
      include: this.getResumeInclude(),
    });
  }

  async remove(id: string) {
    await ensureResumeExists(this.prisma, id);

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

  private getResumeInclude() {
    return {
      candidate: {
        select: {
          id: true,
          fullName: true,
          primaryEmail: true,
          primaryPhone: true,
          location: true,
        },
      },
      fileAsset: {
        select: {
          id: true,
          fileName: true,
          originalFileUrl: true,
          storageKey: true,
          fileType: true,
          fileSizeBytes: true,
          checksum: true,
          bucket: true,
          status: true,
          uploadedAt: true,
        },
      },
    };
  }
}
