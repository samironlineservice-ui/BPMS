import { AppError } from './errors.js';

/** Oddiy in-memory sliding window (v1: bitta instans). */
const buckets = new Map<string, number[]>();
export function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const arr = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= max) throw new AppError(429, 'RATE_LIMITED', "Juda ko'p urinish. Birozdan keyin qayta urinib ko'ring.");
  arr.push(now);
  buckets.set(key, arr);
  if (buckets.size > 50_000) buckets.clear();
}
