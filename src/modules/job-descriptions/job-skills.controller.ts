// REST controller for JobSkill CRUD, nested under job-descriptions/:id/skills and job-skills/:skillId.
import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { CreateJobSkillDto } from './dto/create-job-skill.dto';
import { UpdateJobSkillDto } from './dto/update-job-skill.dto';
import { JobSkillsService } from './job-skills.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthUser } from '../../common/types/auth-user.type';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class JobSkillsController {
  constructor(private readonly jobSkillsService: JobSkillsService) {}

  // GET /job-descriptions/:id/skills — lists JobSkill rows for a JD.
  @Get('job-descriptions/:id/skills')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER, UserRole.HIRING_MANAGER)
  async findByJobDescription(@Param('id') id: string, @CurrentUser() currentUser: AuthUser) {
    const skills = await this.jobSkillsService.findByJobDescription(
      id,
      currentUser.organizationId,
    );

    return {
      message: 'Job skills fetched successfully',
      data: skills,
    };
  }

  // POST /job-descriptions/:id/skills — manually adds one JobSkill to a JD.
  @Post('job-descriptions/:id/skills')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  async create(
    @Param('id') id: string,
    @Body() createJobSkillDto: CreateJobSkillDto,
    @CurrentUser() currentUser: AuthUser,
  ) {
    const skill = await this.jobSkillsService.create(
      id,
      createJobSkillDto,
      currentUser.organizationId,
    );

    return {
      message: 'Job skill created successfully',
      data: skill,
    };
  }

  // PATCH /job-skills/:skillId — partial update of a JobSkill.
  @Patch('job-skills/:skillId')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  async update(
    @Param('skillId') skillId: string,
    @Body() updateJobSkillDto: UpdateJobSkillDto,
    @CurrentUser() currentUser: AuthUser,
  ) {
    const skill = await this.jobSkillsService.update(
      skillId,
      updateJobSkillDto,
      currentUser.organizationId,
    );

    return {
      message: 'Job skill updated successfully',
      data: skill,
    };
  }

  // DELETE /job-skills/:skillId — hard-deletes a JobSkill.
  @Delete('job-skills/:skillId')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  async remove(@Param('skillId') skillId: string, @CurrentUser() currentUser: AuthUser) {
    const result = await this.jobSkillsService.remove(skillId, currentUser.organizationId);

    return {
      message: 'Job skill deleted successfully',
      data: result,
    };
  }
}
