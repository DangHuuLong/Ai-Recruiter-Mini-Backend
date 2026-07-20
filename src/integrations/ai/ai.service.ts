// HTTP client for the Python AI service: health, resume/JD parsing, application scoring.
import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';

import { AppException } from '../../common/exceptions/app.exception';
import {
  AiHealthData,
  AiServiceResponse,
  EvaluationResult,
  ParseJobDescriptionRequest,
  ParseResumeRequest,
  ParseResumeResult,
  ParsedJobDescriptionData,
  ParsedResumeData,
  ScoreApplicationRequest,
  ScoreCriterionConfig,
} from '../../common/types/ai-service.types';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(private readonly httpService: HttpService) {}

  // Pings the Python AI service's /health endpoint; used for readiness/status checks.
  async checkHealth(): Promise<AiHealthData> {
    return this.request<AiHealthData>('GET /health', async () => {
      const response = await firstValueFrom(
        this.httpService.get<AiServiceResponse<AiHealthData>>('/health'),
      );

      return this.extractData(response.data, 'Invalid AI health response');
    });
  }

  // Called by resume-parse.processor.ts (BullMQ handler) and resumes.service.ts to extract structured data from resume text.
  async parseResume(payload: ParseResumeRequest): Promise<ParseResumeResult> {
    return this.request<ParseResumeResult>('POST /parse/resume', async () => {
      const response = await firstValueFrom(
        this.httpService.post<AiServiceResponse<ParseResumeResult>>('/parse/resume', payload),
      );

      return this.extractData(response.data, 'Invalid AI parse resume response');
    });
  }

  // Called by jd-parse.processor.ts (BullMQ handler) and job-descriptions.service.ts to extract structured data from a job description.
  async parseJobDescription(payload: ParseJobDescriptionRequest): Promise<ParsedJobDescriptionData> {
    return this.request<ParsedJobDescriptionData>('POST /parse/job-description', async () => {
      const response = await firstValueFrom(
        this.httpService.post<AiServiceResponse<ParsedJobDescriptionData>>(
          '/parse/job-description',
          payload,
        ),
      );

      return this.extractData(response.data, 'Invalid AI parse job description response');
    });
  }

  // Called by score-pair.processor.ts (BullMQ handler) and evaluations.service.ts to score a resume against a job description.
  async scoreApplication(
    resume: ParsedResumeData,
    jobDescription: ParsedJobDescriptionData,
    criteria: ScoreCriterionConfig[],
  ): Promise<EvaluationResult> {
    const payload: ScoreApplicationRequest = {
      resume,
      job_description: jobDescription,
      config: {
        criteria,
      },
    };

    return this.request<EvaluationResult>('POST /score/application', async () => {
      const response = await firstValueFrom(
        this.httpService.post<AiServiceResponse<EvaluationResult>>('/score/application', payload),
      );

      return this.extractData(response.data, 'Invalid AI score application response');
    });
  }

  // Shared wrapper used by all public methods above to log failures and translate them via mapAiServiceError.
  private async request<T>(operation: string, handler: () => Promise<T>): Promise<T> {
    try {
      return await handler();
    } catch (error) {
      this.logger.error(`AI service request failed: ${operation}`);

      throw this.mapAiServiceError(error);
    }
  }

  // Unwraps the AI service's success/data envelope; used inside each request() handler above.
  private extractData<T>(response: AiServiceResponse<T>, invalidResponseMessage: string): T {
    if (!response || response.success !== true || response.data === undefined) {
      throw new AppException(invalidResponseMessage, 502);
    }

    return response.data;
  }

  // Translates axios/network errors from the AI service into an AppException; invoked from request()'s catch block.
  private mapAiServiceError(error: unknown): AppException {
    const axiosError = error as AxiosError<{
      success?: boolean;
      message?: string;
      errors?: unknown[];
      detail?: string | Array<{ msg?: string }>;
    }>;

    if (axiosError.code === 'ECONNABORTED') {
      return new AppException('AI service request timeout', 504);
    }

    if (axiosError.response) {
      const message = axiosError.response.data?.message || this.extractDetailMessage(axiosError.response.data?.detail) || 'AI service returned an error';

      return new AppException(message, 502);
    }

    if (axiosError.request) {
      return new AppException('AI service is unavailable', 502);
    }

    if (error instanceof AppException) {
      return error;
    }

    return new AppException('Unexpected AI service error', 502);
  }

  // Flattens FastAPI validation error `detail` payloads into a single message; used by mapAiServiceError.
  private extractDetailMessage(detail: string | Array<{ msg?: string }> | undefined): string | null {
    if (typeof detail === 'string') {
      return detail;
    }

    if (Array.isArray(detail) && detail.length > 0) {
      return detail.map((item) => item.msg).filter(Boolean).join('; ') || null;
    }

    return null;
  }
}
