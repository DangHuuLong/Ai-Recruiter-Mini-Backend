// Controller for /evaluations and /applications/:id/evaluations — create, list, retry, and view evaluation details.
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

  // POST /evaluations — kicks off AI scoring of an application against a config and persists the result.
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

  // GET /evaluations — paginated, filtered, searchable list of evaluations in the org.
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

  // GET /evaluations/:id — fetches a single evaluation with its full related data.
  @Get('evaluations/:id')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER, UserRole.HIRING_MANAGER)
  async findOne(@Param('id') id: string, @CurrentUser() currentUser: AuthUser) {
    const evaluation = await this.evaluationsService.findOne(id, currentUser.organizationId);

    return {
      message: 'Evaluation fetched successfully',
      data: evaluation,
    };
  }

  // GET /applications/:id/evaluations — lists all evaluations run against a given application.
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

  // GET /evaluations/:id/breakdown — returns the per-criterion scores that make up the overall score.
  @Get('evaluations/:id/breakdown')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER, UserRole.HIRING_MANAGER)
  async findBreakdown(@Param('id') id: string, @CurrentUser() currentUser: AuthUser) {
    const breakdown = await this.evaluationsService.findBreakdown(id, currentUser.organizationId);

    return {
      message: 'Evaluation breakdown fetched successfully',
      data: breakdown,
    };
  }

  // GET /evaluations/:id/skills — returns matched/missing skills detected during scoring.
  @Get('evaluations/:id/skills')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER, UserRole.HIRING_MANAGER)
  async findSkills(@Param('id') id: string, @CurrentUser() currentUser: AuthUser) {
    const skills = await this.evaluationsService.findSkills(id, currentUser.organizationId);

    return {
      message: 'Evaluation skills fetched successfully',
      data: skills,
    };
  }

  // GET /evaluations/:id/interview-questions — returns the interview questions generated for this evaluation.
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

  // GET /evaluations/:id/evidence — returns the supporting evidence map behind the scores and skills.
  @Get('evaluations/:id/evidence')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER, UserRole.HIRING_MANAGER)
  async findEvidence(@Param('id') id: string, @CurrentUser() currentUser: AuthUser) {
    const evidence = await this.evaluationsService.findEvidence(id, currentUser.organizationId);

    return {
      message: 'Evaluation evidence fetched successfully',
      data: evidence,
    };
  }

  // POST /evaluations/:id/retry — re-runs AI scoring for a failed/completed evaluation, clearing prior results first.
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
