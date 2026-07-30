// Body for PATCH /candidates/:id — all CreateCandidateDto fields made optional.
import { PartialType } from '@nestjs/mapped-types';

import { CreateCandidateDto } from './create-candidate.dto';

export class UpdateCandidateDto extends PartialType(CreateCandidateDto) {}
