import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { AppException } from 'src/common/exceptions/app.exception';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis | null = null;

  constructor(private readonly configService: ConfigService) { }

  async onModuleInit() {
    const redisUrl = this.configService.get<string>('redis.url');

    if (!redisUrl) {
      return;
    }

    this.client = new Redis(redisUrl);
    await this.client.ping();
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();
    }
  }

  getClient(): Redis {
    if (!this.client) {
      throw new AppException('Redis client is not initialized', 500);
    }

    return this.client;
  }

  async set(key: string, value: string, ttlSeconds?: number) {
    const client = this.getClient();

    if (ttlSeconds) {
      await client.set(key, value, 'EX', ttlSeconds);
      return;
    }

    await client.set(key, value);
  }

  async get(key: string) {
    const client = this.getClient();
    return client.get(key);
  }

  async delete(key: string) {
    const client = this.getClient();
    await client.del(key);
  }
}