import { IsEnum, IsObject, IsOptional, IsString } from 'class-validator';

import { ParseStatusEnum } from '../../../common/enums';

export class UpdateResumeDto {
  @IsOptional()
  @IsString()
  rawText?: string;

  @IsOptional()
  @IsObject()
  parsedData?: Record<string, unknown>;

  @IsOptional()
  @IsEnum(ParseStatusEnum)
  parseStatus?: ParseStatusEnum;

  @IsOptional()
  @IsString()
  parserVersion?: string;

  @IsOptional()
  @IsString()
  parsingError?: string;
}
