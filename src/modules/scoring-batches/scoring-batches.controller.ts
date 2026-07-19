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

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  async getStatus(@Param('id') id: string, @CurrentUser() currentUser: AuthUser) {
    const data = await this.scoringBatchesService.getStatus(id, currentUser.organizationId);

    return { message: 'Batch status retrieved successfully', data };
  }

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
  @AuditLog({ action: 'CANCEL', resourceType: 'ScoringBatch' })
  async cancel(@Param('id') id: string, @CurrentUser() currentUser: AuthUser) {
    const data = await this.scoringBatchesService.cancel(id, currentUser.organizationId);

    return { message: 'Scoring batch cancelled successfully', data };
  }

  @Post(':id/promote')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  @UseInterceptors(AuditLogInterceptor)
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
