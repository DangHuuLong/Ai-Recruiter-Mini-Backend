import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { CreateUserDto } from './dto/create-user.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { UsersService } from './users.service';
import { AuthTokenService } from '../auth/auth-token.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthUser } from '../../common/types/auth-user.type';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly authTokenService: AuthTokenService,
  ) {}

  @Post()
  async create(@Body() createUserDto: CreateUserDto, @CurrentUser() currentUser: AuthUser) {
    const user = await this.usersService.create(createUserDto, currentUser.organizationId);
    await this.authTokenService.issueEmailVerificationToken(user.id, user.email, user.fullName);

    return {
      message: 'User created successfully. A verification email has been sent.',
      data: user,
    };
  }

  @Get()
  async findAll(@Query() query: UserQueryDto, @CurrentUser() currentUser: AuthUser) {
    const result = await this.usersService.findAll(query, currentUser.organizationId);

    return {
      message: 'Users fetched successfully',
      data: result.data,
      meta: result.meta,
    };
  }
}
