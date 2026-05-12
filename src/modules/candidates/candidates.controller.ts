import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';

import { CandidatesService } from './candidates.service';
import { CandidateQueryDto } from './dto/candidate-query.dto';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { UpdateCandidateDto } from './dto/update-candidate.dto';

@Controller('candidates')
export class CandidatesController {
  constructor(private readonly candidatesService: CandidatesService) {}

  @Post()
  async create(@Body() createCandidateDto: CreateCandidateDto) {
    const candidate = await this.candidatesService.create(createCandidateDto);

    return {
      message: 'Candidate created successfully',
      data: candidate,
    };
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() updateCandidateDto: UpdateCandidateDto) {
    const candidate = await this.candidatesService.update(id, updateCandidateDto);

    return {
      message: 'Candidate updated successfully',
      data: candidate,
    };
  }

  @Get()
  async findAll(@Query() query: CandidateQueryDto) {
    const result = await this.candidatesService.findAll(query);

    return {
      message: 'Candidates fetched successfully',
      data: result.data,
      meta: result.meta,
    };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const candidate = await this.candidatesService.findOne(id);

    return {
      message: 'Candidate fetched successfully',
      data: candidate,
    };
  }

  @Get(':id/resumes')
  async findResumesByCandidateId(@Param('id') id: string) {
    const resumes = await this.candidatesService.findResumesByCandidateId(id);

    return {
      message: 'Candidate resumes fetched successfully',
      data: resumes,
    };
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const result = await this.candidatesService.remove(id);

    return {
      message: 'Candidate deleted successfully',
      data: result,
    };
  }
}
