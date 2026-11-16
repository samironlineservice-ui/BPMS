import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Check, CheckCheck, CircleSlash, FileMinus, Ban, Rocket, RotateCcw, Wallet } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { ApprovalInboxItem } from '@ads/contracts';
import { Money } from '@/components/common/money';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { handleApiError } from '@/lib/errors';
import { ago, dateTime } from '@/lib/format';
import { inboxQuery, MONEY_KEYS } from '@/features/billing/api';

export const Route = createFileRoute('/_app/approvals/')({ component: ApprovalsPage });

const ICONS: Record<string, React.ReactNode> = {
  PAYMENT: <Wallet className="size-5 text-primary" />, REFUND: <RotateCcw className="size-5 text-warning" />,
  credit_notes: <FileMinus className="size-5 text-primary" />, 'invoices.void': <Ban className="size-5 text-destructive" />, 'deployments.production': <Rocket className="size-5 text-primary" />,
};
const KIND_LABEL: Record<string, string> = { PAYMENT: "Qo'lda to'lov", REFUND: 'Refund', APPROVAL: "So'rov" };

function resourceLink(i: ApprovalInboxItem) {
  if (!i.resourceId) return null;
  if (i.resourceType === 'payment') return <Link to="/payments/$paymentId" params={{ paymentId: i.resourceId }} className="text-xs text-primary hover:underline">ochish →</Link>;
  if (i.resourceType === 'invoice') return <Link to="/invoices/$invoiceId" params={{ invoiceId: i.resourceId }} className="text-xs text-primary hover:underline">ochish →</Link>;
  return null;
}

function Item({ i }: { i: ApprovalInboxItem }) {
  const qc = useQueryClient();
  const [comment, setComment] = useState('');
  const m = useMutation({
    mutationFn: (approve: boolean) => {
      if (i.kind === 'PAYMENT') return approve ? api.post(`/payments/${i.id}/approve`) : api.post(`/payments/${i.id}/reject`, { reason: comment || 'Rad etildi' });
      if (i.kind === 'REFUND') return api.post(`/payments/refunds/${i.id}/decide`, { approve, reason: comment || undefined });
      return api.post(`/approvals/${i.id}/decide`, { approve, comment: comment || undefined });
    },
    onSuccess: (_r, approve) => { toast.success(approve ? 'Tasdiqlandi' : 'Rad etildi'); for (const k of MONEY_KEYS) void qc.invalidateQueries({ queryKey: k }); },
    onError: (e) => handleApiError(e),
  });
  return (
    <Card>
      <CardContent className="flex flex-wrap items-start gap-4 pt-6">
        <div className="mt-0.5">{ICONS[i.policyKey ?? i.kind] ?? ICONS[i.kind]}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{i.title}</span><Badge variant="outline">{KIND_LABEL[i.kind]}</Badge>{resourceLink(i)}</div>
          <div className="text-sm text-muted-foreground">{i.description}</div>
          <div className="mt-1 text-xs text-muted-foreground">{i.requestedBy} · {ago(i.createdAt)}</div>
        </div>
        {i.amountMinor && i.currency && <Money minor={i.amountMinor} currency={i.currency} className="text-lg font-semibold" />}
        {i.canDecide ? (
          <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
            <Input className="h-8 w-48" placeholder="Izoh (ixtiyoriy)" value={comment} onChange={(e) => setComment(e.target.value)} />
            <Button size="sm" variant="outline" disabled={m.isPending} onClick={() => m.mutate(false)}><CircleSlash className="mr-1 size-4" />Rad etish</Button>
            <Button size="sm" disabled={m.isPending} onClick={() => m.mutate(true)}><Check className="mr-1 size-4" />Tasdiqlash</Button>
          </div>
        ) : <Badge variant="secondary">Boshqa tasdiqlovchi kutilmoqda</Badge>}
      </CardContent>
    </Card>
  );
}

interface HistoryRow { id: string; policyKey: string; status: string; resourceType: string; resourceId: string | null; requestedBy: string; createdAt: string; decidedAt: string; decisions: { approver: string; approve: boolean; comment: string | null; at: string }[] }

function ApprovalsPage() {
  const { data, isLoading } = useQuery(inboxQuery);
  const history = useQuery({ queryKey: ['approvals', 'history'], queryFn: () => api.get<HistoryRow[]>('/approvals/history') });
  return (
    <>
      <PageHeader title="Tasdiqlar" description="Qo'lda to'lovlar, refund, credit note, invoice bekor qilish va prod deploymentlar — rahbar (yoki u ruxsat bergan xodim) tasdiqlaydi" />
      <Tabs defaultValue="inbox">
        <TabsList><TabsTrigger value="inbox">Kutilmoqda ({data?.length ?? 0})</TabsTrigger><TabsTrigger value="history">Tarix</TabsTrigger></TabsList>
        <TabsContent value="inbox" className="grid gap-3">
          {data?.map((i) => <Item key={`${i.kind}:${i.id}`} i={i} />)}
          {!isLoading && !data?.length && (
            <Card><CardContent className="flex flex-col items-center gap-2 py-12 text-sm text-muted-foreground"><CheckCheck className="size-8 text-success" />Hammasi ko'rib chiqilgan</CardContent></Card>
          )}
        </TabsContent>
        <TabsContent value="history" className="grid gap-2">
          {history.data?.map((h) => (
            <div key={h.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-card p-3 text-sm">
              <div>
                <div className="flex items-center gap-2"><span className="font-medium">{h.policyKey}</span><StatusBadge status={h.status} /></div>
                <div className="text-xs text-muted-foreground">So'radi: {h.requestedBy} · {dateTime(h.createdAt)}</div>
                {h.decisions.map((d, k) => <div key={k} className="text-xs text-muted-foreground">{d.approve ? '✓' : '✗'} {d.approver} · {dateTime(d.at)}{d.comment ? ` — ${d.comment}` : ''}</div>)}
              </div>
            </div>
          ))}
          {history.data && !history.data.length && <p className="text-sm text-muted-foreground">Tarix bo'sh</p>}
        </TabsContent>
      </Tabs>
    </>
  );
}
