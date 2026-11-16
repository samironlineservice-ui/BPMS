import { Readable } from 'node:stream';
import { Injectable } from '@nestjs/common';
import { formatMoney, mulDivRound } from '@ads/contracts';
import { AuditService } from '../../platform/audit.service.js';
import { Db } from '../../platform/db.service.js';
import { conflict, notFound } from '../../platform/errors.js';
import { StorageService } from '../../platform/storage.service.js';
import { dmy, renderPdf } from '../../platform/pdf.js';
import { addDays, fromDbDate } from '../../platform/time.js';

/** Invoice PDF: bir marta yaratiladi, o'zgarmas fayl sifatida saqlanadi (yuridik hujjat — chiqarilgan paytdagi holat). */
@Injectable()
export class InvoicePdfService {
  constructor(private readonly db: Db, private readonly storage: StorageService, private readonly audit: AuditService) {}

  async fileFor(invoiceId: string): Promise<string> {
    const inv = await this.db.invoice.findUnique({ where: { id: invoiceId }, include: { lines: { orderBy: { position: 'asc' } }, client: true } });
    if (!inv) throw notFound('Invoice');
    if (inv.status === 'DRAFT' || !inv.number) throw conflict('Qoralama invoice uchun PDF yo\'q');
    if (inv.pdfFileId) return inv.pdfFileId;
    const company = ((await this.db.setting.findUnique({ where: { key: 'company.profile' } }))?.value ?? {}) as Record<string, string | undefined>;
    const snap = (inv.clientSnapshot ?? {}) as Record<string, string | boolean | null | undefined>;
    const cur = inv.currency;
    const m = (x: bigint) => formatMoney(x, cur);
    const issue = fromDbDate(inv.issueDate);
    const rows = inv.lines.map((l, i) => [
      { text: String(i + 1), alignment: 'center' }, { text: l.description },
      { text: l.prorationDen > 1 ? `${l.quantity} × ${l.prorationNum}/${l.prorationDen}` : String(l.quantity), alignment: 'center' },
      { text: m(l.unitAmountMinor), alignment: 'right' }, { text: m(l.amountMinor), alignment: 'right' },
      { text: l.vatRateBp ? `${l.vatRateBp / 100}% · ${m(l.vatMinor)}` : '—', alignment: 'right' },
      { text: m(l.amountMinor + l.vatMinor), alignment: 'right', bold: true },
    ]);
    const party = (title: string, name: string, items: [string, string | null | undefined][]) => ({
      width: '*',
      stack: [
        { text: title, style: 'label' }, { text: name || '—', bold: true, margin: [0, 2, 0, 4] },
        ...items.filter(([, v]) => v).map(([k, v]) => ({ text: [{ text: `${k}: `, color: '#666' }, String(v)], fontSize: 8.5 })),
      ],
    });
    const doc = {
      pageSize: 'A4', pageMargins: [40, 40, 40, 50], defaultStyle: { font: 'Roboto', fontSize: 9.5, lineHeight: 1.2 },
      info: { title: inv.number, creator: 'ADS-ERP' },
      styles: { h1: { fontSize: 18, bold: true }, label: { fontSize: 8, color: '#666' }, th: { bold: true, fontSize: 8.5, fillColor: '#f2f4f7' } },
      footer: (page: number, pages: number) => ({ text: `${inv.number} · ${page}/${pages}`, alignment: 'center', fontSize: 8, color: '#888', margin: [0, 15, 0, 0] }),
      content: [
        {
          columns: [
            { stack: [{ text: company.name ?? 'ADS', style: 'h1' }, { text: company.tagline ?? '', style: 'label' }] },
            { width: 'auto', stack: [
              { text: 'HISOB-FAKTURA', bold: true, fontSize: 13, alignment: 'right' },
              { text: inv.number, fontSize: 11, alignment: 'right', margin: [0, 2, 0, 6] },
              { text: [{ text: 'Sana: ', color: '#666' }, dmy(issue)], alignment: 'right' },
              { text: [{ text: "To'lov muddati: ", color: '#666' }, dmy(fromDbDate(inv.dueDate))], alignment: 'right' },
              ...(inv.periodStart ? [{ text: [{ text: 'Davr: ', color: '#666' }, `${dmy(fromDbDate(inv.periodStart))} – ${dmy(addDays(fromDbDate(inv.periodEnd)!, -1))}`], alignment: 'right' }] : []),
            ] },
          ],
        },
        { canvas: [{ type: 'line', x1: 0, y1: 8, x2: 515, y2: 8, lineWidth: 0.5, lineColor: '#ccc' }], margin: [0, 4, 0, 12] },
        {
          columns: [
            party('Yetkazib beruvchi', company.legalName ?? company.name ?? 'ADS', [
              ['STIR', company.tin], ['Manzil', company.address], ['Bank', company.bankName], ['MFO', company.bankMfo], ['H/r', company.bankAccount], ['Tel', company.phone],
            ]),
            party('Xaridor', String(snap.legalName ?? inv.client.legalName), [
              ['STIR', snap.tin as string], ['Manzil', snap.legalAddress as string], ['Bank', snap.bankName as string], ['MFO', snap.bankMfo as string],
              ['H/r', snap.bankAccount as string], ['Tel', snap.phone as string], ['Shaxsiy hisob raqami', snap.accountNo as string],
            ]),
          ],
          columnGap: 24, margin: [0, 0, 0, 16],
        },
        {
          table: {
            headerRows: 1, widths: [18, '*', 50, 70, 70, 60, 75],
            body: [
              [{ text: '№', style: 'th', alignment: 'center' }, { text: 'Xizmat', style: 'th' }, { text: 'Miqdor', style: 'th', alignment: 'center' },
                { text: 'Narx', style: 'th', alignment: 'right' }, { text: 'Summa', style: 'th', alignment: 'right' }, { text: 'QQS', style: 'th', alignment: 'right' },
                { text: 'Jami', style: 'th', alignment: 'right' }],
              ...rows,
            ],
          },
          layout: { hLineWidth: () => 0.5, vLineWidth: () => 0, hLineColor: () => '#ddd', paddingTop: () => 4, paddingBottom: () => 4 },
        },
        {
          columns: [
            { width: '*', text: '' },
            {
              width: 230, margin: [0, 10, 0, 0],
              table: {
                widths: ['*', 'auto'],
                body: [
                  ['QQSsiz summa', { text: m(inv.subtotalMinor), alignment: 'right' }],
                  ['QQS', { text: m(inv.vatMinor), alignment: 'right' }],
                  [{ text: "To'lanadigan jami", bold: true }, { text: m(inv.totalMinor), alignment: 'right', bold: true, fontSize: 11 }],
                  ...(cur === 'USD' && inv.fxRate ? [[
                    { text: `MB kursi (${dmy(issue)}): 1 USD = ${inv.fxRate.toString()} so'm`, colSpan: 2, fontSize: 8, color: '#666' }, '',
                  ], [
                    { text: "So'mdagi ekvivalenti", fontSize: 8.5 }, { text: formatMoney(inv.totalUzsMinor ?? mulDivRound(inv.totalMinor, 1n, 1n), 'UZS'), alignment: 'right', fontSize: 8.5 },
                  ]] : []),
                ],
              },
              layout: 'noBorders',
            },
          ],
        },
        {
          margin: [0, 24, 0, 0],
          stack: [
            { text: "To'lov bo'yicha", style: 'label' },
            { text: `Bank o'tkazmasida to'lov maqsadida invoice raqamini (${inv.number}) ko'rsating.`, fontSize: 8.5 },
            ...(snap.accountNo ? [{ text: `Payme/Click/Uzum orqali: shaxsiy hisob raqami ${String(snap.accountNo)}.`, fontSize: 8.5 }] : []),
          ],
        },
      ],
    };
    const buffer = await renderPdf(doc);
    const stored = await this.storage.put(Readable.from(buffer));
    try {
      return await this.db.$transaction(async (tx) => {
        const f = await tx.file.create({
          data: {
            storageKey: stored.key, bucket: this.storage.bucket, originalName: `${inv.number}.pdf`, mimeType: 'application/pdf', sizeBytes: stored.size,
            sha256: stored.sha256, status: 'AVAILABLE', uploadedByType: 'SYSTEM', retentionUntil: new Date(Date.now() + 5 * 365 * 86_400_000),
          },
        });
        await tx.fileAttachment.create({ data: { fileId: f.id, entityType: 'INVOICE', entityId: inv.id, label: 'Invoice PDF' } });
        const r = await tx.invoice.updateMany({ where: { id: inv.id, pdfFileId: null }, data: { pdfFileId: f.id } });
        if (!r.count) throw conflict('PDF parallel yaratildi');
        await this.audit.record(tx, { action: 'invoice.pdf_generated', resourceType: 'invoice', resourceId: inv.id, metadata: { fileId: f.id, sha256: stored.sha256 } });
        return f.id;
      });
    } catch (e) {
      await this.storage.remove(stored.key);
      const again = await this.db.invoice.findUnique({ where: { id: inv.id }, select: { pdfFileId: true } });
      if (again?.pdfFileId) return again.pdfFileId;
      throw e;
    }
  }
}
