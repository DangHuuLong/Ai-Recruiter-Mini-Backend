// Service for candidates — create/update/list/delete, duplicate-email checks, and fetching related resumes.
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { CandidateQueryDto } from './dto/candidate-query.dto';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { UpdateCandidateDto } from './dto/update-candidate.dto';
import { AppException } from '../../common/exceptions/app.exception';
import { ensureCandidateExists } from '../../common/utils/entity-exists.util';
import { PrismaService } from '../../database/prisma/prisma.service';

@Injectable()
export class CandidatesService {
  constructor(private readonly prisma: PrismaService) {}

  // Called by CandidatesController.create() — rejects duplicate emails within the org, then creates the candidate.
  async create(createCandidateDto: CreateCandidateDto, organizationId: string) {
    if (createCandidateDto.primaryEmail) {
      const existingCandidate = await this.prisma.candidate.findFirst({
        where: {
          organizationId,
          primaryEmail: createCandidateDto.primaryEmail,
        },
        select: {
          id: true,
        },
      });

      if (existingCandidate) {
        throw new AppException('Candidate email already exists', 409);
      }
    }

    return this.prisma.candidate.create({
      data: {
        organizationId,
        fullName: createCandidateDto.fullName,
        primaryEmail: createCandidateDto.primaryEmail,
        primaryPhone: createCandidateDto.primaryPhone,
        linkedinUrl: createCandidateDto.linkedinUrl,
        githubUrl: createCandidateDto.githubUrl,
        portfolioUrl: createCandidateDto.portfolioUrl,
        location: createCandidateDto.location,
      },
    });
  }

  // Called by CandidatesController.update() — rejects duplicate emails (excluding self), then updates the candidate.
  async update(id: string, updateCandidateDto: UpdateCandidateDto, organizationId: string) {
    await ensureCandidateExists(this.prisma, id, organizationId);

    if (updateCandidateDto.primaryEmail) {
      const existingCandidate = await this.prisma.candidate.findFirst({
        where: {
          organizationId,
          primaryEmail: updateCandidateDto.primaryEmail,
          NOT: {
            id,
          },
        },
        select: {
          id: true,
        },
      });

      if (existingCandidate) {
        throw new AppException('Candidate email already exists', 409);
      }
    }

    return this.prisma.candidate.update({
      where: { id },
      data: {
        fullName: updateCandidateDto.fullName,
        primaryEmail: updateCandidateDto.primaryEmail,
        primaryPhone: updateCandidateDto.primaryPhone,
        linkedinUrl: updateCandidateDto.linkedinUrl,
        githubUrl: updateCandidateDto.githubUrl,
        portfolioUrl: updateCandidateDto.portfolioUrl,
        location: updateCandidateDto.location,
      },
    });
  }

  // Called by CandidatesController.findAll() — builds search filters and returns a paginated page with resume counts.
  async findAll(query: CandidateQueryDto, organizationId: string) {
    const page = query.page;
    const limit = query.limit;
    const skip = (page - 1) * limit;

    const where: Prisma.CandidateWhereInput = {
      organizationId,
      ...(query.search
        ? {
            OR: [
              { fullName: { contains: query.search, mode: 'insensitive' } },
              { primaryEmail: { contains: query.search, mode: 'insensitive' } },
              { primaryPhone: { contains: query.search, mode: 'insensitive' } },
              { location: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [candidates, total] = await this.prisma.$transaction([
      this.prisma.candidate.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          [query.sortBy]: query.sortOrder,
        },
        include: {
          _count: {
            select: {
              resumes: true,
            },
          },
        },
      }),
      this.prisma.candidate.count({ where }),
    ]);

    return {
      data: candidates,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // Called by CandidatesController.findOne() — fetches a candidate scoped to the org, 404s if missing.
  async findOne(id: string, organizationId: string) {
    const candidate = await this.prisma.candidate.findFirst({
      where: { id, organizationId },
      include: {
        _count: {
          select: {
            resumes: true,
          },
        },
      },
    });

    if (!candidate) {
      throw new AppException('Candidate not found', 404);
    }

    return candidate;
  }

  // Called by CandidatesController.findResumesByCandidateId() — lists a candidate's resumes with their file assets.
  async findResumesByCandidateId(id: string, organizationId: string) {
    await ensureCandidateExists(this.prisma, id, organizationId);

    return this.prisma.resume.findMany({
      where: {
        candidateId: id,
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
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
      },
    });
  }

  // Called by CandidatesController.remove() — blocks deletion if resumes/applications exist, otherwise deletes the candidate.
  async remove(id: string, organizationId: string) {
    await ensureCandidateExists(this.prisma, id, organizationId);

    const relatedCounts = await this.prisma.candidate.findUnique({
      where: { id },
      select: {
        _count: {
          select: {
            resumes: true,
            applications: true,
          },
        },
      },
    });

    if (relatedCounts?._count.resumes || relatedCounts?._count.applications) {
      throw new AppException('Candidate has related resumes or applications and cannot be deleted', 409);
    }

    await this.prisma.candidate.delete({
      where: { id },
    });

    return {
      id,
      deleted: true,
    };
  }
}
