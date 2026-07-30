// REST controller for InterviewQuestionEntry admin CRUD, search, AI-fallback search-or-generate, and re-embedding (DEV role only).
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { BulkCreateInterviewQuestionsDto } from './dto/bulk-create-interview-questions.dto';
import { CreateInterviewQuestionDto } from './dto/create-interview-question.dto';
import { InterviewQuestionQueryDto } from './dto/interview-question-query.dto';
import { SearchInterviewQuestionsDto } from './dto/search-interview-questions.dto';
import { UpdateInterviewQuestionDto } from './dto/update-interview-question.dto';
import { InterviewQuestionsService } from './interview-questions.service';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { EnterpriseRateLimitGuard } from '../../common/guards/enterprise-rate-limit.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

@Controller('interview-questions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.DEV)
export class InterviewQuestionsController {
  constructor(private readonly interviewQuestionsService: InterviewQuestionsService) {}

  // POST /interview-questions — manually authors a single InterviewQuestionEntry via InterviewQuestionsService.create.
  @Post()
  async create(@Body() createDto: CreateInterviewQuestionDto) {
    const question = await this.interviewQuestionsService.create(createDto);

    return {
      message: 'Interview question created successfully',
      data: question,
    };
  }

  // POST /interview-questions/bulk — creates up to 200 questions at once, reporting per-item success/failure.
  @Post('bulk')
  async createBulk(@Body() bulkDto: BulkCreateInterviewQuestionsDto) {
    const results = await this.interviewQuestionsService.createBulk(bulkDto.items);
    const succeeded = results.filter((r) => r.success).length;

    return {
      message: `Created ${succeeded}/${results.length} interview questions`,
      data: results,
    };
  }

  // POST /interview-questions/search — semantic search only, no AI-fallback generation.
  @Post('search')
  async search(@Body() searchDto: SearchInterviewQuestionsDto) {
    const results = await this.interviewQuestionsService.search(searchDto);

    return {
      message: `Found ${results.length} matching questions`,
      data: results,
    };
  }

  @Post('search-or-generate')
  @UseGuards(EnterpriseRateLimitGuard)
  @RateLimit({
    action: 'interview-question-search',
    envVar: 'ENTERPRISE_RATE_LIMIT_MAX_QUESTION_SEARCHES_PER_HOUR',
    defaultMax: 100,
  })
  // POST /interview-questions/search-or-generate — rate-limited endpoint that falls back to LLM generation when retrieval is thin.
  async searchOrGenerate(@Body() searchDto: SearchInterviewQuestionsDto) {
    const result = await this.interviewQuestionsService.searchOrGenerate(searchDto);

    return {
      message: `Found ${result.existing.length} matching questions, generated ${result.generated.length} new`,
      data: result,
    };
  }

  // GET /interview-questions — paginated listing with optional occupationFamily/questionType/qualityGateStatus filters.
  @Get()
  async findAll(@Query() query: InterviewQuestionQueryDto) {
    const result = await this.interviewQuestionsService.findAll(query);

    return {
      message: 'Interview questions fetched successfully',
      data: result.data,
      meta: result.meta,
    };
  }

  // GET /interview-questions/:id — fetches a single question or 404s via InterviewQuestionsService.findOne.
  @Get(':id')
  async findOne(@Param('id') id: string) {
    const question = await this.interviewQuestionsService.findOne(id);

    return {
      message: 'Interview question fetched successfully',
      data: question,
    };
  }

  // PATCH /interview-questions/:id — partial update; re-embeds the question if questionText changes.
  @Patch(':id')
  async update(@Param('id') id: string, @Body() updateDto: UpdateInterviewQuestionDto) {
    const question = await this.interviewQuestionsService.update(id, updateDto);

    return {
      message: 'Interview question updated successfully',
      data: question,
    };
  }

  // POST /interview-questions/:id/reembed — recomputes and persists the vector embedding for an existing question.
  @Post(':id/reembed')
  async reembed(@Param('id') id: string) {
    const question = await this.interviewQuestionsService.reembed(id);

    return {
      message: 'Interview question re-embedded successfully',
      data: question,
    };
  }

  // DELETE /interview-questions/:id — hard-deletes an InterviewQuestionEntry.
  @Delete(':id')
  async remove(@Param('id') id: string) {
    const result = await this.interviewQuestionsService.remove(id);

    return {
      message: 'Interview question deleted successfully',
      data: result,
    };
  }
}
