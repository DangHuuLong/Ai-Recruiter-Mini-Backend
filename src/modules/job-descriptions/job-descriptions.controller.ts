// REST controller for JobDescription CRUD, AI parsing, and parsed-data retrieval.
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { BulkDeactivateJobDescriptionsDto } from './dto/bulk-deactivate-job-descriptions.dto';
import { CreateJobDescriptionDto } from './dto/create-job-description.dto';
import { JobDescriptionQueryDto } from './dto/job-description-query.dto';
import { UpdateJobDescriptionDto } from './dto/update-job-description.dto';
import { JobDescriptionsService } from './job-descriptions.service';
import { AuditLog } from '../../common/decorators/audit-log.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuditLogInterceptor } from '../../common/interceptors/audit-log.interceptor';
import type { AuthUser } from '../../common/types/auth-user.type';

@Controller('job-descriptions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class JobDescriptionsController {
  constructor(private readonly jobDescriptionsService: JobDescriptionsService) {}

  // POST /job-descriptions — creates a raw JobDescription record ahead of AI parsing.
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

  // POST /job-descriptions/bulk-deactivate — deactivates multiple JDs, reporting per-id success/failure.
  @Post('bulk-deactivate')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  @UseInterceptors(AuditLogInterceptor)
  @AuditLog({ action: 'BULK_DEACTIVATE', resourceType: 'JobDescription' })
  async deactivateBulk(
    @Body() dto: BulkDeactivateJobDescriptionsDto,
    @CurrentUser() currentUser: AuthUser,
  ) {
    const results = await this.jobDescriptionsService.deactivateMany(
      dto.ids,
      currentUser.organizationId,
    );

    return {
      message: 'Bulk job description deactivation completed',
      data: results,
    };
  }

  // GET /job-descriptions — paginated, org-scoped listing with search and sort.
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

  // GET /job-descriptions/:id — fetches a single org-scoped JobDescription.
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

  // POST /job-descriptions/:id/parse — triggers AI parsing and occupationFamily/specialization classification.
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

  // GET /job-descriptions/:id/parsed-data — returns the structured AI-parsed fields for a JobDescription.
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

  // PATCH /job-descriptions/:id — partial update, including manual occupationFamily/specialization override.
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

  // DELETE /job-descriptions/:id — soft-deactivates the JD; audited via AuditLogInterceptor.
  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  @UseInterceptors(AuditLogInterceptor)
  @AuditLog({ action: 'DEACTIVATE', resourceType: 'JobDescription' })
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
