import { Injectable } from '@nestjs/common';
import { ApplicationStatus, Prisma } from '@prisma/client';

import { ApplicationQueryDto } from './dto/application-query.dto';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationStatusDto } from './dto/update-application-status.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';
import { AppException } from '../../common/exceptions/app.exception';
import { PrismaService } from '../../database/prisma/prisma.service';

const APPLICATION_EVENT_STATUS_CHANGED = 'STATUS_CHANGED';
const APPLICATION_EVENT_CREATED = 'APPLICATION_CREATED';

@Injectable()
export class ApplicationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createApplicationDto: CreateApplicationDto) {
    await this.validateApplicationRelations(
      createApplicationDto.candidateId,
      createApplicationDto.resumeId,
      createApplicationDto.jobDescriptionId,
    );

    if (createApplicationDto.createdById) {
      await this.ensureUserExists(createApplicationDto.createdById);
    }

    return this.prisma.$transaction(async (tx) => {
      const application = await tx.application.create({
        data: {
          candidateId: createApplicationDto.candidateId,
          jobDescriptionId: createApplicationDto.jobDescriptionId,
          resumeId: createApplicationDto.resumeId,
          createdById: createApplicationDto.createdById,
          source: createApplicationDto.source,
          notes: createApplicationDto.notes,
          lastActivityAt: new Date(),
        },
        include: this.getApplicationInclude(),
      });

      await tx.applicationEvent.create({
        data: {
          applicationId: application.id,
          eventType: APPLICATION_EVENT_CREATED,
          eventData: {
            status: application.status,
            candidateId: application.candidateId,
            resumeId: application.resumeId,
            jobDescriptionId: application.jobDescriptionId,
          },
        },
      });

      return application;
    });
  }

  async findAll(query: ApplicationQueryDto) {
    const page = query.page;
    const limit = query.limit;
    const skip = (page - 1) * limit;

    const where: Prisma.ApplicationWhereInput = {
      ...(query.candidateId ? { candidateId: query.candidateId } : {}),
      ...(query.jobDescriptionId ? { jobDescriptionId: query.jobDescriptionId } : {}),
      ...(query.resumeId ? { resumeId: query.resumeId } : {}),
      ...(query.status ? { status: query.status as ApplicationStatus } : {}),
      ...(query.search
        ? {
            OR: [
              { id: { contains: query.search, mode: 'insensitive' } },
              { source: { contains: query.search, mode: 'insensitive' } },
              { notes: { contains: query.search, mode: 'insensitive' } },
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
                jobDescription: {
                  OR: [
                    { title: { contains: query.search, mode: 'insensitive' } },
                    { companyName: { contains: query.search, mode: 'insensitive' } },
                    { department: { contains: query.search, mode: 'insensitive' } },
                    { location: { contains: query.search, mode: 'insensitive' } },
                  ],
                },
              },
              {
                resume: {
                  fileAsset: {
                    fileName: { contains: query.search, mode: 'insensitive' },
                  },
                },
              },
            ],
          }
        : {}),
    };

    const [applications, total] = await this.prisma.$transaction([
      this.prisma.application.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          [query.sortBy]: query.sortOrder,
        },
        include: this.getApplicationInclude(),
      }),
      this.prisma.application.count({ where }),
    ]);

    return {
      data: applications,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const application = await this.prisma.application.findUnique({
      where: { id },
      include: this.getApplicationInclude(),
    });

    if (!application) {
      throw new AppException('Application not found', 404);
    }

    return application;
  }

  async update(id: string, updateApplicationDto: UpdateApplicationDto) {
    await this.ensureApplicationExists(id);

    return this.prisma.application.update({
      where: { id },
      data: {
        source: updateApplicationDto.source,
        notes: updateApplicationDto.notes,
        lastActivityAt: new Date(),
      },
      include: this.getApplicationInclude(),
    });
  }

  async updateStatus(id: string, updateApplicationStatusDto: UpdateApplicationStatusDto) {
    const existingApplication = await this.ensureApplicationExists(id);
    const nextStatus = updateApplicationStatusDto.status as ApplicationStatus;

    if (existingApplication.status === nextStatus) {
      return this.findOne(id);
    }

    return this.prisma.$transaction(async (tx) => {
      const updatedApplication = await tx.application.update({
        where: { id },
        data: {
          status: nextStatus,
          lastActivityAt: new Date(),
        },
        include: this.getApplicationInclude(),
      });

      const eventData: Prisma.InputJsonObject = {
        fromStatus: existingApplication.status,
        toStatus: nextStatus,
        ...(updateApplicationStatusDto.note ? { note: updateApplicationStatusDto.note } : {}),
      };

      await tx.applicationEvent.create({
        data: {
          applicationId: id,
          eventType: APPLICATION_EVENT_STATUS_CHANGED,
          eventData,
        },
      });

      return updatedApplication;
    });
  }

  async findEvents(id: string) {
    await this.ensureApplicationExists(id);

    return this.prisma.applicationEvent.findMany({
      where: {
        applicationId: id,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findByCandidateId(candidateId: string) {
    const candidate = await this.prisma.candidate.findUnique({
      where: { id: candidateId },
      select: { id: true },
    });

    if (!candidate) {
      throw new AppException('Candidate not found', 404);
    }

    return this.prisma.application.findMany({
      where: {
        candidateId,
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: this.getCandidateApplicationSummarySelect(),
    });
  }

  private async validateApplicationRelations(
    candidateId: string,
    resumeId: string,
    jobDescriptionId: string,
  ) {
    const [candidate, resume, jobDescription] = await this.prisma.$transaction([
      this.prisma.candidate.findUnique({
        where: { id: candidateId },
        select: { id: true },
      }),
      this.prisma.resume.findUnique({
        where: { id: resumeId },
        select: { id: true, candidateId: true },
      }),
      this.prisma.jobDescription.findUnique({
        where: { id: jobDescriptionId },
        select: { id: true, isActive: true },
      }),
    ]);

    if (!candidate) {
      throw new AppException('Candidate not found', 404);
    }

    if (!resume) {
      throw new AppException('Resume not found', 404);
    }

    if (resume.candidateId !== candidateId) {
      throw new AppException('Resume does not belong to candidate', 409);
    }

    if (!jobDescription) {
      throw new AppException('Job description not found', 404);
    }

    if (!jobDescription.isActive) {
      throw new AppException('Job description is not active', 409);
    }
  }

  private async ensureApplicationExists(id: string) {
    const application = await this.prisma.application.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
      },
    });

    if (!application) {
      throw new AppException('Application not found', 404);
    }

    return application;
  }

  private async ensureUserExists(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!user) {
      throw new AppException('Created by user not found', 404);
    }
  }

  private getApplicationInclude(): Prisma.ApplicationInclude {
    return {
      candidate: true,
      resume: {
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
      },
      jobDescription: {
        include: {
          skills: true,
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
      _count: {
        select: {
          evaluations: true,
          events: true,
        },
      },
    };
  }

  private getCandidateApplicationSummarySelect(): Prisma.ApplicationSelect {
    return {
      id: true,
      candidateId: true,
      jobDescriptionId: true,
      resumeId: true,
      status: true,
      source: true,
      appliedAt: true,
      lastActivityAt: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
      resume: {
        select: {
          id: true,
          parseStatus: true,
          uploadedAt: true,
          fileAsset: {
            select: {
              id: true,
              fileName: true,
              fileType: true,
            },
          },
        },
      },
      jobDescription: {
        select: {
          id: true,
          title: true,
          companyName: true,
          department: true,
          location: true,
          employmentType: true,
          seniority: true,
          isActive: true,
        },
      },
      _count: {
        select: {
          evaluations: true,
          events: true,
        },
      },
    };
  }
}
