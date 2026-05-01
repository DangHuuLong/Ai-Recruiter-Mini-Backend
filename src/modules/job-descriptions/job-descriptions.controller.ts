import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';

import { CreateJobDescriptionDto } from './dto/create-job-description.dto';
import { JobDescriptionQueryDto } from './dto/job-description-query.dto';
import { UpdateJobDescriptionDto } from './dto/update-job-description.dto';
import { JobDescriptionsService } from './job-descriptions.service';

@Controller('job-descriptions')
export class JobDescriptionsController {
  constructor(private readonly jobDescriptionsService: JobDescriptionsService) {}

  @Post()
  async create(@Body() createJobDescriptionDto: CreateJobDescriptionDto) {
    const jobDescription = await this.jobDescriptionsService.create(createJobDescriptionDto);

    return {
      message: 'Job description created successfully',
      data: jobDescription,
    };
  }

  @Get()
  async findAll(@Query() query: JobDescriptionQueryDto) {
    const result = await this.jobDescriptionsService.findAll(query);

    return {
      message: 'Job descriptions fetched successfully',
      data: result.data,
      meta: result.meta,
    };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const jobDescription = await this.jobDescriptionsService.findOne(id);

    return {
      message: 'Job description fetched successfully',
      data: jobDescription,
    };
  }

  @Post(':id/parse')
  async parse(@Param('id') id: string) {
    const jobDescription = await this.jobDescriptionsService.parse(id);

    return {
      message: 'Job description parsed successfully',
      data: jobDescription,
    };
  }

  @Get(':id/parsed-data')
  async getParsedData(@Param('id') id: string) {
    const parsedData = await this.jobDescriptionsService.getParsedData(id);

    return {
      message: 'Job description parsed data fetched successfully',
      data: parsedData,
    };
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() updateJobDescriptionDto: UpdateJobDescriptionDto) {
    const jobDescription = await this.jobDescriptionsService.update(id, updateJobDescriptionDto);

    return {
      message: 'Job description updated successfully',
      data: jobDescription,
    };
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const jobDescription = await this.jobDescriptionsService.deactivate(id);

    return {
      message: 'Job description deactivated successfully',
      data: jobDescription,
    };
  }
}
