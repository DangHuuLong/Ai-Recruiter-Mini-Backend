// Body for POST /job-descriptions/bulk-deactivate — a bounded array of job description ids.
import { ArrayMaxSize, ArrayMinSize, IsString } from 'class-validator';

export class BulkDeactivateJobDescriptionsDto {
  @IsString({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  ids!: string[];
}
