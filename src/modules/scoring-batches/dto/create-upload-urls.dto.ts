import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ValidateNested } from 'class-validator';

import { UploadUrlFileDto } from './upload-url-file.dto';

export class CreateUploadUrlsDto {
  @ValidateNested({ each: true })
  @Type(() => UploadUrlFileDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(2000)
  files!: UploadUrlFileDto[];
}
