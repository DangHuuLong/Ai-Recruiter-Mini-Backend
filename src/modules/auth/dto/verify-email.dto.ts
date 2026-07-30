// Body for POST /auth/verify-email — email verification token.
import { IsString, MinLength } from 'class-validator';

export class VerifyEmailDto {
  @IsString()
  @MinLength(10)
  token!: string;
}
