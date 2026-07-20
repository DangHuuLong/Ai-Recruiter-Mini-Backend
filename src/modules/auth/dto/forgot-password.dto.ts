// Body for POST /auth/forgot-password — target email to send a reset link to.
import { IsEmail, MaxLength } from 'class-validator';

export class ForgotPasswordDto {
  @IsEmail()
  @MaxLength(255)
  email!: string;
}
