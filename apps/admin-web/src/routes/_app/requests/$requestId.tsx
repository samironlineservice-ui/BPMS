import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft, Cpu, Lock, Repeat, Send, Users } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { REQUEST_CATEGORY_LABELS, REQUEST_STATUS_LABELS } from '@ads/contracts';
import { DetailList } from '@/components/common/detail-list';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { staffLookupQuery } from '@/features/clients/api';
import { requestQuery } from '@/features/requests/api';
import { RequestStatusBadge } from '@/features/requests/components';
import { api } from '@/lib/api';
import { useCan } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { dateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/requests/$requestId')({ component: RequestPage });
const NOBODY = '__none__';

function RequestPage() {
  const { requestId } = Route.useParams();
  const can = useCan();
  const manage = can('requests:manage');
  const qc = useQueryClient();
  const [body, setBody] = useState('');
  const [internal, setInternal] = useState(false);
  const { data: r, isLoading } = useQuery({ ...requestQuery(requestId), refetchInterval: 30_000 });
  const staff = useQuery({ ...staffLookupQuery, enabled: manage });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['requests'] });
  const reply = useMutation({
    mutationFn: () => api.post(`/requests/${requestId}/messages`, { body, internal }),
    onSuccess: () => { setBody(''); setInternal(false); refresh(); },
    onError: (e) => handleApiError(e),
  });
  const status = useMutation({
    mutationFn: (s: string) => api.post(`/requests/${requestId}/status`, { status: s }),
    onSuccess: () => { toast.success('Holat yangilandi'); refresh(); },
    onError: (e) => handleApiError(e),
  });
  const assign = useMutation({
    mutationFn: (id: string | null) => api.post(`/requests/${requestId}/assign`, { assigneeId: id }),
    onSuccess: () => { toast.success("Mas'ul yangilandi"); refresh(); },
    onError: (e) => handleApiError(e),
  });
  if (isLoading) return <Skeleton className="h-64" />;
  if (!r) return null;
  return (
    <>
      <Link to="/requests" className="mb-3 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="mr-1 size-4" />Murojaatlar</Link>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">{r.subject}<RequestStatusBadge status={r.status} /></span>}
        description={<><span className="font-mono">{r.code}</span> · {REQUEST_CATEGORY_LABELS[r.category] ?? r.category} · {dateTime(r.createdAt)} · {r.createdBy}</>}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="grid content-start gap-4 lg:col-span-2">
          <Card>
            <CardContent className="grid gap-4">
              {r.messages.map((m) => {
                const client = m.author === 'CLIENT';
                return (
                  <div key={m.id} className={cn('flex', client ? 'justify-start' : 'justify-end')}>
                    <div className={cn('max-w-[85%] rounded-lg px-4 py-3 text-sm',
                      m.internal ? 'border border-warning/50 bg-warning/10' : client ? 'border bg-muted/50' : 'bg-primary text-primary-foreground')}>
                      <div className={cn('mb-1 flex flex-wrap items-center gap-x-2 text-xs', !m.internal && !client ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
                        {m.internal && <span className="flex items-center gap-1 font-medium text-warning"><Lock className="size-3" />Ichki izoh</span>}
                        <span className="font-medium">{m.authorName}{client ? ` · ${r.client.name}` : ''}</span><span>{dateTime(m.createdAt)}</span>
                      </div>
                      <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
          {manage && (
            <Card>
              <CardContent className="grid gap-3">
                <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} maxLength={5000}
                  placeholder={internal ? "Ichki izoh (mijozga ko'rinmaydi)…" : 'Mijozga javob…'} className={cn(internal && 'border-warning/60 bg-warning/5')}
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && body.trim()) reply.mutate(); }} />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label className="flex items-center gap-2 text-sm font-normal"><Checkbox checked={internal} onCheckedChange={(v) => setInternal(v === true)} />Ichki izoh (mijozga ko'rinmaydi)</Label>
                  <Button disabled={!body.trim() || reply.isPending} onClick={() => reply.mutate()} variant={internal ? 'outline' : 'default'}>
                    {internal ? <Lock className="mr-2 size-4" /> : <Send className="mr-2 size-4" />}{internal ? 'Izohni saqlash' : 'Javob yuborish'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
        <div className="grid content-start gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Ma'lumot</CardTitle></CardHeader>
            <CardContent>
              <DetailList items={[
                ['Mijoz', <Link key="c" to="/clients/$clientId" params={{ clientId: r.client.id }} className="flex items-center gap-1.5 text-primary hover:underline"><Users className="size-3.5" />{r.client.name}</Link>],
                ['Obuna', r.subscription ? <Link key="s" to="/subscriptions/$subscriptionId" params={{ subscriptionId: r.subscription.id }} className="flex items-center gap-1.5 text-primary hover:underline"><Repeat className="size-3.5" />{r.subscription.projectName} · {r.subscription.code}</Link> : '—'],
                ['Qurilma', r.device ? <Link key="d" to="/devices/$deviceId" params={{ deviceId: r.device.id }} className="flex items-center gap-1.5 text-primary hover:underline"><Cpu className="size-3.5" />{r.device.name}</Link> : '—'],
                ['Yopilgan', r.closedAt ? dateTime(r.closedAt) : '—'],
              ]} />
            </CardContent>
          </Card>
          {manage && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Boshqarish</CardTitle></CardHeader>
              <CardContent className="grid gap-3">
                <div className="grid gap-1.5">
                  <Label>Holat</Label>
                  <Select value={r.status} onValueChange={(v) => status.mutate(v)} disabled={status.isPending}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(REQUEST_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Mas'ul xodim</Label>
                  <Select value={r.assignee?.id ?? NOBODY} onValueChange={(v) => assign.mutate(v === NOBODY ? null : v)} disabled={assign.isPending}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NOBODY}>— biriktirilmagan —</SelectItem>
                      {staff.data?.map((u) => <SelectItem key={u.id} value={u.id}>{u.fullName}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-muted-foreground">Birinchi javob bergan xodim avtomatik mas'ul bo'ladi. Mijoz javob yozsa, mas'ulga bildirishnoma keladi.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
