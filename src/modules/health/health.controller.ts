// Exposes GET /health for liveness/readiness checks.
import { Controller, Get } from '@nestjs/common';

import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  // GET /health — delegates to HealthService.check for the liveness/readiness probe used by orchestration.
  @Get()
  check() {
    return this.healthService.check();
  }
}
