import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { BulkCreateInterviewQuestionsDto } from './dto/bulk-create-interview-questions.dto';
import { CreateInterviewQuestionDto } from './dto/create-interview-question.dto';
import { InterviewQuestionQueryDto } from './dto/interview-question-query.dto';
import { SearchInterviewQuestionsDto } from './dto/search-interview-questions.dto';
import { UpdateInterviewQuestionDto } from './dto/update-interview-question.dto';
import { InterviewQuestionsService } from './interview-questions.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

// Shared, non-org-scoped question bank (see PLAN.md Phase 7) — gated by the
// DEV role rather than the usual ADMIN/RECRUITER/HIRING_MANAGER trio, since
// this curates data for the whole system, not one organization.
@Controller('interview-questions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.DEV)
export class InterviewQuestionsController {
  constructor(private readonly interviewQuestionsService: InterviewQuestionsService) {}

  @Post()
  async create(@Body() createDto: CreateInterviewQuestionDto) {
    const question = await this.interviewQuestionsService.create(createDto);

    return {
      message: 'Interview question created successfully',
      data: question,
    };
  }

  @Post('bulk')
  async createBulk(@Body() bulkDto: BulkCreateInterviewQuestionsDto) {
    const results = await this.interviewQuestionsService.createBulk(bulkDto.items);
    const succeeded = results.filter((r) => r.success).length;

    return {
      message: `Created ${succeeded}/${results.length} interview questions`,
      data: results,
    };
  }

  @Post('search')
  async search(@Body() searchDto: SearchInterviewQuestionsDto) {
    const results = await this.interviewQuestionsService.search(searchDto);

    return {
      message: `Found ${results.length} matching questions`,
      data: results,
    };
  }

  @Get()
  async findAll(@Query() query: InterviewQuestionQueryDto) {
    const result = await this.interviewQuestionsService.findAll(query);

    return {
      message: 'Interview questions fetched successfully',
      data: result.data,
      meta: result.meta,
    };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const question = await this.interviewQuestionsService.findOne(id);

    return {
      message: 'Interview question fetched successfully',
      data: question,
    };
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() updateDto: UpdateInterviewQuestionDto) {
    const question = await this.interviewQuestionsService.update(id, updateDto);

    return {
      message: 'Interview question updated successfully',
      data: question,
    };
  }

  @Post(':id/reembed')
  async reembed(@Param('id') id: string) {
    const question = await this.interviewQuestionsService.reembed(id);

    return {
      message: 'Interview question re-embedded successfully',
      data: question,
    };
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const result = await this.interviewQuestionsService.remove(id);

    return {
      message: 'Interview question deleted successfully',
      data: result,
    };
  }
}
