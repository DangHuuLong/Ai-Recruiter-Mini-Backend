import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';

import { AppException } from '../../common/exceptions/app.exception';
import {
  AiHealthData,
  AiServiceResponse,
  EvaluationResult,
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

  async checkHealth(): Promise<AiHealthData> {
    return this.request<AiHealthData>('GET /health', async () => {
      const response = await firstValueFrom(
        this.httpService.get<AiServiceResponse<AiHealthData>>('/health'),
      );

      return this.extractData(response.data, 'Invalid AI health response');
    });
  }

  async parseResume(payload: ParseResumeRequest): Promise<ParseResumeResult> {
    return this.request<ParseResumeResult>('POST /parse/resume', async () => {
      const response = await firstValueFrom(
        this.httpService.post<AiServiceResponse<ParseResumeResult>>('/parse/resume', payload),
      );

      return this.extractData(response.data, 'Invalid AI parse resume response');
    });
  }

  async parseJobDescription(rawText: string): Promise<ParsedJobDescriptionData> {
    return this.request<ParsedJobDescriptionData>('POST /parse/job-description', async () => {
      const response = await firstValueFrom(
        this.httpService.post<AiServiceResponse<ParsedJobDescriptionData>>(
          '/parse/job-description',
          {
            raw_text: rawText,
          },
        ),
      );

      return this.extractData(response.data, 'Invalid AI parse job description response');
    });
  }

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

  private async request<T>(operation: string, handler: () => Promise<T>): Promise<T> {
    try {
      return await handler();
    } catch (error) {
      this.logger.error(`AI service request failed: ${operation}`);

      throw this.mapAiServiceError(error);
    }
  }

  private extractData<T>(response: AiServiceResponse<T>, invalidResponseMessage: string): T {
    if (!response || response.success !== true || response.data === undefined) {
      throw new AppException(invalidResponseMessage, 502);
    }

    return response.data;
  }

  private mapAiServiceError(error: unknown): AppException {
    const axiosError = error as AxiosError<{
      success?: boolean;
      message?: string;
      errors?: unknown[];
    }>;

    if (axiosError.code === 'ECONNABORTED') {
      return new AppException('AI service request timeout', 504);
    }

    if (axiosError.response) {
      const message = axiosError.response.data?.message || 'AI service returned an error';

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
}
