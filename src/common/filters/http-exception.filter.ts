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

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttpException = exception instanceof HttpException;

    if (!isHttpException) {
      this.logger.error(
        `[Unhandled Exception] ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const statusCode = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse = isHttpException ? exception.getResponse() : null;

    let message = 'Internal server error';
    let errors: ErrorItem[] = [];

    if (typeof exceptionResponse === 'string') {
      message = exceptionResponse;
    } else if (exceptionResponse && typeof exceptionResponse === 'object') {
      const responseObject = exceptionResponse as Record<string, unknown>;

      if (typeof responseObject.message === 'string') {
        message = responseObject.message;
      }

      if (Array.isArray(responseObject.message)) {
        message = 'Validation failed';
        errors = responseObject.message.map((item) => ({
          field: null,
          message: String(item),
        }));
      }

      if (typeof responseObject.error === 'string' && errors.length === 0) {
        message = responseObject.error;
      }

      if (Array.isArray(responseObject.errors)) {
        errors = responseObject.errors.map((item) => {
          if (item && typeof item === 'object') {
            const errorItem = item as Record<string, unknown>;

            return {
              field:
                typeof errorItem.field === 'string' ? errorItem.field : null,
              message: String(errorItem.message ?? 'Unknown error'),
            };
          }

          return {
            field: null,
            message: String(item),
          };
        });
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