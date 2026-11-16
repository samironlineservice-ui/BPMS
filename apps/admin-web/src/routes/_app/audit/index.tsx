import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Fragment, useState } from 'react';
import { z } from 'zod';
import type { AuditItem, Paginated } from '@ads/contracts';
import { PageHeader } from '@/components/common/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import { dateTime } from '@/lib/format';

const search = z.object({
  page: z.number().int().min(1).catch(1).default(1), q: z.string().optional(), action: z.string().optional(),
  result: z.string().optional(), from: z.string().optional(), to: z.string().optional(),
});
export const Route = createFileRoute('/_app/audit/')({ validateSearch: search, component: AuditPage });

const RESULT_TONE: Record<string, string> = { SUCCESS: 'text-success', DENIED: 'text-destructive', FAILED: 'text-warning' };

function AuditPage() {
  const s = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const set = (p: Partial<typeof s>) => navigate({ search: (prev) => ({ ...prev, ...p, page: p.page ?? 1 }) });
  const [open, setOpen] = useState<string | null>(null);
  const { data } = useQuery({ queryKey: ['audit', s], queryFn: () => api.get<Paginated<AuditItem>>('/audit', { ...s, pageSize: 50 }) });
  const pages = data ? Math.ceil(data.total / data.pageSize) : 1;
  return (
    <>
      <PageHeader title="Audit log" description="Barcha muhim harakatlar — o'zgartirib bo'lmaydigan jurnal" />
      <div className="mb-4 flex flex-wrap gap-2">
        <Input placeholder="Kim yoki amal…" className="max-w-56" defaultValue={s.q} onChange={(e) => set({ q: e.target.value || undefined })} />
        <Input placeholder="Amal prefiksi (user., auth.)" className="max-w-56" defaultValue={s.action} onChange={(e) => set({ action: e.target.value || undefined })} />
        <Select value={s.result ?? 'all'} onValueChange={(v) => set({ result: v === 'all' ? undefined : v })}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Barchasi</SelectItem><SelectItem value="SUCCESS">Muvaffaqiyatli</SelectItem>
            <SelectItem value="DENIED">Rad etilgan</SelectItem><SelectItem value="FAILED">Xato</SelectItem>
          </SelectContent>
        </Select>
        <Input type="date" className="w-40" value={s.from ?? ''} onChange={(e) => set({ from: e.target.value || undefined })} />
        <Input type="date" className="w-40" value={s.to ?? ''} onChange={(e) => set({ to: e.target.value || undefined })} />
      </div>
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader><TableRow><TableHead>Vaqt</TableHead><TableHead>Kim</TableHead><TableHead>Amal</TableHead><TableHead>Resurs</TableHead><TableHead>Natija</TableHead><TableHead>IP</TableHead></TableRow></TableHeader>
          <TableBody>
            {data?.items.map((a) => (
              <Fragment key={a.id}>
                <TableRow className="cursor-pointer" onClick={() => setOpen(open === a.id ? null : a.id)}>
                  <TableCell className="whitespace-nowrap text-sm">{dateTime(a.occurredAt)}</TableCell>
                  <TableCell className="text-sm">{a.actorLabel ?? a.actorType}</TableCell>
                  <TableCell><Badge variant="outline" className="font-mono text-xs">{a.action}</Badge></TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{a.resourceType}{a.resourceId ? `:${a.resourceId.slice(0, 8)}` : ''}</TableCell>
                  <TableCell className={`text-sm font-medium ${RESULT_TONE[a.result] ?? ''}`}>{a.result}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{a.ip}</TableCell>
                </TableRow>
                {open === a.id && (
                  <TableRow><TableCell colSpan={6}><pre className="max-h-72 overflow-auto rounded bg-muted p-3 text-xs">{JSON.stringify({ changes: a.changes, metadata: a.metadata, requestId: a.requestId }, null, 2)}</pre></TableCell></TableRow>
                )}
              </Fragment>
            ))}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between border-t px-4 py-2 text-sm text-muted-foreground">
          <span>Jami: {data?.total ?? 0}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={s.page <= 1} onClick={() => set({ page: s.page - 1 })}>Oldingi</Button>
            <span className="px-2 py-1">{s.page} / {pages || 1}</span>
            <Button variant="outline" size="sm" disabled={s.page >= pages} onClick={() => set({ page: s.page + 1 })}>Keyingi</Button>
          </div>
        </div>
      </div>
    </>
  );
}
