import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';

import { CreatePublicBatchDto } from './dto/create-public-batch.dto';
import { PublicBatchesService } from './public-batches.service';
import { CurrentAnonymousSession } from '../../common/decorators/current-anonymous-session.decorator';
import { PublicRateLimitGuard } from '../../common/guards/public-rate-limit.guard';
import { CreateUploadUrlsDto } from '../scoring-batches/dto/create-upload-urls.dto';

@Controller('public/batches')
export class PublicBatchesController {
  constructor(private readonly publicBatchesService: PublicBatchesService) {}

  @Post('upload-urls')
  async createUploadUrls(
    @Body() dto: CreateUploadUrlsDto,
    @CurrentAnonymousSession() sessionId: string,
  ) {
    const data = await this.publicBatchesService.createUploadUrls(dto, sessionId);

    return {
      message: 'Upload URLs generated successfully',
      data,
    };
  }

  @Post()
  @UseGuards(PublicRateLimitGuard)
  @HttpCode(202)
  async create(
    @Body() dto: CreatePublicBatchDto,
    @CurrentAnonymousSession() sessionId: string,
  ) {
    const data = await this.publicBatchesService.create(dto, sessionId);

    return {
      message: 'Scoring batch created successfully',
      data,
    };
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @CurrentAnonymousSession() sessionId: string,
  ) {
    const data = await this.publicBatchesService.findOne(id, sessionId);

    return {
      message: 'Batch retrieved successfully',
      data,
    };
  }
}
