// HTTP routes for creating scoring batches, uploading files, polling status/matrix/cells, and exporting or promoting results.
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { Response } from 'express';

import { CreateScoringBatchDto } from './dto/create-scoring-batch.dto';
import { CreateUploadUrlsDto } from './dto/create-upload-urls.dto';
import { MatrixQueryDto } from './dto/matrix-query.dto';
import { PromoteBatchDto } from './dto/promote-batch.dto';
import { ScoringBatchQueryDto } from './dto/scoring-batch-query.dto';
import { SkillGapQueryDto } from './dto/skill-gap-query.dto';
import { ScoringBatchPromoteService } from './scoring-batch-promote.service';
import { ScoringBatchesService } from './scoring-batches.service';
import { AuditLog } from '../../common/decorators/audit-log.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { EnterpriseRateLimitGuard } from '../../common/guards/enterprise-rate-limit.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuditLogInterceptor } from '../../common/interceptors/audit-log.interceptor';
import type { AuthUser } from '../../common/types/auth-user.type';

@Controller('scoring-batches')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ScoringBatchesController {
  constructor(
    private readonly scoringBatchesService: ScoringBatchesService,
    private readonly promoteService: ScoringBatchPromoteService,
  ) {}

  // POST /scoring-batches/upload-urls — issues pre-signed URLs so the client can upload files before creating a batch.
  @Post('upload-urls')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  async createUploadUrls(
    @Body() dto: CreateUploadUrlsDto,
    @CurrentUser() currentUser: AuthUser,
  ) {
    const data = await this.scoringBatchesService.createUploadUrls(
      dto,
      currentUser.organizationId,
    );

    return {
      message: 'Upload URLs generated successfully',
      data,
    };
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  @UseGuards(EnterpriseRateLimitGuard)
  @RateLimit({
    action: 'scoring-batches',
    envVar: 'ENTERPRISE_RATE_LIMIT_MAX_BATCHES_PER_HOUR',
    defaultMax: 20,
  })
  // POST /scoring-batches — creates a batch and enqueues resume/JD parse jobs; returns 202 since work runs async on the queue.
  @HttpCode(202)
  async create(@Body() dto: CreateScoringBatchDto, @CurrentUser() currentUser: AuthUser) {
    const data = await this.scoringBatchesService.create(
      dto,
      currentUser.organizationId,
      currentUser.id,
    );

    return {
      message: 'Scoring batch created successfully',
      data,
    };
  }

  // GET /scoring-batches — paginated, org-scoped list of scoring batches for the batch list UI.
  @Get()
  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  async findAll(@Query() query: ScoringBatchQueryDto, @CurrentUser() currentUser: AuthUser) {
    const result = await this.scoringBatchesService.findAll(query, currentUser.organizationId);

    return {
      message: 'Scoring batches fetched successfully',
      data: result.data,
      meta: result.meta,
    };
  }

  // GET /scoring-batches/:id — polled by clients to track parse/scoring progress and overall batch status.
  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  async getStatus(@Param('id') id: string, @CurrentUser() currentUser: AuthUser) {
    const data = await this.scoringBatchesService.getStatus(id, currentUser.organizationId);

    return { message: 'Batch status retrieved successfully', data };
  }

  // GET /scoring-batches/:id/matrix — paginated resume x JD score grid, used by the results UI.
  @Get(':id/matrix')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  async getMatrix(
    @Param('id') id: string,
    @Query() query: MatrixQueryDto,
    @CurrentUser() currentUser: AuthUser,
  ) {
    const data = await this.scoringBatchesService.getMatrix(id, currentUser.organizationId, query);

    return { message: 'Batch matrix retrieved successfully', data };
  }

  // GET /scoring-batches/:id/cells/:resumeItemId/:jdItemId — full scoring detail for a single resume x JD pair.
  @Get(':id/cells/:resumeItemId/:jdItemId')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  async getCell(
    @Param('id') id: string,
    @Param('resumeItemId') resumeItemId: string,
    @Param('jdItemId') jdItemId: string,
    @CurrentUser() currentUser: AuthUser,
  ) {
    const data = await this.scoringBatchesService.getCell(
      id,
      resumeItemId,
      jdItemId,
      currentUser.organizationId,
    );

    return { message: 'Cell retrieved successfully', data };
  }

  // GET /scoring-batches/:id/skill-gap-summary — aggregated missing-skill report across the batch, optionally scoped to one JD.
  @Get(':id/skill-gap-summary')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  async getSkillGapSummary(
    @Param('id') id: string,
    @Query() query: SkillGapQueryDto,
    @CurrentUser() currentUser: AuthUser,
  ) {
    const data = await this.scoringBatchesService.getSkillGapSummary(
      id,
      currentUser.organizationId,
      query,
    );

    return { message: 'Skill gap summary retrieved successfully', data };
  }

  // GET /scoring-batches/:id/export — streams the batch's score matrix as a downloadable CSV file.
  @Get(':id/export')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  async exportCsv(
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthUser,
    @Res() res: Response,
  ) {
    const csv = await this.scoringBatchesService.exportCsv(id, currentUser.organizationId);

    res.header('Content-Type', 'text/csv; charset=utf-8');
    res.header('Content-Disposition', `attachment; filename="scoring-batch-${id}.csv"`);
    res.send(csv);
  }

  @Post(':id/cancel')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  @UseInterceptors(AuditLogInterceptor)
  // POST /scoring-batches/:id/cancel — stops further processing of a batch; audited via AuditLogInterceptor.
  @AuditLog({ action: 'CANCEL', resourceType: 'ScoringBatch' })
  async cancel(@Param('id') id: string, @CurrentUser() currentUser: AuthUser) {
    const data = await this.scoringBatchesService.cancel(id, currentUser.organizationId);

    return { message: 'Scoring batch cancelled successfully', data };
  }

  @Post(':id/promote')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  @UseInterceptors(AuditLogInterceptor)
  // POST /scoring-batches/:id/promote — turns selected cells into real Candidate/Application/Evaluation rows via ScoringBatchPromoteService.
  @AuditLog({ action: 'PROMOTE', resourceType: 'ScoringBatch' })
  async promote(
    @Param('id') id: string,
    @Body() dto: PromoteBatchDto,
    @CurrentUser() currentUser: AuthUser,
  ) {
    const data = await this.promoteService.promote(
      id,
      dto,
      currentUser.organizationId,
      currentUser.id,
    );

    return { message: 'Batch items promoted successfully', data };
  }
}
