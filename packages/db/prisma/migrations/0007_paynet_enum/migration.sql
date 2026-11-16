-- Paynet (UWS) — yangi to'lov kanali. Yangi enum qiymatini shu tranzaksiyada ishlatib bo'lmaydi,
-- shuning uchun undan foydalanuvchi CHECK'lar keyingi migratsiyada (0008).
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'PAYNET';
ALTER TYPE "GatewayProvider" ADD VALUE IF NOT EXISTS 'PAYNET';
