// Marks a route handler for rate limiting via one of the *RateLimitGuard classes.
import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rateLimit';

export interface RateLimitOptions {
  action: string;
  envVar: string;
  defaultMax: number;
}

// Decorator applied to handlers; read by the *RateLimitGuard classes to enforce per-action limits.
export const RateLimit = (options: RateLimitOptions) => SetMetadata(RATE_LIMIT_KEY, options);
