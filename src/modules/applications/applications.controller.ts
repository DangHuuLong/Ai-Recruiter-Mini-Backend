import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { ApplicationsService } from './applications.service';
import { ApplicationQueryDto } from './dto/application-query.dto';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationStatusDto } from './dto/update-application-status.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthUser } from '../../common/types/auth-user.type';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Post('applications')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  async create(
    @Body() createApplicationDto: CreateApplicationDto,
    @CurrentUser() currentUser: AuthUser,
  ) {
    const application = await this.applicationsService.create(
      createApplicationDto,
      currentUser.id,
      currentUser.organizationId,
    );

    return {
      message: 'Application created successfully',
      data: application,
    };
  }

  @Get('applications')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER, UserRole.HIRING_MANAGER)
  async findAll(@Query() query: ApplicationQueryDto, @CurrentUser() currentUser: AuthUser) {
    const result = await this.applicationsService.findAll(query, currentUser.organizationId);

    return {
      message: 'Applications fetched successfully',
      data: result.data,
      meta: result.meta,
    };
  }

  @Get('applications/:id')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER, UserRole.HIRING_MANAGER)
  async findOne(@Param('id') id: string, @CurrentUser() currentUser: AuthUser) {
    const application = await this.applicationsService.findOne(id, currentUser.organizationId);

    return {
      message: 'Application fetched successfully',
      data: application,
    };
  }

  @Patch('applications/:id')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  async update(
    @Param('id') id: string,
    @Body() updateApplicationDto: UpdateApplicationDto,
    @CurrentUser() currentUser: AuthUser,
  ) {
    const application = await this.applicationsService.update(
      id,
      updateApplicationDto,
      currentUser.organizationId,
    );

    return {
      message: 'Application updated successfully',
      data: application,
    };
  }

  @Patch('applications/:id/status')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER, UserRole.HIRING_MANAGER)
  async updateStatus(
    @Param('id') id: string,
    @Body() updateApplicationStatusDto: UpdateApplicationStatusDto,
    @CurrentUser() currentUser: AuthUser,
  ) {
    const application = await this.applicationsService.updateStatus(
      id,
      updateApplicationStatusDto,
      currentUser.organizationId,
    );

    return {
      message: 'Application status updated successfully',
      data: application,
    };
  }

  @Get('applications/:id/events')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER, UserRole.HIRING_MANAGER)
  async findEvents(@Param('id') id: string, @CurrentUser() currentUser: AuthUser) {
    const events = await this.applicationsService.findEvents(id, currentUser.organizationId);

    return {
      message: 'Application events fetched successfully',
      data: events,
    };
  }

  @Get('candidates/:id/applications')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER, UserRole.HIRING_MANAGER)
  async findByCandidateId(@Param('id') id: string, @CurrentUser() currentUser: AuthUser) {
    const applications = await this.applicationsService.findByCandidateId(
      id,
      currentUser.organizationId,
    );

    return {
      message: 'Candidate applications fetched successfully',
      data: applications,
    };
  }
}
