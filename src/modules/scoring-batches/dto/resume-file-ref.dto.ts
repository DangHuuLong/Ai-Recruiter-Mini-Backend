// Reference to an already-uploaded resume file to include in a scoring batch.
import { IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class ResumeFileRefDto {
  @IsString()
  fileKey!: string;

  @IsString()
  @MaxLength(255)
  fileName!: string;

  @IsString()
  mimeType!: string;

  @IsInt()
  @Min(1)
  sizeBytes!: number;

  @IsOptional()
  @IsString()
  @MinLength(32)
  @MaxLength(128)
  checksum?: string;
}
