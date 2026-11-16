// PDF (pdfmake 0.3): yagona sozlash — shriftlar lokal (Roboto), tashqi URL'lar taqiqlangan.
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfmake = require('pdfmake') as {
  setFonts(f: unknown): void; setUrlAccessPolicy(cb: (url: string) => boolean): void; setLocalAccessPolicy(cb: (p: string) => boolean): void;
  createPdf(doc: unknown): { getBuffer(): Promise<Buffer> };
};
const fontsDir = path.join(path.dirname(require.resolve('pdfmake/package.json')), 'fonts', 'Roboto');
pdfmake.setFonts({
  Roboto: {
    normal: path.join(fontsDir, 'Roboto-Regular.ttf'), bold: path.join(fontsDir, 'Roboto-Medium.ttf'),
    italics: path.join(fontsDir, 'Roboto-Italic.ttf'), bolditalics: path.join(fontsDir, 'Roboto-MediumItalic.ttf'),
  },
});
pdfmake.setUrlAccessPolicy(() => false); // tashqi resurslar yuklanmaydi
pdfmake.setLocalAccessPolicy((p) => path.resolve(p).startsWith(fontsDir));

export const renderPdf = (doc: unknown): Promise<Buffer> => pdfmake.createPdf(doc).getBuffer();
/** YYYY-MM-DD → DD.MM.YYYY */
export const dmy = (d: string | null | undefined) => (d ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}` : '—');
