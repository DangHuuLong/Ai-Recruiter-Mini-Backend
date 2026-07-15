import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ResumeTextInputDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  label?: string;

  @IsString()
  @MinLength(20)
  rawText!: string;
}
