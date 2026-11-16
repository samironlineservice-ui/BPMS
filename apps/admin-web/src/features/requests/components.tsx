import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { toast } from 'sonner';
import { REQUEST_CATEGORY_LABELS, REQUEST_STATUS_LABELS, type RequestListItem, staffRequestCreateSchema } from '@ads/contracts';
import { type Column, DataTable } from '@/components/common/data-table';
import { Field } from '@/components/common/field';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { handleApiError } from '@/lib/errors';
import { ago } from '@/lib/format';
import { cn } from '@/lib/utils';

const TONE: Record<string, string> = {
  OPEN: 'border-primary/30 bg-primary/10 text-primary', IN_PROGRESS: 'border-warning/40 bg-warning/15 text-warning',
  RESOLVED: 'border-success/30 bg-success/15 text-success', CLOSED: 'border-border bg-muted text-muted-foreground',
};
export function RequestStatusBadge({ status }: { status: string }) {
  return <Badge variant="outline" className={cn('font-medium', TONE[status])}>{REQUEST_STATUS_LABELS[status] ?? status}</Badge>;
}

export function RequestsTable({ rows, loading, page, total, onPageChange, hideClient }: {
  rows: RequestListItem[] | undefined; loading?: boolean; page?: number; total?: number; onPageChange?: (p: number) => void; hideClient?: boolean;
}) {
  const navigate = useNavigate();
  const columns: Column<RequestListItem>[] = [
    {
      key: 'subject', header: 'Murojaat',
      cell: (r) => (
        <div className="min-w-0">
          <div className={cn('flex items-center gap-2', r.unread && 'font-semibold')}>{r.unread && <span className="size-2 shrink-0 rounded-full bg-destructive" aria-label="Javob kutmoqda" />}{r.subject}</div>
          <div className="text-xs text-muted-foreground"><span className="font-mono">{r.code}</span> · {REQUEST_CATEGORY_LABELS[r.category] ?? r.category}</div>
        </div>
      ),
    },
    ...(hideClient ? [] : [{ key: 'client', header: 'Mijoz', cell: (r: RequestListItem) => <span className="text-sm">{r.client.name}</span> }]),
    { key: 'status', header: 'Holat', cell: (r) => <RequestStatusBadge status={r.status} /> },
    {
      key: 'last', header: 'Oxirgi xabar',
      cell: (r) => <span className="text-xs text-muted-foreground">{r.lastMessageBy === 'CLIENT' ? 'Mijoz' : 'Xodim'} · {ago(r.lastMessageAt)}</span>,
    },
    { key: 'assignee', header: "Mas'ul", cell: (r) => <span className="text-sm">{r.assignee?.name ?? <span className="text-muted-foreground">—</span>}</span> },
  ];
  return (
    <DataTable columns={columns} rows={rows} loading={loading} rowKey={(r) => r.id} page={page} pageSize={25} total={total} onPageChange={onPageChange}
      onRowClick={(r) => void navigate({ to: '/requests/$requestId', params: { requestId: r.id } })} empty="Murojaatlar yo'q" />
  );
}

/** Xodim mijoz nomidan murojaat ochadi (masalan, telefon qo'ng'irog'idan keyin). */
export function NewRequestDialog({ clientId, open, onOpenChange }: { clientId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [category, setCategory] = useState('SUPPORT');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const m = useMutation({
    mutationFn: (input: unknown) => api.post<{ id: string; code: string }>('/requests', input),
    onSuccess: (r) => {
      toast.success(`Murojaat ochildi: ${r.code}`);
      void qc.invalidateQueries({ queryKey: ['requests'] });
      onOpenChange(false);
      void navigate({ to: '/requests/$requestId', params: { requestId: r.id } });
    },
    onError: (e) => handleApiError(e),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { setSubject(''); setBody(''); setErrors({}); } }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Murojaat ochish</DialogTitle><DialogDescription>Mijoz nomidan (masalan, qo'ng'iroqdan keyin). Mijoz uni kabinetida ko'radi.</DialogDescription></DialogHeader>
        <form className="grid gap-4" onSubmit={(e) => {
          e.preventDefault();
          const r = staffRequestCreateSchema.safeParse({ clientId, category, subject, body });
          if (!r.success) { setErrors(Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message]))); return; }
          m.mutate(r.data);
        }}>
          <Field label="Turi">
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(REQUEST_CATEGORY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Mavzu" error={errors.subject}><Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} /></Field>
          <Field label="Matn" error={errors.body}><Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} maxLength={5000} /></Field>
          <DialogFooter><Button type="submit" disabled={m.isPending}>Ochish</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
