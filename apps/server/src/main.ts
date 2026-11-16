import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { env, isProd, mfaEnforced } from './config/env.js';
import { requestContext, SYSTEM_ACTOR } from './platform/context.js';
import { ProblemDetailsFilter } from './platform/errors.js';

// BigInt (pul) JSON'da string bo'lib chiqadi
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function (this: bigint) {
  return this.toString();
};

async function api() {
  const { AppModule } = await import('./app.module.js');
  const adapter = new FastifyAdapter({ trustProxy: true, bodyLimit: 1_048_576, genReqId: () => randomUUID() });
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, { bodyParser: false });
  await app.register(cookie, { secret: env.SESSION_SECRET });
  await app.register(helmet, { contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'same-origin' } });
  await app.register(multipart, { limits: { fileSize: 2 * 1024 ** 3, files: 5 } });
  const fastify = app.getHttpAdapter().getInstance();
  // Bo'sh JSON body → {} (standart himoyalangan parser bilan: __proto__/constructor zaharlanishiga qarshi)
  const defaultJson = fastify.getDefaultJsonParser('error', 'error');
  fastify.removeContentTypeParser('application/json');
  fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    (req as unknown as { rawBody?: string }).rawBody = body as string; // to'lov tizimlari webhook jurnali uchun
    if (body === '' || body === undefined) return done(null, {});
    // To'lov tizimlari buzilgan JSON'ga ham o'z protokoli formatida javob kutadi (Payme: -32700, HTTP 200)
    if (req.url.startsWith('/api/v1/gateways/')) {
      return defaultJson(req, body as string, (err, value) => (err ? done(null, { __invalidJson: true }) : done(null, value)));
    }
    defaultJson(req, body as string, done);
  });
  // Click SHOP API — application/x-www-form-urlencoded
  fastify.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (req, body, done) => {
    (req as unknown as { rawBody?: string }).rawBody = body as string;
    done(null, Object.fromEntries(new URLSearchParams(body as string)));
  });
  fastify.addHook('onRequest', (req, _reply, done) => {
    requestContext.run(
      { requestId: String(req.id), ip: req.ip ?? null, userAgent: req.headers['user-agent'] ?? null, actor: { ...SYSTEM_ACTOR, type: 'SYSTEM', label: 'anonymous' } },
      done,
    );
  });
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new ProblemDetailsFilter());
  app.enableShutdownHooks();
  await app.listen(env.PORT, '127.0.0.1');
  new Logger('Bootstrap').log(`API: http://127.0.0.1:${env.PORT}/api/v1`);
  if (!mfaEnforced) new Logger('Bootstrap').warn("Ikki bosqichli tasdiqlash O'CHIRILGAN (MFA_ENABLED=false) — faqat lokal ishlash uchun");
  else if (!env.MFA_ENABLED && isProd) new Logger('Bootstrap').warn("MFA_ENABLED=false production'da e'tiborga olinmaydi — TOTP majburiy");
}

async function worker() {
  const { WorkerModule } = await import('./worker.module.js');
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();
  new Logger('Bootstrap').log('Worker ishga tushdi');
}

async function seed() {
  const { Db } = await import('./platform/db.service.js');
  const { seedBase } = await import('./seed/seed.js');
  const db = new Db();
  await seedBase(db);
  await db.$disconnect();
  if (process.argv.includes('--demo')) {
    const { seedDemo } = await import('./seed/demo.js');
    await seedDemo();
  }
}

const mode = process.argv[2] ?? 'api';
const run = { api, worker, seed }[mode as 'api' | 'worker' | 'seed'];
if (!run) {
  console.error(`Noma'lum rejim: ${mode} (api | worker | seed [--demo])`);
  process.exit(1);
}
await run();
