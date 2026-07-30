// Injectable Prisma client wired to the pg adapter, connecting/disconnecting with the module lifecycle.
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  // Builds the pg connection adapter from config and passes it to the underlying PrismaClient.
  constructor(private readonly configService: ConfigService) {
    const adapter = new PrismaPg({
      connectionString: configService.getOrThrow<string>('database.url'),
    });

    super({ adapter });
  }

  // Nest lifecycle hook; opens the DB connection when the app module starts.
  async onModuleInit() {
    await this.$connect();
  }

  // Nest lifecycle hook; closes the DB connection cleanly on app shutdown.
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
