// @ads/db — Prisma client (PostgreSQL, driver adapter) va DB tiplari.
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

export * from './generated/prisma/client.js';
export { Prisma } from './generated/prisma/client.js';

export type DbClient = PrismaClient;
export type DbTx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

export interface CreateClientOptions {
  /** postgresql://user:pw@host:port/db */
  url: string;
  /** pool hajmi (default 10) */
  max?: number;
  log?: boolean;
}

/** Yangi Prisma client yaratadi (har rol uchun alohida: app_rw, app_portal, …). */
export function createDbClient(opts: CreateClientOptions): PrismaClient {
  const adapter = new PrismaPg({ connectionString: opts.url, max: opts.max ?? 10 });
  return new PrismaClient({ adapter, log: opts.log ? ['query', 'warn', 'error'] : ['warn', 'error'] });
}
