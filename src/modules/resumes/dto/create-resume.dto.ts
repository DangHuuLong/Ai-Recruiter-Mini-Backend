// Body for POST /resumes — links an existing file asset to a candidate as a new resume.
import { IsString } from 'class-validator';

export class CreateResumeDto {
  @IsString()
  candidateId!: string;

  @IsString()
  fileAssetId!: string;
}
