import crypto from 'node:crypto';
import { env } from '../config/env.js';

const key = Buffer.from(env.ENCRYPTION_KEY_HEX, 'hex');
export const KEY_VERSION = 1;

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
export const sha256Hex = (s: string | Buffer) => crypto.createHash('sha256').update(s).digest('hex');
/** Qidiruv uchun blind index (HMAC) — masalan PINFL. */
export const blindIndex = (value: string) => crypto.createHmac('sha256', key).update(`bi:${value}`).digest('hex');

/** Imzo (HMAC-SHA256, base64url) — masalan, emulyatorning holatsiz tokenlari uchun. */
export const hmacSign = (purpose: string, data: string) => crypto.createHmac('sha256', key).update(`${purpose}:${data}`).digest('base64url');

/** AES-256-GCM: [12 iv][16 tag][ciphertext] */
export function encrypt(plain: string): Uint8Array<ArrayBuffer> {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const out = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  const buf = Buffer.concat([iv, c.getAuthTag(), out]);
  return new Uint8Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
}
export function decrypt(blob: Uint8Array): string {
  const b = Buffer.from(blob);
  const d = crypto.createDecipheriv('aes-256-gcm', key, b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
}
/** Luhn nazorat raqami bilan tasodifiy raqam (accountNo, PaymentOrder.number). */
export function luhnNumber(length: number): string {
  let base = '';
  base += String(crypto.randomInt(1, 10));
  while (base.length < length - 1) base += String(crypto.randomInt(0, 10));
  const d = base.split('').map(Number);
  let sum = 0;
  for (let i = 0; i < d.length; i++) {
    let x = d[d.length - 1 - i]!;
    if (i % 2 === 0) { x *= 2; if (x > 9) x -= 9; }
    sum += x;
  }
  return base + ((10 - (sum % 10)) % 10);
}
