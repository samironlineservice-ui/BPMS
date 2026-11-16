// Fayl turi client aytganiga emas, birinchi baytlarga (magic bytes) qarab aniqlanadi.
const ext = (name: string) => name.toLowerCase().split('.').pop() ?? '';
const OOXML: Record<string, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  apk: 'application/vnd.android.package-archive', jar: 'application/java-archive',
};
const TEXT: Record<string, string> = {
  txt: 'text/plain', log: 'text/plain', csv: 'text/csv', json: 'application/json', md: 'text/markdown', xml: 'application/xml',
  yaml: 'application/yaml', yml: 'application/yaml', svg: 'image/svg+xml', html: 'text/html', htm: 'text/html', sql: 'application/sql',
  sh: 'text/x-shellscript', ini: 'text/plain', conf: 'text/plain', env: 'text/plain',
};

export function sniffMime(head: Buffer, filename: string): string {
  const b = head;
  const starts = (...bytes: number[]) => bytes.every((x, i) => b[i] === x);
  const ascii = (s: string, at = 0) => b.subarray(at, at + s.length).toString('latin1') === s;
  if (ascii('%PDF-')) return 'application/pdf';
  if (starts(0x89, 0x50, 0x4e, 0x47)) return 'image/png';
  if (starts(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (ascii('GIF87a') || ascii('GIF89a')) return 'image/gif';
  if (ascii('RIFF') && ascii('WEBP', 8)) return 'image/webp';
  if (starts(0x50, 0x4b, 0x03, 0x04) || starts(0x50, 0x4b, 0x05, 0x06)) return OOXML[ext(filename)] ?? 'application/zip';
  if (starts(0x1f, 0x8b)) return 'application/gzip';
  if (starts(0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c)) return 'application/x-7z-compressed';
  if (ascii('Rar!')) return 'application/vnd.rar';
  if (ascii('ustar', 257)) return 'application/x-tar';
  if (starts(0x4d, 0x5a)) return 'application/vnd.microsoft.portable-executable';
  if (starts(0x7f, 0x45, 0x4c, 0x46)) return 'application/x-elf';
  if (starts(0xd0, 0xcf, 0x11, 0xe0)) return ext(filename) === 'msi' ? 'application/x-msi' : 'application/x-ole-storage';
  if (starts(0xe9) && ext(filename) === 'bin') return 'application/octet-stream'; // ESP32 firmware image
  if (b.length && !b.subarray(0, 1024).includes(0)) return TEXT[ext(filename)] ?? 'text/plain';
  return 'application/octet-stream';
}

/** Brauzerda inline ko'rsatish xavfsiz bo'lgan turlar (HTML/SVG — hech qachon). */
export const INLINE_SAFE = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'text/plain', 'text/csv']);

/** Fayl nomi: yo'l qismlari, boshqaruv belgilari olib tashlanadi. */
export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'file';
  const clean = base.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '_').replace(/^\.+/, '').trim().slice(0, 200);
  return clean || 'file';
}
