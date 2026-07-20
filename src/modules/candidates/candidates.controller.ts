// Controller for /candidates — create/update/list/delete candidates and fetch their resumes.
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

import { CandidatesService } from './candidates.service';
import { BulkDeleteCandidatesDto } from './dto/bulk-delete-candidates.dto';
import { CandidateQueryDto } from './dto/candidate-query.dto';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { UpdateCandidateDto } from './dto/update-candidate.dto';
import { AuditLog } from '../../common/decorators/audit-log.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuditLogInterceptor } from '../../common/interceptors/audit-log.interceptor';
import type { AuthUser } from '../../common/types/auth-user.type';

@Controller('candidates')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CandidatesController {
  constructor(private readonly candidatesService: CandidatesService) {}

  // POST /candidates — creates a candidate directly (not via resume parsing).
  @Post()
  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  async create(
    @Body() createCandidateDto: CreateCandidateDto,
    @CurrentUser() currentUser: AuthUser,
  ) {
    const candidate = await this.candidatesService.create(
      createCandidateDto,
      currentUser.organizationId,
    );

    return {
      message: 'Candidate created successfully',
      data: candidate,
    };
  }

  // POST /candidates/bulk-delete — deletes multiple candidates, reporting per-id success/failure.
  @Post('bulk-delete')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  @UseInterceptors(AuditLogInterceptor)
  @AuditLog({ action: 'BULK_DELETE', resourceType: 'Candidate' })
  async removeBulk(@Body() dto: BulkDeleteCandidatesDto, @CurrentUser() currentUser: AuthUser) {
    const results = await this.candidatesService.removeMany(dto.ids, currentUser.organizationId);

    return {
      message: 'Bulk candidate deletion completed',
      data: results,
    };
  }

  // PATCH /candidates/:id — updates a candidate's profile fields.
  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  async update(
    @Param('id') id: string,
    @Body() updateCandidateDto: UpdateCandidateDto,
    @CurrentUser() currentUser: AuthUser,
  ) {
    const candidate = await this.candidatesService.update(
      id,
      updateCandidateDto,
      currentUser.organizationId,
    );

    return {
      message: 'Candidate updated successfully',
      data: candidate,
    };
  }

  // GET /candidates — paginated, searchable list of candidates in the current org.
  @Get()
  @Roles(UserRole.ADMIN, UserRole.RECRUITER, UserRole.HIRING_MANAGER)
  async findAll(@Query() query: CandidateQueryDto, @CurrentUser() currentUser: AuthUser) {
    const result = await this.candidatesService.findAll(query, currentUser.organizationId);

    return {
      message: 'Candidates fetched successfully',
      data: result.data,
      meta: result.meta,
    };
  }

  // GET /candidates/:id — fetches a single candidate with a resume count.
  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER, UserRole.HIRING_MANAGER)
  async findOne(@Param('id') id: string, @CurrentUser() currentUser: AuthUser) {
    const candidate = await this.candidatesService.findOne(id, currentUser.organizationId);

    return {
      message: 'Candidate fetched successfully',
      data: candidate,
    };
  }

  // GET /candidates/:id/resumes — lists resumes uploaded for a candidate.
  @Get(':id/resumes')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER, UserRole.HIRING_MANAGER)
  async findResumesByCandidateId(@Param('id') id: string, @CurrentUser() currentUser: AuthUser) {
    const resumes = await this.candidatesService.findResumesByCandidateId(
      id,
      currentUser.organizationId,
    );

    return {
      message: 'Candidate resumes fetched successfully',
      data: resumes,
    };
  }

  // DELETE /candidates/:id — deletes a candidate with no related resumes/applications; audit-logged via AuditLogInterceptor.
  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  @UseInterceptors(AuditLogInterceptor)
  @AuditLog({ action: 'DELETE', resourceType: 'Candidate' })
  async remove(@Param('id') id: string, @CurrentUser() currentUser: AuthUser) {
    const result = await this.candidatesService.remove(id, currentUser.organizationId);

    return {
      message: 'Candidate deleted successfully',
      data: result,
    };
  }
}
