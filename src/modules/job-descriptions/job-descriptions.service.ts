import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { CreateJobDescriptionDto } from './dto/create-job-description.dto';
import { JobDescriptionQueryDto } from './dto/job-description-query.dto';
import { UpdateJobDescriptionDto } from './dto/update-job-description.dto';
import { AppException } from '../../common/exceptions/app.exception';
import { PrismaService } from '../../database/prisma/prisma.service';

@Injectable()
export class JobDescriptionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createJobDescriptionDto: CreateJobDescriptionDto) {
    if (createJobDescriptionDto.createdById) {
      const user = await this.prisma.user.findUnique({
        where: { id: createJobDescriptionDto.createdById },
        select: { id: true },
      });

      if (!user) {
        throw new AppException('Created by user not found', 404);
      }
    }

    return this.prisma.jobDescription.create({
      data: {
        createdById: createJobDescriptionDto.createdById,
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

  async findAll(query: JobDescriptionQueryDto) {
    const page = query.page;
    const limit = query.limit;
    const skip = (page - 1) * limit;

    const where: Prisma.JobDescriptionWhereInput = {
      isActive: true,
      ...(query.search
        ? {
            OR: [
              {
                title: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
              {
                companyName: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
              {
                department: {
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
        : {}),
    };

    const [jobDescriptions, total] = await this.prisma.$transaction([
      this.prisma.jobDescription.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          [query.sortBy]: query.sortOrder,
        },
        include: {
          _count: {
            select: {
              applications: true,
              skills: true,
              evaluationConfigs: true,
            },
          },
        },
      }),
      this.prisma.jobDescription.count({ where }),
    ]);

    return {
      data: jobDescriptions,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const jobDescription = await this.prisma.jobDescription.findFirst({
      where: {
        id,
        isActive: true,
      },
      include: {
        skills: true,
        _count: {
          select: {
            applications: true,
            evaluationConfigs: true,
          },
        },
      },
    });

    if (!jobDescription) {
      throw new AppException('Job description not found', 404);
    }

    return jobDescription;
  }

  async update(id: string, updateJobDescriptionDto: UpdateJobDescriptionDto) {
    await this.findOne(id);

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

  async deactivate(id: string) {
    await this.findOne(id);

    return this.prisma.jobDescription.update({
      where: { id },
      data: {
        isActive: false,
      },
    });
  }
}
