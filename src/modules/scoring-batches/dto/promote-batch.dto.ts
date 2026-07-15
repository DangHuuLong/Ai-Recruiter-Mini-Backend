import { Type } from 'class-transformer';
import { ArrayMinSize, ArrayMaxSize, IsOptional, IsString, ValidateNested } from 'class-validator';

export class PromoteItemDto {
  @IsString()
  resumeItemId!: string;

  @IsOptional()
  @IsString()
  jdItemId?: string;
}

export class PromoteBatchDto {
  @ValidateNested({ each: true })
  @Type(() => PromoteItemDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  items!: PromoteItemDto[];
}
