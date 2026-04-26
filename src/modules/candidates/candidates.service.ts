import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { CandidateQueryDto } from './dto/candidate-query.dto';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { UpdateCandidateDto } from './dto/update-candidate.dto';
import { AppException } from '../../common/exceptions/app.exception';
import { PrismaService } from '../../database/prisma/prisma.service';

@Injectable()
export class CandidatesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createCandidateDto: CreateCandidateDto) {
    if (createCandidateDto.primaryEmail) {
      const existingCandidate = await this.prisma.candidate.findFirst({
        where: {
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

  async update(id: string, updateCandidateDto: UpdateCandidateDto) {
    await this.ensureCandidateExists(id);

    if (updateCandidateDto.primaryEmail) {
      const existingCandidate = await this.prisma.candidate.findFirst({
        where: {
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

  async findAll(query: CandidateQueryDto) {
    const page = query.page;
    const limit = query.limit;
    const skip = (page - 1) * limit;

    const where: Prisma.CandidateWhereInput = query.search
      ? {
          OR: [
            {
              fullName: {
                contains: query.search,
                mode: 'insensitive',
              },
            },
            {
              primaryEmail: {
                contains: query.search,
                mode: 'insensitive',
              },
            },
            {
              primaryPhone: {
                contains: query.search,
                mode: 'insensitive',
              },
            },
            {
              location: {
                contains: query.search,
                mode: 'insensitive',
              },
            },
          ],
        }
      : {};

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

  async findOne(id: string) {
    const candidate = await this.prisma.candidate.findUnique({
      where: { id },
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

  async findResumesByCandidateId(id: string) {
    await this.ensureCandidateExists(id);

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

  private async ensureCandidateExists(id: string) {
    const candidate = await this.prisma.candidate.findUnique({
      where: { id },
      select: {
        id: true,
      },
    });

    if (!candidate) {
      throw new AppException('Candidate not found', 404);
    }

    return candidate;
  }
}
