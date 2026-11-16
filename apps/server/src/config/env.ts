import path from 'node:path';
import { z } from 'zod';

const repoRoot = path.resolve(import.meta.dirname, '../../../..');
try {
  process.loadEnvFile(path.join(repoRoot, '.env'));
} catch {
  /* prod'da env tashqaridan beriladi */
}

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3100),
  APP_ORIGIN: z.string().default('http://localhost:5173'),
  PORTAL_ORIGIN: z.string().default('http://localhost:5174'),
  /** To'lov tizimlari webhook manzillari shu manzildan ko'rsatiladi (VPS'da — https://api.<domen>). */
  PUBLIC_API_URL: z.string().default('http://localhost:3100'),
  DATABASE_URL: z.string().min(1),
  DATABASE_URL_PORTAL: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  ENCRYPTION_KEY_HEX: z.string().regex(/^[0-9a-f]{64}$/),
  STORAGE_DIR: z.string().default('var/storage'),
  TZ_COMPANY: z.string().default('Asia/Tashkent'),
  TELEGRAM_BOT_TOKEN: z.string().optional().default(''),
  CBU_RATES_URL: z.string().default('https://cbu.uz/uz/arkhiv-kursov-valyut/json/'),
  SESSION_IDLE_MINUTES: z.coerce.number().int().default(30),
  SESSION_ABSOLUTE_HOURS: z.coerce.number().int().default(12),
  /** false — ikki bosqichli tasdiqlash vaqtincha o'chiriladi (faqat lokal ishlash uchun; production'da e'tiborga olinmaydi). */
  MFA_ENABLED: z.string().optional().default('true').transform((v) => !/^(false|0|off|no)$/i.test(v.trim())),
  /** Mijozlar kabinetda o'zi ro'yxatdan o'ta oladimi (false — faqat menejer taklifi orqali). */
  PORTAL_REGISTRATION: z.string().optional().default('true').transform((v) => !/^(false|0|off|no)$/i.test(v.trim())),
});

export type Env = z.infer<typeof schema>;
export const env: Env = schema.parse(process.env);
export const isProd = env.NODE_ENV === 'production';
/** Xodimlar uchun TOTP majburiymi. Production'da har doim true. */
export const mfaEnforced = env.MFA_ENABLED || isProd;
export const storageRoot = path.isAbsolute(env.STORAGE_DIR) ? env.STORAGE_DIR : path.join(repoRoot, env.STORAGE_DIR);
