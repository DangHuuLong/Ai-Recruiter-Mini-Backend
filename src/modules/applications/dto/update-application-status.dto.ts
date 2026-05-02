import { IsEnum, IsOptional, IsString } from 'class-validator';

import { ApplicationStatusEnum } from '../../../common/enums';

export class UpdateApplicationStatusDto {
  @IsEnum(ApplicationStatusEnum)
  status!: ApplicationStatusEnum;

  @IsOptional()
  @IsString()
  note?: string;
}
