import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { LoginDto } from './dto/login.dto';
import { AppException } from '../../common/exceptions/app.exception';
import { signJwt } from '../../common/utils/jwt.util';
import { verifyPassword } from '../../common/utils/password.util';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {}

  async login(loginDto: LoginDto) {
    const user = await this.usersService.findActiveByEmail(loginDto.email);

    if (!user) {
      throw new AppException('Invalid email or password', 401);
    }

    const isPasswordValid = await verifyPassword(loginDto.password, user.passwordHash);

    if (!isPasswordValid) {
      throw new AppException('Invalid email or password', 401);
    }

    const secret = this.configService.getOrThrow<string>('JWT_SECRET');
    const expiresInSeconds = this.configService.get<number>('JWT_EXPIRES_IN_SECONDS') ?? 86400;

    const accessToken = signJwt(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
      },
      secret,
      expiresInSeconds,
    );

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: expiresInSeconds,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
    };
  }
}
