import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { CreateJobDescriptionDto } from './dto/create-job-description.dto';
import { JobDescriptionQueryDto } from './dto/job-description-query.dto';
import { UpdateJobDescriptionDto } from './dto/update-job-description.dto';
import { JobDescriptionsService } from './job-descriptions.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthUser } from '../../common/types/auth-user.type';

@Controller('job-descriptions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class JobDescriptionsController {
  constructor(private readonly jobDescriptionsService: JobDescriptionsService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  async create(
    @Body() createJobDescriptionDto: CreateJobDescriptionDto,
    @CurrentUser() currentUser: AuthUser,
  ) {
    const jobDescription = await this.jobDescriptionsService.create(
      createJobDescriptionDto,
      currentUser.id,
      currentUser.organizationId,
    );

    return {
      message: 'Job description created successfully',
      data: jobDescription,
    };
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.RECRUITER, UserRole.HIRING_MANAGER)
  async findAll(@Query() query: JobDescriptionQueryDto, @CurrentUser() currentUser: AuthUser) {
    const result = await this.jobDescriptionsService.findAll(query, currentUser.organizationId);

    return {
      message: 'Job descriptions fetched successfully',
      data: result.data,
      meta: result.meta,
    };
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER, UserRole.HIRING_MANAGER)
  async findOne(@Param('id') id: string, @CurrentUser() currentUser: AuthUser) {
    const jobDescription = await this.jobDescriptionsService.findOne(
      id,
      currentUser.organizationId,
    );

    return {
      message: 'Job description fetched successfully',
      data: jobDescription,
    };
  }

  @Post(':id/parse')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  async parse(@Param('id') id: string, @CurrentUser() currentUser: AuthUser) {
    const jobDescription = await this.jobDescriptionsService.parse(
      id,
      currentUser.organizationId,
    );

    return {
      message: 'Job description parsed successfully',
      data: jobDescription,
    };
  }

  @Get(':id/parsed-data')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER, UserRole.HIRING_MANAGER)
  async getParsedData(@Param('id') id: string, @CurrentUser() currentUser: AuthUser) {
    const parsedData = await this.jobDescriptionsService.getParsedData(
      id,
      currentUser.organizationId,
    );

    return {
      message: 'Job description parsed data fetched successfully',
      data: parsedData,
    };
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  async update(
    @Param('id') id: string,
    @Body() updateJobDescriptionDto: UpdateJobDescriptionDto,
    @CurrentUser() currentUser: AuthUser,
  ) {
    const jobDescription = await this.jobDescriptionsService.update(
      id,
      updateJobDescriptionDto,
      currentUser.organizationId,
    );

    return {
      message: 'Job description updated successfully',
      data: jobDescription,
    };
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  async remove(@Param('id') id: string, @CurrentUser() currentUser: AuthUser) {
    const jobDescription = await this.jobDescriptionsService.deactivate(
      id,
      currentUser.organizationId,
    );

    return {
      message: 'Job description deactivated successfully',
      data: jobDescription,
    };
  }
}
