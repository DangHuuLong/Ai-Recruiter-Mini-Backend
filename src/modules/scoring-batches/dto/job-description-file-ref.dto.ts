import { IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class JobDescriptionFileRefDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  label?: string;

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
