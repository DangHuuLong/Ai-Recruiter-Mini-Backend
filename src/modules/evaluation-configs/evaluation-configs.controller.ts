import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { CreateEvaluationConfigDto } from './dto/create-evaluation-config.dto';
import { EvaluationConfigQueryDto } from './dto/evaluation-config-query.dto';
import { UpdateEvaluationConfigDto } from './dto/update-evaluation-config.dto';
import { EvaluationConfigsService } from './evaluation-configs.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthUser } from '../../common/types/auth-user.type';

@Controller('evaluation-configs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EvaluationConfigsController {
  constructor(private readonly evaluationConfigsService: EvaluationConfigsService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  async create(@Body() createDto: CreateEvaluationConfigDto, @CurrentUser() currentUser: AuthUser) {
    const config = await this.evaluationConfigsService.create(
      createDto,
      currentUser.organizationId,
      currentUser.id,
    );

    return {
      message: 'Evaluation config created successfully',
      data: config,
    };
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.RECRUITER, UserRole.HIRING_MANAGER)
  async findAll(@Query() query: EvaluationConfigQueryDto, @CurrentUser() currentUser: AuthUser) {
    const result = await this.evaluationConfigsService.findAll(query, currentUser.organizationId);

    return {
      message: 'Evaluation configs fetched successfully',
      data: result.data,
      meta: result.meta,
    };
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER, UserRole.HIRING_MANAGER)
  async findOne(@Param('id') id: string, @CurrentUser() currentUser: AuthUser) {
    const config = await this.evaluationConfigsService.findOne(id, currentUser.organizationId);

    return {
      message: 'Evaluation config fetched successfully',
      data: config,
    };
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  async update(
    @Param('id') id: string,
    @Body() updateDto: UpdateEvaluationConfigDto,
    @CurrentUser() currentUser: AuthUser,
  ) {
    const config = await this.evaluationConfigsService.update(id, updateDto, currentUser.organizationId);

    return {
      message: 'Evaluation config updated successfully',
      data: config,
    };
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  async remove(@Param('id') id: string, @CurrentUser() currentUser: AuthUser) {
    const result = await this.evaluationConfigsService.remove(id, currentUser.organizationId);

    return {
      message: 'Evaluation config deleted successfully',
      data: result,
    };
  }
}
