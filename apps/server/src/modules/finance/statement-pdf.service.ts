import { Injectable } from '@nestjs/common';
import { type CurrencyCode, formatMoney, type StatementDto } from '@ads/contracts';
import { Db } from '../../platform/db.service.js';
import { dmy, renderPdf } from '../../platform/pdf.js';
import { todayLocal } from '../../platform/time.js';

/**
 * Akt-sverka (o'zaro hisob-kitoblarni solishtirish dalolatnomasi) PDF'i — har so'rovda statement'dan yangidan quriladi
 * (saqlanmaydi: davr va sana o'zgaruvchan). Debet — invoice'lar (mijoz qarzi), kredit — to'lovlar va tuzatishlar.
 */
@Injectable()
export class StatementPdfService {
  constructor(private readonly db: Db) {}

  async render(st: StatementDto): Promise<{ buffer: Buffer; filename: string }> {
    const company = ((await this.db.setting.findUnique({ where: { key: 'company.profile' } }))?.value ?? {}) as Record<string, string | undefined>;
    const client = await this.db.client.findUniqueOrThrow({ where: { id: st.client.id } });
    const cur = st.currency as CurrencyCode;
    const m = (x: string | bigint) => formatMoney(typeof x === 'bigint' ? x : BigInt(x), cur);
    const abs = (x: string) => (x.startsWith('-') ? x.slice(1) : x);
    const companyName = company.legalName || company.name || 'ADS';
    const clientName = client.legalName || client.displayName;
    const closing = BigInt(st.closingMinor);
    const conclusion = closing > 0n
      ? `${dmy(st.to)} holatiga ${clientName}ning ${companyName} oldidagi qarzi: ${m(closing)}.`
      : closing < 0n
        ? `${dmy(st.to)} holatiga ${companyName}ning ${clientName} oldidagi qarzi (avans): ${m(-closing)}.`
        : `${dmy(st.to)} holatiga tomonlar o'rtasida o'zaro qarzdorlik yo'q.`;
    const th = (text: string, alignment = 'left') => ({ text, style: 'th', alignment });
    const num = (x: string, bold = false) => ({ text: x === '0' ? '' : m(x), alignment: 'right', bold });
    const rows = st.lines.map((l, i) => [
      { text: String(i + 1), alignment: 'center', color: '#666' }, dmy(l.date), { text: l.ref, fontSize: 8 }, { text: l.description, fontSize: 8.5 },
      num(l.debitMinor), num(l.creditMinor), { text: m(l.balanceMinor), alignment: 'right' },
    ]);
    const signer = (title: string, name: string) => ({
      width: '*',
      stack: [
        { text: title, style: 'label' }, { text: name, bold: true, margin: [0, 2, 0, 14] },
        { text: 'Rahbar: ______________________', margin: [0, 0, 0, 12] },
        { text: 'Bosh buxgalter: ______________', margin: [0, 0, 0, 12] },
        { text: "M.O'.", color: '#666' },
      ],
    });
    const doc = {
      pageSize: 'A4', pageMargins: [36, 40, 36, 50], defaultStyle: { font: 'Roboto', fontSize: 9, lineHeight: 1.2 },
      info: { title: `Akt-sverka ${client.code} ${st.from}–${st.to}`, creator: 'ADS-ERP' },
      styles: { label: { fontSize: 8, color: '#666' }, th: { bold: true, fontSize: 8, fillColor: '#f2f4f7' } },
      footer: (page: number, pages: number) => ({
        text: `Akt-sverka · ${client.code} · tuzilgan sana ${dmy(todayLocal())} · ${page}/${pages}`, alignment: 'center', fontSize: 7.5, color: '#888', margin: [0, 15, 0, 0],
      }),
      content: [
        { text: "O'ZARO HISOB-KITOBLARNI SOLISHTIRISH DALOLATNOMASI", bold: true, fontSize: 12.5, alignment: 'center' },
        { text: '(akt-sverka)', alignment: 'center', color: '#666', margin: [0, 2, 0, 4] },
        { text: `${dmy(st.from)} – ${dmy(st.to)} davr uchun · valyuta: ${cur}`, alignment: 'center', margin: [0, 0, 0, 12] },
        {
          text: [
            'Biz, quyida imzo chekuvchilar, ', { text: companyName, bold: true }, company.tin ? ` (STIR ${company.tin})` : '',
            ' va ', { text: clientName, bold: true }, client.tin ? ` (STIR ${client.tin})` : '',
            " o'rtasidagi o'zaro hisob-kitoblar holatini solishtirdik:",
          ],
          margin: [0, 0, 0, 10],
        },
        {
          table: {
            headerRows: 1, widths: [16, 52, 78, '*', 66, 66, 70],
            body: [
              [th('№', 'center'), th('Sana'), th('Hujjat'), th('Mazmuni'), th('Debet', 'right'), th('Kredit', 'right'), th('Qoldiq', 'right')],
              [{ text: '', }, dmy(st.from), '', { text: "Boshlang'ich qoldiq", italics: true }, '', '', { text: m(st.openingMinor), alignment: 'right', bold: true }],
              ...rows,
              [{ text: '' }, '', '', { text: 'Davr aylanmasi', bold: true }, num(st.debitTotalMinor, true), num(st.creditTotalMinor, true), ''],
              [{ text: '' }, dmy(st.to), '', { text: 'Yakuniy qoldiq', bold: true }, '', '', { text: m(st.closingMinor), alignment: 'right', bold: true }],
            ],
          },
          layout: { hLineWidth: () => 0.5, vLineWidth: () => 0, hLineColor: () => '#ddd', paddingTop: () => 3, paddingBottom: () => 3 },
        },
        { text: "Qoldiq: musbat — mijozning qarzi, manfiy — avans (oldindan to'lov).", fontSize: 7.5, color: '#666', margin: [0, 4, 0, 10] },
        { text: conclusion, bold: true, margin: [0, 0, 0, 4] },
        ...(closing !== 0n ? [{ text: `Summa: ${m(abs(st.closingMinor))}.`, margin: [0, 0, 0, 18] }] : [{ text: '', margin: [0, 0, 0, 18] }]),
        { columns: [signer('Yetkazib beruvchi', companyName), signer('Xaridor', clientName)], columnGap: 30 },
      ],
    };
    const buffer = await renderPdf(doc);
    return { buffer, filename: `akt-sverka_${client.code}_${st.from}_${st.to}_${cur}.pdf` };
  }
}
