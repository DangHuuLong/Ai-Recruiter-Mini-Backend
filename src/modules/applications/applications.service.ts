// Service for job applications — create/update/list, status transitions with event logging, and lookups by candidate.
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

  // Called by ApplicationsController.create() — validates relations, then creates the application and its CREATED event in a transaction.
  async create(
    createApplicationDto: CreateApplicationDto,
    currentUserId: string,
    organizationId: string,
  ) {
    await this.validateApplicationRelations(
      createApplicationDto.candidateId,
      createApplicationDto.resumeId,
      createApplicationDto.jobDescriptionId,
      organizationId,
    );

    return this.prisma.$transaction(async (tx) => {
      const application = await tx.application.create({
        data: {
          organizationId,
          candidateId: createApplicationDto.candidateId,
          jobDescriptionId: createApplicationDto.jobDescriptionId,
          resumeId: createApplicationDto.resumeId,
          createdById: currentUserId,
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
            createdById: currentUserId,
          },
        },
      });

      return application;
    });
  }

  // Called by ApplicationsController.findAll() — builds filters/search from query params and returns a paginated page.
  async findAll(query: ApplicationQueryDto, organizationId: string) {
    const page = query.page;
    const limit = query.limit;
    const skip = (page - 1) * limit;

    const where: Prisma.ApplicationWhereInput = {
      organizationId,
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

  // Called by ApplicationsController.findOne() and updateStatus() to reload the full record after a no-op status change.
  async findOne(id: string, organizationId: string) {
    const application = await this.prisma.application.findFirst({
      where: { id, organizationId },
      include: this.getApplicationInclude(),
    });

    if (!application) {
      throw new AppException('Application not found', 404);
    }

    return application;
  }

  // Called by ApplicationsController.update() — patches source/notes on an existing application.
  async update(id: string, updateApplicationDto: UpdateApplicationDto, organizationId: string) {
    await this.ensureApplicationExists(id, organizationId);

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

  // Called by ApplicationsController.updateStatus() — transitions status and records a STATUS_CHANGED event in a transaction.
  async updateStatus(
    id: string,
    updateApplicationStatusDto: UpdateApplicationStatusDto,
    organizationId: string,
  ) {
    const existingApplication = await this.ensureApplicationExists(id, organizationId);
    const nextStatus = updateApplicationStatusDto.status as ApplicationStatus;

    if (existingApplication.status === nextStatus) {
      return this.findOne(id, organizationId);
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

  // Called by ApplicationsController.findEvents() — returns the event/audit log for one application.
  async findEvents(id: string, organizationId: string) {
    await this.ensureApplicationExists(id, organizationId);

    return this.prisma.applicationEvent.findMany({
      where: {
        applicationId: id,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  // Called by ApplicationsController.findByCandidateId() — lists a candidate's applications with a summary projection.
  async findByCandidateId(candidateId: string, organizationId: string) {
    const candidate = await this.prisma.candidate.findFirst({
      where: { id: candidateId, organizationId },
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

  // Called by create() to confirm the candidate, resume, and job description exist, belong together, and the job is active.
  private async validateApplicationRelations(
    candidateId: string,
    resumeId: string,
    jobDescriptionId: string,
    organizationId: string,
  ) {
    const [candidate, resume, jobDescription] = await this.prisma.$transaction([
      this.prisma.candidate.findFirst({
        where: { id: candidateId, organizationId },
        select: { id: true },
      }),
      this.prisma.resume.findFirst({
        where: { id: resumeId, candidate: { organizationId } },
        select: { id: true, candidateId: true },
      }),
      this.prisma.jobDescription.findFirst({
        where: { id: jobDescriptionId, organizationId },
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

  // Called by update(), updateStatus(), and findEvents() to 404 early when the application isn't found in this org.
  private async ensureApplicationExists(id: string, organizationId: string) {
    const application = await this.prisma.application.findFirst({
      where: { id, organizationId },
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

  // Shared Prisma include shape used by create/findAll/findOne/update/updateStatus to hydrate related records.
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

  // Prisma select shape used by findByCandidateId() to return a lighter-weight application summary.
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
