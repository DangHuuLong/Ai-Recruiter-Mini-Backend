import { IsString } from 'class-validator';

export class CreateResumeDto {
  @IsString()
  candidateId!: string;

  @IsString()
  fileAssetId!: string;
}
