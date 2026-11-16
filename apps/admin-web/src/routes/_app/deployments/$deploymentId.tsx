import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft, Check, CircleX, Hourglass, ListChecks, Pause, Play, Send, SkipForward, Undo2, Wrench, XCircle } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { DeploymentDetail, DeploymentTargetDto } from '@ads/contracts';
import { Confirm } from '@/components/common/confirm';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { useCan } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { dateTime } from '@/lib/format';
import { ReasonDialog } from '@/features/billing/money-dialogs';
import { ResourceHistory } from '@/features/common-audit';
import { DEVICE_KEYS, deploymentQuery, targetEventsQuery } from '@/features/devices/api';

export const Route = createFileRoute('/_app/deployments/$deploymentId')({ component: DeploymentPage });

const OPEN = ['PENDING', 'WAITING_WINDOW', 'DOWNLOADING', 'DOWNLOADED', 'INSTALLING', 'VERIFYING', 'BLOCKED_ENTITLEMENT'];

function Events({ d, t }: { d: DeploymentDetail; t: DeploymentTargetDto }) {
  const [open, setOpen] = useState(false);
  const { data } = useQuery({ ...targetEventsQuery(d.id, t.id), enabled: open });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="ghost" size="icon" aria-label="Jurnal"><ListChecks className="size-4" /></Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{t.deviceName} — jurnal</DialogTitle></DialogHeader>
        <ol className="grid gap-2 text-sm">
          {data?.map((e) => <li key={e.id} className="flex flex-wrap items-center gap-2"><StatusBadge status={e.status} /><span className="text-muted-foreground">{dateTime(e.receivedAt)}{e.by ? ` · ${e.by}` : ''}</span>{e.message && <span className="w-full pl-1">{e.message}</span>}</li>)}
          {data && !data.length && <li className="text-muted-foreground">Yozuvlar yo'q</li>}
        </ol>
      </DialogContent>
    </Dialog>
  );
}

/** Qo'lda natija: holat + izoh (xato sababi, qilingan ishlar). */
function TargetActions({ d, t }: { d: DeploymentDetail; t: DeploymentTargetDto }) {
  const [status, setStatus] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => api.patch(`/deployments/${d.id}/targets/${t.id}`, { status, message: message || null }),
    onSuccess: () => { toast.success('Belgilandi'); setStatus(null); setMessage(''); for (const k of DEVICE_KEYS) void qc.invalidateQueries({ queryKey: k }); },
    onError: (e) => handleApiError(e),
  });
  const running = d.status === 'RUNNING' || d.status === 'PAUSED';
  const options: [string, string, React.ReactNode][] = OPEN.includes(t.status) || t.status === 'FAILED'
    ? [['INSTALLING', "O'rnatilmoqda", <Wrench key="i" className="size-4" />], ['SUCCEEDED', 'Muvaffaqiyatli', <Check key="s" className="size-4" />], ['FAILED', 'Xato', <CircleX key="f" className="size-4" />], ['SKIPPED', "O'tkazib yuborish", <SkipForward key="k" className="size-4" />]]
    : t.status === 'SUCCEEDED' ? [['ROLLED_BACK', 'Orqaga qaytarildi', <Undo2 key="r" className="size-4" />]] : [];
  if (!running || !options.length) return null;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button size="sm" variant="outline">Natija</Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">{options.filter(([k]) => k !== t.status).map(([k, l, icon]) => <DropdownMenuItem key={k} onSelect={() => setStatus(k)}>{icon}{l}</DropdownMenuItem>)}</DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={!!status} onOpenChange={(o) => { if (!o) setStatus(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t.deviceName}: <StatusBadge status={status ?? ''} /></DialogTitle></DialogHeader>
          <Textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={status === 'FAILED' ? 'Xato sababi (log, xabar)…' : 'Izoh (ixtiyoriy)'} />
          <DialogFooter><Button disabled={m.isPending || (status === 'FAILED' && !message.trim())} onClick={() => m.mutate()}>Saqlash</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function DeploymentPage() {
  const { deploymentId } = Route.useParams();
  const { data: d, isLoading } = useQuery(deploymentQuery(deploymentId));
  const can = useCan();
  const qc = useQueryClient();
  const act = useMutation({
    mutationFn: (x: { path: string; body?: unknown; ok: string }) => api.post(x.path, x.body ?? {}).then(() => x.ok),
    onSuccess: (ok) => { toast.success(ok); for (const k of DEVICE_KEYS) void qc.invalidateQueries({ queryKey: k }); },
    onError: (e) => handleApiError(e),
  });
  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!d) return null;
  const done = d.succeeded + d.failed;
  const editable = can('deployments:update');
  return (
    <>
      <Link to="/deployments" className="mb-3 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="mr-1 size-4" />Deploymentlar</Link>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3"><span className="font-mono">{d.code}</span><StatusBadge status={d.status} /></span>}
        description={<span>{d.projectName} · {d.componentName} <Link to="/releases/$releaseId" params={{ releaseId: d.releaseId }} className="font-mono hover:underline">{d.version}</Link> · tuzgan {d.createdBy}</span>}
        actions={
          <>
            {d.status === 'DRAFT' && can('deployments:create') && (
              <Button disabled={act.isPending} onClick={() => act.mutate({ path: `/deployments/${d.id}/submit`, ok: "Tasdiqqa yuborildi (yoki tasdiqlash huquqingiz bo'lsa — boshlandi)" })}><Send className="mr-2 size-4" />Tasdiqqa yuborish</Button>
            )}
            {d.status === 'SCHEDULED' && editable && <Button onClick={() => act.mutate({ path: `/deployments/${d.id}/start`, ok: 'Boshlandi' })}><Play className="mr-2 size-4" />Hozir boshlash</Button>}
            {d.status === 'RUNNING' && editable && <Button variant="outline" onClick={() => act.mutate({ path: `/deployments/${d.id}/pause`, ok: "To'xtatildi" })}><Pause className="mr-2 size-4" />To'xtatish</Button>}
            {d.status === 'PAUSED' && editable && <Button onClick={() => act.mutate({ path: `/deployments/${d.id}/resume`, ok: 'Davom etmoqda' })}><Play className="mr-2 size-4" />Davom ettirish</Button>}
            {!['COMPLETED', 'FAILED', 'CANCELLED'].includes(d.status) && editable && (
              <ReasonDialog title="Deploymentni bekor qilish" description="Hali bajarilmagan qurilmalar bekor qilinadi." destructive confirmText="Bekor qilish"
                trigger={<Button variant="destructive"><XCircle className="mr-2 size-4" />Bekor qilish</Button>}
                onSubmit={(p) => api.post(`/deployments/${d.id}/cancel`, { reason: p.reason }).then(() => { toast.success('Bekor qilindi'); for (const k of DEVICE_KEYS) void qc.invalidateQueries({ queryKey: k }); })} />
            )}
          </>
        }
      />
      {d.status === 'PENDING_APPROVAL' && <Alert className="mb-4"><Hourglass className="size-4" /><AlertTitle>Rahbar tasdig'i kutilmoqda</AlertTitle><AlertDescription>Tasdiqlar bo'limida ko'rib chiqiladi. Tasdiqlangach deployment boshlanadi.</AlertDescription></Alert>}
      {d.status === 'DRAFT' && <Alert className="mb-4"><AlertTitle>Reja (qoralama)</AlertTitle><AlertDescription>Qurilmalar ro'yxatini tekshiring va tasdiqqa yuboring.</AlertDescription></Alert>}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="sm:col-span-2"><CardHeader className="pb-2"><CardDescription>Natija</CardDescription><CardTitle className="text-xl">{done} / {d.total}</CardTitle></CardHeader>
          <CardContent className="grid gap-1 pt-0"><Progress value={d.total ? (done / d.total) * 100 : 0} /><span className="text-xs text-muted-foreground">{d.succeeded} muvaffaqiyatli · {d.failed} xato · {d.pending} kutilmoqda</span></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Reja / boshlanish</CardDescription><CardTitle className="text-base">{dateTime(d.startedAt ?? d.scheduledAt)}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Yakunlangan</CardDescription><CardTitle className="text-base">{dateTime(d.completedAt)}</CardTitle></CardHeader></Card>
      </div>
      {d.notes && <p className="mb-4 rounded-md border bg-card p-3 text-sm whitespace-pre-wrap">{d.notes}</p>}
      <Tabs defaultValue="targets">
        <TabsList><TabsTrigger value="targets">Qurilmalar ({d.total})</TabsTrigger><TabsTrigger value="history">Tarix</TabsTrigger></TabsList>
        <TabsContent value="targets">
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader><TableRow><TableHead>Qurilma</TableHead><TableHead>Mijoz</TableHead><TableHead>Versiya</TableHead><TableHead>Holat</TableHead><TableHead>Yangilangan</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {d.targets.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell><Link to="/devices/$deviceId" params={{ deviceId: t.deviceId }} className="font-medium hover:underline">{t.deviceName}</Link><div className="font-mono text-xs text-muted-foreground">{t.deviceCode}{t.instanceName ? ` · ${t.instanceName}` : ''}</div></TableCell>
                    <TableCell className="text-sm">{t.clientName ?? '—'}</TableCell>
                    <TableCell className="font-mono text-sm">{t.fromVersion ?? '—'} → {d.version}</TableCell>
                    <TableCell><StatusBadge status={t.status} />{t.lastError && <div className="max-w-xs truncate text-xs text-destructive" title={t.lastError}>{t.lastError}</div>}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{dateTime(t.finishedAt ?? t.startedAt ?? t.updatedAt)}</TableCell>
                    <TableCell className="text-right"><div className="flex justify-end gap-1"><Events d={d} t={t} />{editable && <TargetActions d={d} t={t} />}</div></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {d.status === 'RUNNING' && editable && d.pending > 1 && (
            <div className="mt-3">
              <Confirm title="Barcha kutilayotganlarni muvaffaqiyatli deb belgilash" description="Faqat haqiqatan o'rnatilgan bo'lsa! Har qurilma uchun alohida yozuv qoladi."
                trigger={<Button variant="outline" size="sm"><Check className="mr-2 size-4" />Hammasi muvaffaqiyatli</Button>}
                onConfirm={async () => {
                  try {
                    for (const t of d.targets.filter((x) => OPEN.includes(x.status))) await api.patch(`/deployments/${d.id}/targets/${t.id}`, { status: 'SUCCEEDED', message: 'Ommaviy belgilandi' });
                    toast.success('Belgilandi');
                  } catch (e) { handleApiError(e); }
                  for (const k of DEVICE_KEYS) void qc.invalidateQueries({ queryKey: k });
                }} />
            </div>
          )}
        </TabsContent>
        <TabsContent value="history"><Card><CardContent className="pt-6"><ResourceHistory resourceType="deployment" resourceId={d.id} /></CardContent></Card></TabsContent>
      </Tabs>
    </>
  );
}
