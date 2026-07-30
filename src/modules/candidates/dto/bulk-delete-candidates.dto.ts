// Body for POST /candidates/bulk-delete — a bounded array of candidate ids.
import { ArrayMaxSize, ArrayMinSize, IsString } from 'class-validator';

export class BulkDeleteCandidatesDto {
  @IsString({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  ids!: string[];
}
