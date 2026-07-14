import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { CreateScoringBatchDto } from './dto/create-scoring-batch.dto';
import { CreateUploadUrlsDto } from './dto/create-upload-urls.dto';
import { ScoringBatchesService } from './scoring-batches.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthUser } from '../../common/types/auth-user.type';

@Controller('scoring-batches')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ScoringBatchesController {
  constructor(private readonly scoringBatchesService: ScoringBatchesService) {}

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
}
