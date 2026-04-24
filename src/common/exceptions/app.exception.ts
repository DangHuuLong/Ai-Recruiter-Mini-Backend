import { HttpException, HttpStatus } from '@nestjs/common';

import { ErrorItem } from '../types/api-response.type';

export class AppException extends HttpException {
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
