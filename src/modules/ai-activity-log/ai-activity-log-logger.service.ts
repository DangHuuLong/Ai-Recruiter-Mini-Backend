// Writes 1 row to AiActivityLog per call to an AI-service function (parse resume/JD, score
// application), called from AiService right after each call settles. Never throws — a logging
// failure must never break the actual parse/score flow it's observing.
import { Injectable, Logger } from '@nestjs/common';
import { AiFunctionType, Prisma } from '@prisma/client';

import { redactPersonalBlock, redactPiiDeep } from '../../common/utils/pii-redaction.util';
import { ParsedResumeData } from '../../common/types/ai-service.types';
import { PrismaService } from '../../database/prisma/prisma.service';

export interface AiCallContext {
  tier: 'ENTERPRISE' | 'PUBLIC';
  organizationId?: string | null;
  batchId?: string | null;
  evaluationId?: string | null;
  resumeId?: string | null;
  jobDescriptionId?: string | null;
}

export interface LogAiCallParams {
  functionType: AiFunctionType;
  context: AiCallContext;
  input: unknown;
  latencyMs: number;
  output?: unknown;
  errorMessage?: string;
}

@Injectable()
export class AiActivityLoggerService {
  private readonly logger = new Logger(AiActivityLoggerService.name);

  constructor(private readonly prisma: PrismaService) {}

  async logCall(params: LogAiCallParams): Promise<void> {
    try {
      const isPublic = params.context.tier === 'PUBLIC';
      const input = isPublic ? this.redactForPublic(params.input) : params.input;
      const output =
        params.output === undefined
          ? null
          : isPublic
            ? this.redactForPublic(params.output)
            : params.output;

      await this.prisma.aiActivityLog.create({
        data: {
          functionType: params.functionType,
          tier: params.context.tier,
          status: params.errorMessage ? 'FAILED' : 'SUCCESS',
          organizationId: params.context.organizationId ?? null,
          batchId: params.context.batchId ?? null,
          evaluationId: params.context.evaluationId ?? null,
          resumeId: params.context.resumeId ?? null,
          jobDescriptionId: params.context.jobDescriptionId ?? null,
          input: input as Prisma.InputJsonValue,
          output: output === null ? Prisma.JsonNull : (output as Prisma.InputJsonValue),
          errorMessage: params.errorMessage ?? null,
          latencyMs: params.latencyMs,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to write AiActivityLog for ${params.functionType}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  // Applies deep contact-info redaction to any payload, plus the stronger personal-block
  // redaction on every `personal` object found anywhere in the tree — the exact path varies
  // by payload (ParseResumeResult.parsed_data.personal, ScoreApplicationRequest.resume.personal,
  // etc.), so this walks the whole structure rather than hard-coding each shape.
  private redactForPublic(value: unknown): unknown {
    return this.redactPersonalRecursively(redactPiiDeep(value));
  }

  private redactPersonalRecursively(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.redactPersonalRecursively(item));
    }

    if (value !== null && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const result: Record<string, unknown> = {};

      for (const [key, val] of Object.entries(record)) {
        if (key === 'personal' && val !== null && typeof val === 'object') {
          result[key] = redactPersonalBlock(val as ParsedResumeData['personal']);
        } else {
          result[key] = this.redactPersonalRecursively(val);
        }
      }

      return result;
    }

    return value;
  }
}
