import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type DbTx } from '@ads/db';
import { env } from '../config/env.js';

/** app_rw roli bilan ulanish (xodimlar API va worker). */
@Injectable()
export class Db extends PrismaClient implements OnModuleDestroy {
  constructor() {
    super({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL, max: 20 }), log: ['warn', 'error'] });
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}

/** app_portal roli bilan ulanish — RLS ostida; har so'rov tranzaksiyada app.client_id bilan. */
@Injectable()
export class PortalDb implements OnModuleDestroy {
  private readonly client = new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DATABASE_URL_PORTAL, max: 10 }),
    log: ['warn', 'error'],
  });
  /** fn ichidagi barcha so'rovlar faqat shu mijoz ma'lumotlarini ko'radi (PostgreSQL RLS). */
  forClient<T>(clientId: string, fn: (tx: DbTx) => Promise<T>): Promise<T> {
    return this.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.client_id', ${clientId}, true)`;
      return fn(tx);
    });
  }
  async onModuleDestroy() {
    await this.client.$disconnect();
  }
}

export type DbOrTx = Db | DbTx;
export type { DbTx };
