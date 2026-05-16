import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { CreateResumeDto } from './dto/create-resume.dto';
import { ResumeQueryDto } from './dto/resume-query.dto';
import { UpdateResumeDto } from './dto/update-resume.dto';
import { ResumesService } from './resumes.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

@Controller('resumes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ResumesController {
  constructor(private readonly resumesService: ResumesService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  async create(@Body() createResumeDto: CreateResumeDto) {
    const resume = await this.resumesService.create(createResumeDto);

    return {
      message: 'Resume created successfully',
      data: resume,
    };
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.RECRUITER, UserRole.HIRING_MANAGER)
  async findAll(@Query() query: ResumeQueryDto) {
    const result = await this.resumesService.findAll(query);

    return {
      message: 'Resumes fetched successfully',
      data: result.data,
      meta: result.meta,
    };
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER, UserRole.HIRING_MANAGER)
  async findOne(@Param('id') id: string) {
    const resume = await this.resumesService.findOne(id);

    return {
      message: 'Resume fetched successfully',
      data: resume,
    };
  }

  @Post(':id/parse')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  async parse(@Param('id') id: string) {
    const resume = await this.resumesService.parse(id);

    return {
      message: 'Resume parsed successfully',
      data: resume,
    };
  }

  @Get(':id/parsed-data')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER, UserRole.HIRING_MANAGER)
  async getParsedData(@Param('id') id: string) {
    const parsedData = await this.resumesService.getParsedData(id);

    return {
      message: 'Resume parsed data fetched successfully',
      data: parsedData,
    };
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  async update(@Param('id') id: string, @Body() updateResumeDto: UpdateResumeDto) {
    const resume = await this.resumesService.update(id, updateResumeDto);

    return {
      message: 'Resume updated successfully',
      data: resume,
    };
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  async remove(@Param('id') id: string) {
    const result = await this.resumesService.remove(id);

    return {
      message: 'Resume deleted successfully',
      data: result,
    };
  }
}
