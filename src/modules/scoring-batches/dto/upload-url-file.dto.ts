// Describes a single file (name, type, size, checksum) requesting a pre-signed upload URL.
import { IsInt, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class UploadUrlFileDto {
  @IsString()
  @MaxLength(255)
  fileName!: string;

  @IsString()
  mimeType!: string;

  @IsInt()
  @Min(1)
  sizeBytes!: number;

  @IsString()
  @MinLength(32)
  @MaxLength(128)
  checksum!: string;
}
