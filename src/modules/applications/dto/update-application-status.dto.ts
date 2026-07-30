// Body for PATCH /applications/:id/status — new status plus an optional note.
import { IsEnum, IsOptional, IsString } from 'class-validator';

import { ApplicationStatusEnum } from '../../../common/enums';

export class UpdateApplicationStatusDto {
  @IsEnum(ApplicationStatusEnum)
  status!: ApplicationStatusEnum;

  @IsOptional()
  @IsString()
  note?: string;
}
