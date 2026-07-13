import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { CreateEvaluationDto } from './dto/create-evaluation.dto';
import { EvaluationQueryDto } from './dto/evaluation-query.dto';
import { EvaluationsService } from './evaluations.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthUser } from '../../common/types/auth-user.type';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class EvaluationsController {
  constructor(private readonly evaluationsService: EvaluationsService) {}

  @Post('evaluations')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  async create(
    @Body() createEvaluationDto: CreateEvaluationDto,
    @CurrentUser() currentUser: AuthUser,
  ) {
    const evaluation = await this.evaluationsService.create(
      createEvaluationDto,
      currentUser.id,
      currentUser.organizationId,
    );

    return {
      message: 'Evaluation created successfully',
      data: evaluation,
    };
  }

  @Get('evaluations')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER, UserRole.HIRING_MANAGER)
  async findAll(@Query() query: EvaluationQueryDto, @CurrentUser() currentUser: AuthUser) {
    const result = await this.evaluationsService.findAll(query, currentUser.organizationId);

    return {
      message: 'Evaluations fetched successfully',
      data: result.data,
      meta: result.meta,
    };
  }

  @Get('evaluations/:id')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER, UserRole.HIRING_MANAGER)
  async findOne(@Param('id') id: string, @CurrentUser() currentUser: AuthUser) {
    const evaluation = await this.evaluationsService.findOne(id, currentUser.organizationId);

    return {
      message: 'Evaluation fetched successfully',
      data: evaluation,
    };
  }

  @Get('applications/:id/evaluations')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER, UserRole.HIRING_MANAGER)
  async findByApplicationId(@Param('id') id: string, @CurrentUser() currentUser: AuthUser) {
    const evaluations = await this.evaluationsService.findByApplicationId(
      id,
      currentUser.organizationId,
    );

    return {
      message: 'Application evaluations fetched successfully',
      data: evaluations,
    };
  }

  @Get('evaluations/:id/breakdown')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER, UserRole.HIRING_MANAGER)
  async findBreakdown(@Param('id') id: string, @CurrentUser() currentUser: AuthUser) {
    const breakdown = await this.evaluationsService.findBreakdown(id, currentUser.organizationId);

    return {
      message: 'Evaluation breakdown fetched successfully',
      data: breakdown,
    };
  }

  @Get('evaluations/:id/skills')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER, UserRole.HIRING_MANAGER)
  async findSkills(@Param('id') id: string, @CurrentUser() currentUser: AuthUser) {
    const skills = await this.evaluationsService.findSkills(id, currentUser.organizationId);

    return {
      message: 'Evaluation skills fetched successfully',
      data: skills,
    };
  }

  @Get('evaluations/:id/interview-questions')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER, UserRole.HIRING_MANAGER)
  async findInterviewQuestions(@Param('id') id: string, @CurrentUser() currentUser: AuthUser) {
    const questions = await this.evaluationsService.findInterviewQuestions(
      id,
      currentUser.organizationId,
    );

    return {
      message: 'Evaluation interview questions fetched successfully',
      data: questions,
    };
  }

  @Get('evaluations/:id/evidence')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER, UserRole.HIRING_MANAGER)
  async findEvidence(@Param('id') id: string, @CurrentUser() currentUser: AuthUser) {
    const evidence = await this.evaluationsService.findEvidence(id, currentUser.organizationId);

    return {
      message: 'Evaluation evidence fetched successfully',
      data: evidence,
    };
  }

  @Post('evaluations/:id/retry')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  async retry(@Param('id') id: string, @CurrentUser() currentUser: AuthUser) {
    const evaluation = await this.evaluationsService.retry(
      id,
      currentUser.id,
      currentUser.organizationId,
    );

    return {
      message: 'Evaluation retry completed successfully',
      data: evaluation,
    };
  }
}
