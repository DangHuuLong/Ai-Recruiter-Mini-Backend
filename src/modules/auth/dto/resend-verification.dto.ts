// Body for POST /auth/resend-verification — target email to resend the verification link to.
import { IsEmail, MaxLength } from 'class-validator';

export class ResendVerificationDto {
  @IsEmail()
  @MaxLength(255)
  email!: string;
}
