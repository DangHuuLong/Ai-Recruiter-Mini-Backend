import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';

import { ApplicationsService } from './applications.service';
import { ApplicationQueryDto } from './dto/application-query.dto';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';
import { UpdateApplicationStatusDto } from './dto/update-application-status.dto';

@Controller()
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Post('applications')
  async create(@Body() createApplicationDto: CreateApplicationDto) {
    const application = await this.applicationsService.create(createApplicationDto);

    return {
      message: 'Application created successfully',
      data: application,
    };
  }

  @Get('applications')
  async findAll(@Query() query: ApplicationQueryDto) {
    const result = await this.applicationsService.findAll(query);

    return {
      message: 'Applications fetched successfully',
      data: result.data,
      meta: result.meta,
    };
  }

  @Get('applications/:id')
  async findOne(@Param('id') id: string) {
    const application = await this.applicationsService.findOne(id);

    return {
      message: 'Application fetched successfully',
      data: application,
    };
  }

  @Patch('applications/:id')
  async update(@Param('id') id: string, @Body() updateApplicationDto: UpdateApplicationDto) {
    const application = await this.applicationsService.update(id, updateApplicationDto);

    return {
      message: 'Application updated successfully',
      data: application,
    };
  }

  @Patch('applications/:id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() updateApplicationStatusDto: UpdateApplicationStatusDto,
  ) {
    const application = await this.applicationsService.updateStatus(id, updateApplicationStatusDto);

    return {
      message: 'Application status updated successfully',
      data: application,
    };
  }

  @Get('applications/:id/events')
  async findEvents(@Param('id') id: string) {
    const events = await this.applicationsService.findEvents(id);

    return {
      message: 'Application events fetched successfully',
      data: events,
    };
  }

  @Get('candidates/:id/applications')
  async findByCandidateId(@Param('id') id: string) {
    const applications = await this.applicationsService.findByCandidateId(id);

    return {
      message: 'Candidate applications fetched successfully',
      data: applications,
    };
  }
}
