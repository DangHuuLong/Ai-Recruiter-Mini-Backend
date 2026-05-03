import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';

import { CreateEvaluationDto } from './dto/create-evaluation.dto';
import { EvaluationQueryDto } from './dto/evaluation-query.dto';
import { EvaluationsService } from './evaluations.service';

@Controller()
export class EvaluationsController {
  constructor(private readonly evaluationsService: EvaluationsService) {}

  @Post('evaluations')
  async create(@Body() createEvaluationDto: CreateEvaluationDto) {
    const evaluation = await this.evaluationsService.create(createEvaluationDto);

    return {
      message: 'Evaluation created successfully',
      data: evaluation,
    };
  }

  @Get('evaluations')
  async findAll(@Query() query: EvaluationQueryDto) {
    const result = await this.evaluationsService.findAll(query);

    return {
      message: 'Evaluations fetched successfully',
      data: result.data,
      meta: result.meta,
    };
  }

  @Get('evaluations/:id')
  async findOne(@Param('id') id: string) {
    const evaluation = await this.evaluationsService.findOne(id);

    return {
      message: 'Evaluation fetched successfully',
      data: evaluation,
    };
  }

  @Get('applications/:id/evaluations')
  async findByApplicationId(@Param('id') id: string) {
    const evaluations = await this.evaluationsService.findByApplicationId(id);

    return {
      message: 'Application evaluations fetched successfully',
      data: evaluations,
    };
  }

  @Get('evaluations/:id/breakdown')
  async findBreakdown(@Param('id') id: string) {
    const breakdown = await this.evaluationsService.findBreakdown(id);

    return {
      message: 'Evaluation breakdown fetched successfully',
      data: breakdown,
    };
  }

  @Get('evaluations/:id/skills')
  async findSkills(@Param('id') id: string) {
    const skills = await this.evaluationsService.findSkills(id);

    return {
      message: 'Evaluation skills fetched successfully',
      data: skills,
    };
  }

  @Get('evaluations/:id/interview-questions')
  async findInterviewQuestions(@Param('id') id: string) {
    const questions = await this.evaluationsService.findInterviewQuestions(id);

    return {
      message: 'Evaluation interview questions fetched successfully',
      data: questions,
    };
  }

  @Get('evaluations/:id/evidence')
  async findEvidence(@Param('id') id: string) {
    const evidence = await this.evaluationsService.findEvidence(id);

    return {
      message: 'Evaluation evidence fetched successfully',
      data: evidence,
    };
  }

  @Post('evaluations/:id/retry')
  async retry(@Param('id') id: string) {
    const evaluation = await this.evaluationsService.retry(id);

    return {
      message: 'Evaluation retry completed successfully',
      data: evaluation,
    };
  }
}
