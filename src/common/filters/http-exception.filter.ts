import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

type ErrorItem = {
  field: string | null;
  message: string;
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  constructor(private readonly nodeEnv = 'development') { }

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errors: ErrorItem[] = [];

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else {
        const responseBody = exceptionResponse as {
          message?: string | string[];
          errors?: ErrorItem[];
        };

        if (Array.isArray(responseBody.message)) {
          message = 'Validation failed';
          errors = responseBody.message.map((item) => ({
            field: null,
            message: item,
          }));
        } else {
          message = responseBody.message ?? message;
          errors = Array.isArray(responseBody.errors) ? responseBody.errors : [];
        }
      }
    } else {
      this.logger.error(
        exception instanceof Error ? exception.message : 'Unknown error',
        exception instanceof Error ? exception.stack : undefined,
      );

      if (this.nodeEnv !== 'production' && exception instanceof Error) {
        message = exception.message;
      }
    }

    response.status(statusCode).json({
      success: false,
      statusCode,
      message,
      errors,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}