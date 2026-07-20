// Initializes a shared ioredis client from REDIS_URL and exposes basic key ops.
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { AppException } from 'src/common/exceptions/app.exception';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis | null = null;

  constructor(private readonly configService: ConfigService) {}

  // Nest lifecycle hook: connects the ioredis client at app bootstrap if REDIS_URL is set.
  async onModuleInit() {
    const redisUrl = this.configService.get<string>('redis.url');

    if (!redisUrl) {
      return;
    }

    this.client = new Redis(redisUrl);
    await this.client.ping();
  }

  // Nest lifecycle hook: closes the ioredis client cleanly on app shutdown.
  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();
    }
  }

  // Returns the underlying ioredis client, or throws if onModuleInit hasn't connected it yet; used by every method below.
  getClient(): Redis {
    if (!this.client) {
      throw new AppException('Redis client is not initialized', 500);
    }

    return this.client;
  }

  // Generic SET with optional TTL; used across batch/rate-limit/token-store code that needs Redis-backed state.
  async set(key: string, value: string, ttlSeconds?: number) {
    const client = this.getClient();

    if (ttlSeconds) {
      await client.set(key, value, 'EX', ttlSeconds);
      return;
    }

    await client.set(key, value);
  }

  // Generic GET counterpart to set(); used wherever Redis-backed state is read back.
  async get(key: string) {
    const client = this.getClient();
    return client.get(key);
  }

  // Generic DEL counterpart to set()/get(); used to clear tokens/batch state once consumed.
  async delete(key: string) {
    const client = this.getClient();
    await client.del(key);
  }

  // Lets callers check Redis availability before relying on it, without triggering the throw in getClient().
  isEnabled(): boolean {
    return this.client !== null;
  }

  // Used by health.service.ts to verify the Redis connection is alive.
  async ping(): Promise<string> {
    const client = this.getClient();
    return client.ping();
  }
}
