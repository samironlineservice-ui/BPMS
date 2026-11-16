import { APPROVAL_POLICIES, PERMISSIONS, SYSTEM_ROLES } from '@ads/contracts';
import type { Db } from '../platform/db.service.js';
import { hashPassword } from '../modules/auth/auth.service.js';
import { isProd } from '../config/env.js';
import { dbDate, monthStart, todayLocal } from '../platform/time.js';

const LEDGER_ACCOUNTS: { code: string; name: string; type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE' }[] = [
  { code: '1000', name: 'Kassa', type: 'ASSET' },
  { code: '1020', name: 'Bank hisobi', type: 'ASSET' },
  { code: '1030', name: 'Karta terminali', type: 'ASSET' },
  { code: '1150', name: 'Clearing — Payme', type: 'ASSET' },
  { code: '1151', name: 'Clearing — Click', type: 'ASSET' },
  { code: '1152', name: 'Clearing — Uzum', type: 'ASSET' },
  { code: '1153', name: 'Clearing — Paynet', type: 'ASSET' },
  { code: '1200', name: 'Debitorlik (AR)', type: 'ASSET' },
  { code: '2100', name: 'Mijoz avanslari', type: 'LIABILITY' },
  { code: '2200', name: 'QQS', type: 'LIABILITY' },
  { code: '4000', name: 'Daromad', type: 'REVENUE' },
  { code: '6100', name: 'Gateway komissiyasi', type: 'EXPENSE' },
  { code: '7100', name: 'FX foyda (realized)', type: 'REVENUE' },
  { code: '7200', name: 'FX zarar (realized)', type: 'EXPENSE' },
  { code: '7150', name: 'FX foyda (unrealized)', type: 'REVENUE' },
  { code: '7250', name: 'FX zarar (unrealized)', type: 'EXPENSE' },
];

/** Idempotent: ruxsatlar, tizim rollari, tasdiq siyosatlari, ledger hisoblari, joriy oy, rahbar akkaunti. */
export async function seedBase(db: Db, log: (s: string) => void = console.log) {
  for (const p of PERMISSIONS) {
    await db.permission.upsert({
      where: { key: p.key },
      create: { key: p.key, module: p.module, description: p.description, sensitive: p.sensitive ?? false },
      update: { module: p.module, description: p.description, sensitive: p.sensitive ?? false },
    });
  }
  log(`ruxsatlar: ${PERMISSIONS.length}`);

  for (const r of SYSTEM_ROLES) {
    let role = await db.role.findUnique({ where: { key: r.key } });
    if (!role) role = await db.role.create({ data: { key: r.key, name: r.name, description: r.description, isSystem: true } });
    const existing = new Set((await db.rolePermission.findMany({ where: { roleId: role.id } })).map((x) => x.permissionKey));
    const wanted = new Set<string>(r.permissions);
    const add = [...wanted].filter((k) => !existing.has(k));
    const remove = [...existing].filter((k) => !wanted.has(k));
    if (add.length) await db.rolePermission.createMany({ data: add.map((k) => ({ roleId: role.id, permissionKey: k })) });
    if (remove.length) await db.rolePermission.deleteMany({ where: { roleId: role.id, permissionKey: { in: remove } } });
  }
  log(`tizim rollari: ${SYSTEM_ROLES.map((r) => r.key).join(', ')}`);

  for (const ap of APPROVAL_POLICIES) {
    await db.approvalPolicy.upsert({
      where: { key: ap.key },
      create: { key: ap.key, description: ap.description, approverPermission: ap.approverPermission, allowSelfApproval: true },
      update: { description: ap.description, approverPermission: ap.approverPermission },
    });
  }
  for (const a of LEDGER_ACCOUNTS) {
    await db.ledgerAccount.upsert({ where: { code: a.code }, create: a, update: { name: a.name, type: a.type } });
  }
  const month = dbDate(monthStart(todayLocal())); // kompaniya vaqti (Asia/Tashkent) bo'yicha joriy oy
  await db.financialPeriod.upsert({ where: { month }, create: { month }, update: {} });
  log('tasdiq siyosatlari, ledger hisoblari va joriy oy tayyor');

  const email = (process.env.SEED_DIRECTOR_EMAIL || 'rahbar@ads.local').toLowerCase();
  const fromEnv = !!process.env.SEED_DIRECTOR_PASSWORD;
  if (isProd && (!fromEnv || process.env.SEED_DIRECTOR_PASSWORD!.length < 12)) {
    throw new Error('Production: SEED_DIRECTOR_PASSWORD (kamida 12 belgi) majburiy');
  }
  const password = process.env.SEED_DIRECTOR_PASSWORD || 'Rahbar-Parol-2026!'; // faqat lokal dev uchun standart parol
  let director = await db.user.findUnique({ where: { email } });
  if (!director) {
    director = await db.user.create({
      data: { email, fullName: 'Rahbar', status: 'ACTIVE', passwordHash: await hashPassword(password), mfaRequired: true },
    });
    const role = await db.role.findUniqueOrThrow({ where: { key: 'director' } });
    await db.userRoleAssignment.create({ data: { userId: director.id, roleId: role.id } });
    log(`rahbar akkaunti yaratildi: ${email} / ${fromEnv ? 'parol — SEED_DIRECTOR_PASSWORD' : password} (birinchi kirishda TOTP sozlanadi)`);
  } else log(`rahbar akkaunti mavjud: ${email}`);
}
