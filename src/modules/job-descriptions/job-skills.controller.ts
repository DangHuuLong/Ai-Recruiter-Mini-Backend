import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';

import { CreateJobSkillDto } from './dto/create-job-skill.dto';
import { UpdateJobSkillDto } from './dto/update-job-skill.dto';
import { JobSkillsService } from './job-skills.service';

@Controller()
export class JobSkillsController {
  constructor(private readonly jobSkillsService: JobSkillsService) {}

  @Get('job-descriptions/:id/skills')
  async findByJobDescription(@Param('id') id: string) {
    const skills = await this.jobSkillsService.findByJobDescription(id);

    return {
      message: 'Job skills fetched successfully',
      data: skills,
    };
  }

  @Post('job-descriptions/:id/skills')
  async create(@Param('id') id: string, @Body() createJobSkillDto: CreateJobSkillDto) {
    const skill = await this.jobSkillsService.create(id, createJobSkillDto);

    return {
      message: 'Job skill created successfully',
      data: skill,
    };
  }

  @Patch('job-skills/:skillId')
  async update(@Param('skillId') skillId: string, @Body() updateJobSkillDto: UpdateJobSkillDto) {
    const skill = await this.jobSkillsService.update(skillId, updateJobSkillDto);

    return {
      message: 'Job skill updated successfully',
      data: skill,
    };
  }

  @Delete('job-skills/:skillId')
  async remove(@Param('skillId') skillId: string) {
    const result = await this.jobSkillsService.remove(skillId);

    return {
      message: 'Job skill deleted successfully',
      data: result,
    };
  }
}
