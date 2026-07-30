// Body for PATCH /applications/:id — editable source and notes fields.
import { IsOptional, IsString } from 'class-validator';

export class UpdateApplicationDto {
  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
