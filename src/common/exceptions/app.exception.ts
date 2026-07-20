// Application-level HttpException carrying a standardized {success, statusCode, message, errors} body.
import { HttpException, HttpStatus } from '@nestjs/common';

import { ErrorItem } from '../types/api-response.type';

export class AppException extends HttpException {
  // Builds the standardized error body; thrown from services/controllers and caught by HttpExceptionFilter.
  constructor(
    message: string,
    statusCode: number = HttpStatus.BAD_REQUEST,
    errors: ErrorItem[] = [],
  ) {
    super(
      {
        success: false,
        statusCode,
        message,
        errors,
      },
      statusCode,
    );
  }
}
