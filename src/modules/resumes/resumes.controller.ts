import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';

import { CreateResumeDto } from './dto/create-resume.dto';
import { ResumeQueryDto } from './dto/resume-query.dto';
import { UpdateResumeDto } from './dto/update-resume.dto';
import { ResumesService } from './resumes.service';

@Controller('resumes')
export class ResumesController {
  constructor(private readonly resumesService: ResumesService) {}

  @Post()
  async create(@Body() createResumeDto: CreateResumeDto) {
    const resume = await this.resumesService.create(createResumeDto);

    return {
      message: 'Resume created successfully',
      data: resume,
    };
  }

  @Get()
  async findAll(@Query() query: ResumeQueryDto) {
    const result = await this.resumesService.findAll(query);

    return {
      message: 'Resumes fetched successfully',
      data: result.data,
      meta: result.meta,
    };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const resume = await this.resumesService.findOne(id);

    return {
      message: 'Resume fetched successfully',
      data: resume,
    };
  }

  @Post(':id/parse')
  async parse(@Param('id') id: string) {
    const resume = await this.resumesService.parse(id);

    return {
      message: 'Resume parsed successfully',
      data: resume,
    };
  }

  @Get(':id/parsed-data')
  async getParsedData(@Param('id') id: string) {
    const parsedData = await this.resumesService.getParsedData(id);

    return {
      message: 'Resume parsed data fetched successfully',
      data: parsedData,
    };
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() updateResumeDto: UpdateResumeDto) {
    const resume = await this.resumesService.update(id, updateResumeDto);

    return {
      message: 'Resume updated successfully',
      data: resume,
    };
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const result = await this.resumesService.remove(id);

    return {
      message: 'Resume deleted successfully',
      data: result,
    };
  }
}
