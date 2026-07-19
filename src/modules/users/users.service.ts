import { Injectable } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';

import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { AppException } from '../../common/exceptions/app.exception';
import { hashPassword } from '../../common/utils/password.util';
import { PrismaService } from '../../database/prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createUserDto: CreateUserDto, organizationId: string) {
    const email = createUserDto.email.toLowerCase().trim();

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingUser) {
      throw new AppException('Email already exists', 409);
    }

    const passwordHash = await hashPassword(createUserDto.password);

    return this.prisma.user.create({
      data: {
        organizationId,
        email,
        passwordHash,
        fullName: createUserDto.fullName,
        role: createUserDto.role ?? UserRole.RECRUITER,
      },
      select: this.getUserSelect(),
    });
  }

  async findAll(query: UserQueryDto, organizationId: string) {
    const page = query.page;
    const limit = query.limit;
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {
      organizationId,
      ...(query.role ? { role: query.role } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.search
        ? {
            OR: [
              { email: { contains: query.search, mode: 'insensitive' } },
              { fullName: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [query.sortBy]: query.sortOrder },
        select: this.getUserSelect(),
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async update(id: string, dto: UpdateUserDto, organizationId: string, currentUserId: string) {
    const target = await this.prisma.user.findFirst({
      where: { id, organizationId },
      select: { id: true, role: true },
    });

    if (!target) {
      throw new AppException('User not found', 404);
    }

    if (id === currentUserId && (dto.role !== undefined || dto.isActive === false)) {
      throw new AppException('Cannot change your own role or deactivate your own account', 400);
    }

    const removesAnAdmin =
      target.role === UserRole.ADMIN &&
      ((dto.role !== undefined && dto.role !== UserRole.ADMIN) || dto.isActive === false);

    if (removesAnAdmin) {
      const otherActiveAdmins = await this.prisma.user.count({
        where: { organizationId, role: UserRole.ADMIN, isActive: true, id: { not: id } },
      });

      if (otherActiveAdmins === 0) {
        throw new AppException('Cannot remove the last active admin of the organization', 409);
      }
    }

    return this.prisma.user.update({
      where: { id },
      data: dto,
      select: this.getUserSelect(),
    });
  }

  async findActiveByEmail(email: string) {
    return this.prisma.user.findFirst({
      where: {
        email: email.toLowerCase().trim(),
        isActive: true,
      },
      select: {
        id: true,
        organizationId: true,
        email: true,
        passwordHash: true,
        fullName: true,
        role: true,
        isActive: true,
        emailVerifiedAt: true,
      },
    });
  }

  private getUserSelect(): Prisma.UserSelect {
    return {
      id: true,
      organizationId: true,
      email: true,
      fullName: true,
      role: true,
      isActive: true,
      emailVerifiedAt: true,
      createdAt: true,
      updatedAt: true,
    };
  }
}
