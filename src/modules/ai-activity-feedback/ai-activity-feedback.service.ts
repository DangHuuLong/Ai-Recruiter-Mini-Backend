// Write-side service for AiActivityFeedback, shared by both submission endpoints. Unlike
// AiActivityLoggerService (which never throws — it's an internal side-effect the caller doesn't
// wait on), this writes in direct response to a user action, so failures must surface to the client.
import { Injectable } from '@nestjs/common';

import { CreateEvaluationFeedbackDto } from './dto/create-evaluation-feedback.dto';
import { CreatePublicFeedbackDto } from './dto/create-public-feedback.dto';
import { AppException } from '../../common/exceptions/app.exception';
import { PrismaService } from '../../database/prisma/prisma.service';

@Injectable()
export class AiActivityFeedbackService {
  constructor(private readonly prisma: PrismaService) {}

  async submitEvaluationFeedback(
    evaluationId: string,
    organizationId: string,
    dto: CreateEvaluationFeedbackDto,
  ) {
    this.assertReasonsPresentWhenNotAccurate(dto);

    return this.prisma.aiActivityFeedback.create({
      data: {
        tier: 'ENTERPRISE',
        accuracy: dto.accuracy,
        reasons: dto.reasons ?? [],
        speed: dto.speed,
        comment: dto.comment ?? null,
        organizationId,
        evaluationId,
      },
    });
  }

  async submitPublicFeedback(dto: CreatePublicFeedbackDto) {
    this.assertReasonsPresentWhenNotAccurate(dto);

    return this.prisma.aiActivityFeedback.create({
      data: {
        tier: 'PUBLIC',
        accuracy: dto.accuracy,
        reasons: dto.reasons ?? [],
        speed: dto.speed,
        comment: dto.comment ?? null,
        batchId: dto.batchId,
        resumeId: dto.resumeItemId,
        jobDescriptionId: dto.jdItemId,
      },
    });
  }

  // class-validator can't express "reasons required unless accuracy === ACCURATE" declaratively.
  private assertReasonsPresentWhenNotAccurate(dto: { accuracy: string; reasons?: string[] }) {
    if (dto.accuracy !== 'ACCURATE' && (!dto.reasons || dto.reasons.length === 0)) {
      throw new AppException('At least one reason is required when accuracy is not ACCURATE', 400);
    }
  }
}
