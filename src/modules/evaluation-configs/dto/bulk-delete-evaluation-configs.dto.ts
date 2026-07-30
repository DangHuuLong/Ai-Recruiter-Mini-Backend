// Body for POST /evaluation-configs/bulk-delete — a bounded array of evaluation config ids.
import { ArrayMaxSize, ArrayMinSize, IsString } from 'class-validator';

export class BulkDeleteEvaluationConfigsDto {
  @IsString({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  ids!: string[];
}
