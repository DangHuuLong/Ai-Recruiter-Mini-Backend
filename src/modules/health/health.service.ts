import { Injectable } from '@nestjs/common';

@Injectable()
export class HealthService {
  check() {
    return {
      success: true,
      message: 'Backend is running',
    };
  }
}