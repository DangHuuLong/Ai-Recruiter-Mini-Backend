// Read-side service for the AI Activity Feedback DEV dashboard — paginated list + single-record
// detail. Mirrors AiActivityLogService's read half; writing happens exclusively through
// AiActivityFeedbackService.
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AiActivityFeedbackQueryDto } from './dto/ai-activity-feedback-query.dto';
import { AppException } from '../../common/exceptions/app.exception';
import { PrismaService } from '../../database/prisma/prisma.service';

@Injectable()
export class AiActivityFeedbackReadService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: AiActivityFeedbackQueryDto) {
    const where: Prisma.AiActivityFeedbackWhereInput = {
      accuracy: query.accuracy,
      tier: query.tier,
      createdAt:
        query.from || query.to
          ? { gte: query.from ? new Date(query.from) : undefined, lte: query.to ? new Date(query.to) : undefined }
          : undefined,
    };

    const [data, total] = await Promise.all([
      this.prisma.aiActivityFeedback.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.aiActivityFeedback.count({ where }),
    ]);

    return {
      data,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findOne(id: string) {
    const feedback = await this.prisma.aiActivityFeedback.findUnique({ where: { id } });

    if (!feedback) {
      throw new AppException(`AI activity feedback ${id} not found`, 404);
    }

    return feedback;
  }
}
