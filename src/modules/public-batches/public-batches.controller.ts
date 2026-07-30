// REST controller for anonymous/public scoring batches: signed upload URLs, batch creation, and status lookup.
import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';

import { CreatePublicBatchDto } from './dto/create-public-batch.dto';
import { PublicBatchesService } from './public-batches.service';
import { CurrentAnonymousSession } from '../../common/decorators/current-anonymous-session.decorator';
import { PublicRateLimitGuard } from '../../common/guards/public-rate-limit.guard';
import { CreateUploadUrlsDto } from '../scoring-batches/dto/create-upload-urls.dto';

@Controller('public/batches')
export class PublicBatchesController {
  constructor(private readonly publicBatchesService: PublicBatchesService) {}

  // POST /public/batches/upload-urls — issues signed Supabase upload URLs for an anonymous session before batch creation.
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

  // POST /public/batches — rate-limited entry point that enqueues resume/JD parsing jobs into the RESUME_PARSE/JD_PARSE queues.
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

  // GET /public/batches/:id — polls batch status/progress/results from the Redis-backed context store.
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
