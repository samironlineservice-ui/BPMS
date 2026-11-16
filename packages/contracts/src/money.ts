// Pul arifmetikasi: summalar BigInt minor units (tiyin/sent), kurs — scaled bigint (×10⁶).
// Yaxlitlash: half away from zero — PostgreSQL round(numeric) bilan bir xil (DB CHECK'lar shuni takrorlaydi).

export const CURRENCIES = ['UZS', 'USD'] as const;
export type CurrencyCode = (typeof CURRENCIES)[number];
export const MINOR_DIGITS: Record<CurrencyCode, number> = { UZS: 2, USD: 2 };
export const RATE_SCALE = 1_000_000n;

/** round(a × b / c), half away from zero. */
export function mulDivRound(a: bigint, b: bigint, c: bigint): bigint {
  if (c === 0n) throw new RangeError('division by zero');
  const n = a * b;
  const q = n / c;
  const r = n % c;
  if (r === 0n) return q;
  const absR = r < 0n ? -r : r;
  const absC = c < 0n ? -c : c;
  if (absR * 2n >= absC) return q + ((n < 0n) !== (c < 0n) ? -1n : 1n);
  return q;
}

/** "1250000.5" | "1 250 000,50" → 125000050n (minor units). */
export function parseMoney(input: string | number, digits = 2): bigint {
  const s = String(input).trim().replace(/[\s ']/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw new RangeError(`Noto'g'ri summa: ${input}`);
  const neg = s.startsWith('-');
  const [int = '0', frac = ''] = (neg ? s.slice(1) : s).split('.');
  if (frac.length > digits) throw new RangeError(`Ko'pi bilan ${digits} xona: ${input}`);
  const v = BigInt(int) * 10n ** BigInt(digits) + BigInt(frac.padEnd(digits, '0') || '0');
  return neg ? -v : v;
}

/** 125000050n → "1250000.50" (API/forma uchun). */
export function minorToDecimalString(minor: bigint | string | number, digits = 2): string {
  const v = BigInt(minor);
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const base = 10n ** BigInt(digits);
  const int = abs / base;
  const frac = (abs % base).toString().padStart(digits, '0');
  return `${neg ? '-' : ''}${int}${digits ? '.' + frac : ''}`;
}

/** "12100.5" → 12100500000n (×10⁶). */
export function parseRate(input: string | number): bigint {
  return parseMoney(input, 6);
}

export function rateToString(scaled: bigint): string {
  return minorToDecimalString(scaled, 6);
}

/** USD sent → UZS tiyin (ikkala valyuta 2 xonali): round(cents × rate). */
export function convertMinor(amountMinor: bigint, rateScaled: bigint): bigint {
  return mulDivRound(amountMinor, rateScaled, RATE_SCALE);
}

/** UZS tiyin → USD sent: round(tiyin / rate). */
export function convertMinorInverse(amountMinor: bigint, rateScaled: bigint): bigint {
  return mulDivRound(amountMinor, RATE_SCALE, rateScaled);
}

/** QQS: round(amount × bp / 10000). */
export function vatOf(amountMinor: bigint, vatRateBp: number): bigint {
  return mulDivRound(amountMinor, BigInt(vatRateBp), 10_000n);
}

/** Kunlik proration: round(qty × unit × num / den). */
export function prorate(quantity: number, unitMinor: bigint, num: number, den: number): bigint {
  return mulDivRound(BigInt(quantity) * unitMinor, BigInt(num), BigInt(den));
}

/** Butun qismni 3 xonadan guruhlash (Intl lokaliga bog'liq emas — brauzer va Node'da bir xil natija). */
function groupDigits(int: string, sep: string): string {
  let out = '';
  for (let i = 0; i < int.length; i++) {
    if (i > 0 && (int.length - i) % 3 === 0) out += sep;
    out += int[i];
  }
  return out;
}

/** Ko'rinish: 1 250 000,50 so'm / $1,250.50 (aniq — BigInt'dan, float'siz). */
export function formatMoney(minor: bigint | string | number, currency: CurrencyCode): string {
  const s = minorToDecimalString(minor, MINOR_DIGITS[currency]);
  const neg = s.startsWith('-');
  const [int = '0', frac = '00'] = (neg ? s.slice(1) : s).split('.');
  if (currency === 'USD') return `${neg ? '-' : ''}$${groupDigits(int, ',')}.${frac}`;
  return `${neg ? '-' : ''}${groupDigits(int, ' ')},${frac} so'm`;
}
