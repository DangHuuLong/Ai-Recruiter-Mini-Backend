// HTTP routes for creating, listing, parsing, and managing resumes within an organization.
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { CreateResumeDto } from './dto/create-resume.dto';
import { ResumeQueryDto } from './dto/resume-query.dto';
import { UpdateResumeDto } from './dto/update-resume.dto';
import { ResumesService } from './resumes.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthUser } from '../../common/types/auth-user.type';

@Controller('resumes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ResumesController {
  constructor(private readonly resumesService: ResumesService) {}

  // POST /resumes — links an existing file asset to a candidate; delegates to ResumesService.create.
  @Post()
  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  async create(@Body() createResumeDto: CreateResumeDto, @CurrentUser() currentUser: AuthUser) {
    const resume = await this.resumesService.create(createResumeDto, currentUser.organizationId);

    return {
      message: 'Resume created successfully',
      data: resume,
    };
  }

  // GET /resumes — paginated, filterable list of resumes for the caller's organization.
  @Get()
  @Roles(UserRole.ADMIN, UserRole.RECRUITER, UserRole.HIRING_MANAGER)
  async findAll(@Query() query: ResumeQueryDto, @CurrentUser() currentUser: AuthUser) {
    const result = await this.resumesService.findAll(query, currentUser.organizationId);

    return {
      message: 'Resumes fetched successfully',
      data: result.data,
      meta: result.meta,
    };
  }

  // GET /resumes/:id — fetches a single resume with candidate and file asset details.
  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER, UserRole.HIRING_MANAGER)
  async findOne(@Param('id') id: string, @CurrentUser() currentUser: AuthUser) {
    const resume = await this.resumesService.findOne(id, currentUser.organizationId);

    return {
      message: 'Resume fetched successfully',
      data: resume,
    };
  }

  // POST /resumes/:id/parse — triggers AI parsing of the resume's file via ResumesService.parse.
  @Post(':id/parse')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  async parse(@Param('id') id: string, @CurrentUser() currentUser: AuthUser) {
    const resume = await this.resumesService.parse(id, currentUser.organizationId);

    return {
      message: 'Resume parsed successfully',
      data: resume,
    };
  }

  // GET /resumes/:id/parsed-data — returns just the AI-parsed text/data/status fields of a resume.
  @Get(':id/parsed-data')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER, UserRole.HIRING_MANAGER)
  async getParsedData(@Param('id') id: string, @CurrentUser() currentUser: AuthUser) {
    const parsedData = await this.resumesService.getParsedData(id, currentUser.organizationId);

    return {
      message: 'Resume parsed data fetched successfully',
      data: parsedData,
    };
  }

  // PATCH /resumes/:id — partial update of a resume's parsed fields via ResumesService.update.
  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  async update(
    @Param('id') id: string,
    @Body() updateResumeDto: UpdateResumeDto,
    @CurrentUser() currentUser: AuthUser,
  ) {
    const resume = await this.resumesService.update(id, updateResumeDto, currentUser.organizationId);

    return {
      message: 'Resume updated successfully',
      data: resume,
    };
  }

  // DELETE /resumes/:id — deletes a resume via ResumesService.remove, blocked if applications reference it.
  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  async remove(@Param('id') id: string, @CurrentUser() currentUser: AuthUser) {
    const result = await this.resumesService.remove(id, currentUser.organizationId);

    return {
      message: 'Resume deleted successfully',
      data: result,
    };
  }
}
