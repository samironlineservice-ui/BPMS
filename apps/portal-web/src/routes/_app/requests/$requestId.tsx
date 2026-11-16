import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft, CheckCircle2, Cpu, Repeat, Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { type PortalRequestDetail, REQUEST_CATEGORY_LABELS } from '@ads/contracts';
import { PageHeader } from '@/components/common/page-header';
import { RequestStatusBadge } from '@/components/common/request-status';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { api, errorText } from '@/lib/api';
import { date, dateTime } from '@/lib/format';
import { useAccess } from '@/lib/session';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/requests/$requestId')({ component: RequestPage });

function RequestPage() {
  const { requestId } = Route.useParams();
  const access = useAccess();
  const qc = useQueryClient();
  const [body, setBody] = useState('');
  const [confirm, setConfirm] = useState(false);
  const { data: r, isLoading } = useQuery({ queryKey: ['requests', requestId], queryFn: () => api.get<PortalRequestDetail>(`/requests/${requestId}`), refetchInterval: 30_000 });
  // Ochilganda server "o'qildi" deb belgilaydi — menyudagi belgini darhol yangilaymiz
  useEffect(() => { if (r?.id) void qc.invalidateQueries({ queryKey: ['requests'], exact: true }); }, [r?.id, qc]);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['requests'] });
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
  };
  const reply = useMutation({
    mutationFn: () => api.post(`/requests/${requestId}/messages`, { body }),
    onSuccess: () => { setBody(''); refresh(); },
    onError: (e) => toast.error(errorText(e)),
  });
  const close = useMutation({
    mutationFn: () => api.post(`/requests/${requestId}/close`),
    onSuccess: () => { toast.success('Murojaat yopildi'); setConfirm(false); refresh(); },
    onError: (e) => toast.error(errorText(e)),
  });
  if (isLoading) return <Skeleton className="h-64" />;
  if (!r) return null;
  const canWrite = access.writeRequests && r.status !== 'CLOSED';
  return (
    <>
      <Link to="/requests" className="mb-3 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="mr-1 size-4" />Murojaatlar</Link>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">{r.subject}<RequestStatusBadge status={r.status} /></span>}
        description={<><span className="font-mono">{r.code}</span> · {REQUEST_CATEGORY_LABELS[r.category] ?? r.category} · {date(r.createdAt)} · {r.createdBy}</>}
        actions={canWrite && <Button variant="outline" onClick={() => setConfirm(true)}><CheckCircle2 className="mr-2 size-4" />Murojaatni yopish</Button>}
      />
      {(r.subscription || r.device) && (
        <div className="mb-4 flex flex-wrap gap-2 text-sm">
          {r.subscription && (
            <Link to="/subscriptions/$subscriptionId" params={{ subscriptionId: r.subscription.id }} className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 hover:border-primary/50">
              <Repeat className="size-3.5 text-muted-foreground" />{r.subscription.projectName} <span className="font-mono text-xs text-muted-foreground">{r.subscription.code}</span>
            </Link>
          )}
          {r.device && (
            <Link to="/devices" className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 hover:border-primary/50">
              <Cpu className="size-3.5 text-muted-foreground" />{r.device.name} <span className="font-mono text-xs text-muted-foreground">{r.device.code}</span>
            </Link>
          )}
        </div>
      )}
      <Card className="mb-4">
        <CardContent className="grid gap-4">
          {r.messages.map((m) => {
            const mine = m.author === 'CLIENT';
            return (
              <div key={m.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                <div className={cn('max-w-[85%] rounded-lg px-4 py-3 text-sm', mine ? 'bg-primary text-primary-foreground' : 'border bg-muted/50')}>
                  <div className={cn('mb-1 flex flex-wrap items-center gap-x-2 text-xs', mine ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
                    <span className="font-medium">{mine ? m.authorName : `${m.authorName} · ADS jamoasi`}</span><span>{dateTime(m.createdAt)}</span>
                  </div>
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
      {canWrite ? (
        <Card>
          <CardContent className="grid gap-3">
            {r.status === 'RESOLVED' && <p className="text-xs text-muted-foreground">Murojaat "hal qilindi" deb belgilangan. Javob yozsangiz, u qayta ochiladi.</p>}
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} maxLength={5000} placeholder="Javobingiz yoki qo'shimcha ma'lumot…"
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && body.trim()) reply.mutate(); }} />
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">Ctrl+Enter — yuborish</span>
              <Button disabled={!body.trim() || reply.isPending} onClick={() => reply.mutate()}><Send className="mr-2 size-4" />Yuborish</Button>
            </div>
          </CardContent>
        </Card>
      ) : r.status === 'CLOSED' ? (
        <p className="text-sm text-muted-foreground">Murojaat yopilgan{r.closedAt ? ` (${date(r.closedAt)})` : ''}. Yangi savol bo'lsa — <Link to="/requests/new" className="text-primary hover:underline">yangi murojaat yuboring</Link>.</p>
      ) : null}
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Murojaatni yopasizmi?</AlertDialogTitle>
            <AlertDialogDescription>Masala hal bo'lgan bo'lsa, yoping. Yopilgan murojaatga javob yozib bo'lmaydi — kerak bo'lsa yangisini ochasiz.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Bekor qilish</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); close.mutate(); }} disabled={close.isPending}>Yopish</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
