import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AppException } from '../exceptions/app.exception';
import { AuthUser } from '../types/auth-user.type';
import { verifyJwt } from '../utils/jwt.util';
import { PrismaService } from '../../database/prisma/prisma.service';

type RequestWithUser = {
  headers: {
    authorization?: string;
  };
  user?: AuthUser;
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = this.extractBearerToken(request.headers.authorization);

    if (!token) {
      throw new AppException('Authentication required', 401);
    }

    const secret = this.configService.getOrThrow<string>('JWT_SECRET');
    const payload = verifyJwt(token, secret);

    if (!payload) {
      throw new AppException('Invalid or expired token', 401);
    }

    const user = await this.prisma.user.findFirst({
      where: {
        id: payload.sub,
        isActive: true,
      },
      select: {
        id: true,
        organizationId: true,
        email: true,
        fullName: true,
        role: true,
        emailVerifiedAt: true,
      },
    });

    if (!user) {
      throw new AppException('User is inactive or no longer exists', 401);
    }

    if (!user.emailVerifiedAt) {
      throw new AppException('Email not verified', 403);
    }

    request.user = {
      id: user.id,
      organizationId: user.organizationId,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
    };
    return true;
  }

  private extractBearerToken(authorization: string | undefined): string | null {
    if (!authorization) {
      return null;
    }

    const [type, token] = authorization.split(' ');

    if (type !== 'Bearer' || !token) {
      return null;
    }

    return token;
  }
}
