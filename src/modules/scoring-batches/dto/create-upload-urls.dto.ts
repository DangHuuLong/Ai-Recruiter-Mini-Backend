// Body for requesting pre-signed upload URLs for a batch of files.
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsIn, ValidateNested } from 'class-validator';

import { UploadUrlFileDto } from './upload-url-file.dto';

export class CreateUploadUrlsDto {
  // Which per-tier count limit to validate `files.length` against (resumes vs job
  // descriptions have different caps — see ScoringBatchesService/PublicBatchesService).
  @IsIn(['RESUME', 'JOB_DESCRIPTION'])
  kind!: 'RESUME' | 'JOB_DESCRIPTION';

  @ValidateNested({ each: true })
  @Type(() => UploadUrlFileDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(2000)
  files!: UploadUrlFileDto[];
}
