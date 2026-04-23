import { HttpException, HttpStatus } from '@nestjs/common';

export class AppException extends HttpException {
  constructor(
    message: string,
    statusCode: number = HttpStatus.BAD_REQUEST,
    errors: any[] = [],
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