import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { ArchiveX, ArrowLeft, BadgeCheck, Ban, Download, Megaphone, Plus, Rocket, Save, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Confirm } from '@/components/common/confirm';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { useCan } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { bytes, date, dateTime } from '@/lib/format';
import { ReasonDialog } from '@/features/billing/money-dialogs';
import { ResourceHistory } from '@/features/common-audit';
import { ARCH_LABELS, ARTIFACT_KIND_LABELS, DEVICE_KEYS, releaseQuery } from '@/features/devices/api';
import { DeploymentCreateSheet } from '@/features/devices/deployment-forms';
import { ArtifactDialog } from '@/features/devices/release-forms';
import { downloadUrl } from '@/features/files/api';
import { PLATFORM_LABELS } from '@/features/projects/api';

export const Route = createFileRoute('/_app/releases/$releaseId')({ component: ReleasePage });

function ReleasePage() {
  const { releaseId } = Route.useParams();
  const { data: r, isLoading } = useQuery(releaseQuery(releaseId));
  const can = useCan();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [notes, setNotes] = useState('');
  useEffect(() => { if (r) setNotes(r.notes); }, [r?.id, r?.notes]); // eslint-disable-line react-hooks/exhaustive-deps
  const refresh = () => { for (const k of DEVICE_KEYS) void qc.invalidateQueries({ queryKey: k }); };
  const act = useMutation({
    mutationFn: (x: { path: string; body?: unknown; ok: string }) => api.post(x.path, x.body ?? {}).then(() => x.ok),
    onSuccess: (ok) => { toast.success(ok); refresh(); },
    onError: (e) => handleApiError(e),
  });
  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!r) return null;
  const draft = r.status === 'DRAFT';
  const deployable = r.status === 'READY' || r.status === 'PUBLISHED';
  const freeChannels = r.availableChannels.filter((c) => !r.channels.includes(c.key));
  return (
    <>
      <Link to="/releases" className="mb-3 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="mr-1 size-4" />Versiyalar</Link>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3"><span className="font-mono">{r.version}</span><StatusBadge status={r.status} />{r.channels.map((c) => <Badge key={c} variant="outline">{c}</Badge>)}{r.securityFix && <Badge variant="destructive">xavfsizlik</Badge>}</span>}
        description={<span><Link to="/projects/$projectId" params={{ projectId: r.projectId }} className="hover:underline">{r.projectName}</Link> · {r.componentName} <span className="font-mono text-xs">({r.componentKey})</span> · versionCode {r.versionCode}</span>}
        actions={
          <>
            {draft && can('releases:create') && <ArtifactDialog release={r} trigger={<Button variant="outline"><Plus className="mr-2 size-4" />Fayl</Button>} />}
            {draft && can('releases:publish') && (
              <Confirm title="Versiyani tayyor deb belgilash" description={r.artifactCount ? "Fayllar va hash'lar muzlatiladi — keyin o'zgartirib bo'lmaydi." : "Fayl qo'shilmagan. Kod mustaqil yetkazilsa bo'ladi, lekin agent bosqichida fayl talab qilinadi."}
                trigger={<Button><BadgeCheck className="mr-2 size-4" />Tayyor</Button>} onConfirm={() => act.mutateAsync({ path: `/releases/${r.id}/ready`, ok: 'Versiya tayyor' })} />
            )}
            {deployable && can('releases:publish') && freeChannels.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="outline"><Megaphone className="mr-2 size-4" />Kanalga chiqarish</Button></DropdownMenuTrigger>
                <DropdownMenuContent>{freeChannels.map((c) => <DropdownMenuItem key={c.key} onSelect={() => act.mutate({ path: `/releases/${r.id}/promote`, body: { channelKey: c.key }, ok: `${c.name} kanaliga chiqarildi` })}>{c.name}</DropdownMenuItem>)}</DropdownMenuContent>
              </DropdownMenu>
            )}
            {deployable && can('deployments:create') && <DeploymentCreateSheet releaseId={r.id} trigger={<Button><Rocket className="mr-2 size-4" />O'rnatish (deployment)</Button>} />}
            {deployable && can('releases:publish') && (
              <Confirm title="Eskirgan deb belgilash" description="Yangi deploymentlarda tavsiya etilmaydi. Mavjud o'rnatmalarga ta'sir qilmaydi."
                trigger={<Button variant="outline"><ArchiveX className="mr-2 size-4" />Eskirgan</Button>} onConfirm={() => act.mutateAsync({ path: `/releases/${r.id}/deprecate`, ok: 'Eskirgan deb belgilandi' })} />
            )}
            {!draft && r.status !== 'REVOKED' && can('releases:revoke') && (
              <ReasonDialog title="Versiyani bekor qilish" description="Kutilayotgan o'rnatishlar bekor qilinadi, yangi deployment taqiqlanadi. Qaytarib bo'lmaydi." destructive confirmText="Bekor qilish"
                trigger={<Button variant="destructive"><Ban className="mr-2 size-4" />Bekor qilish</Button>}
                onSubmit={(p) => api.post(`/releases/${r.id}/revoke`, { reason: p.reason }).then(() => { toast.success('Bekor qilindi'); refresh(); })} />
            )}
            {draft && can('releases:create') && (
              <Confirm destructive title="Qoralamani o'chirish" trigger={<Button variant="ghost" size="icon" aria-label="O'chirish"><Trash2 className="size-4" /></Button>}
                onConfirm={async () => { try { await api.delete(`/releases/${r.id}`); refresh(); void navigate({ to: '/releases' }); } catch (e) { handleApiError(e); } }} />
            )}
          </>
        }
      />
      {r.status === 'REVOKED' && <Alert variant="destructive" className="mb-4"><AlertTitle>Bekor qilingan</AlertTitle><AlertDescription>{dateTime(r.revokedAt)} — {r.revokeReason}</AlertDescription></Alert>}
      {draft && <Alert className="mb-4"><AlertTitle>Qoralama</AlertTitle><AlertDescription>Fayllarni qo'shing va "Tayyor" qiling. Tayyor versiya o'zgarmaydi; xato bo'lsa — yangi versiya chiqariladi.</AlertDescription></Alert>}
      <Tabs defaultValue="artifacts">
        <TabsList>
          <TabsTrigger value="artifacts">Fayllar ({r.artifacts.length})</TabsTrigger>
          <TabsTrigger value="notes">O'zgarishlar</TabsTrigger>
          <TabsTrigger value="deployments">Deploymentlar ({r.deployments.length})</TabsTrigger>
          <TabsTrigger value="history">Tarix</TabsTrigger>
        </TabsList>
        <TabsContent value="artifacts">
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader><TableRow><TableHead>Platforma</TableHead><TableHead>Turi</TableHead><TableHead>Fayl</TableHead><TableHead className="text-right">Hajmi</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {r.artifacts.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>{PLATFORM_LABELS[a.platform] ?? a.platform} · {ARCH_LABELS[a.arch] ?? a.arch}{a.variant && <Badge variant="outline" className="ml-2">{a.variant}</Badge>}</TableCell>
                    <TableCell className="text-sm">{ARTIFACT_KIND_LABELS[a.kind]}</TableCell>
                    <TableCell><div className="text-sm">{a.fileName}</div><div className="max-w-md truncate font-mono text-[10px] text-muted-foreground" title={a.tufTargetPath}>sha256 {a.sha256}</div></TableCell>
                    <TableCell className="text-right text-sm">{bytes(a.sizeBytes)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" asChild><a href={downloadUrl(a.fileId)} aria-label="Yuklab olish"><Download className="size-4" /></a></Button>
                        {draft && can('releases:create') && (
                          <Confirm title="Faylni olib tashlash" trigger={<Button variant="ghost" size="icon" aria-label="Olib tashlash"><Trash2 className="size-4" /></Button>}
                            onConfirm={async () => { try { await api.delete(`/releases/${r.id}/artifacts/${a.id}`); refresh(); } catch (e) { handleApiError(e); } }} />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {!r.artifacts.length && <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">Fayllar yo'q</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
        <TabsContent value="notes">
          <Card className="max-w-3xl">
            <CardHeader><CardTitle className="text-base">Release notes</CardTitle></CardHeader>
            <CardContent className="grid gap-3">
              {can('releases:create')
                ? <><Textarea rows={10} value={notes} onChange={(e) => setNotes(e.target.value)} />
                  <div><Button size="sm" disabled={notes === r.notes || act.isPending} onClick={async () => { try { await api.patch(`/releases/${r.id}/notes`, { notes }); toast.success('Saqlandi'); refresh(); } catch (e) { handleApiError(e); } }}><Save className="mr-2 size-4" />Saqlash</Button></div></>
                : <pre className="whitespace-pre-wrap text-sm">{r.notes || '—'}</pre>}
              <p className="text-xs text-muted-foreground">Yaratgan: {r.createdBy} · {date(r.createdAt)}{r.publishedBy ? ` · chiqargan: ${r.publishedBy} (${date(r.publishedAt)})` : ''}</p>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="deployments" className="grid gap-2">
          {r.deployments.map((d) => (
            <Link key={d.id} to="/deployments/$deploymentId" params={{ deploymentId: d.id }} className="flex items-center justify-between rounded-md border bg-card p-3 text-sm hover:border-primary/50">
              <span className="font-mono">{d.code}</span><span className="flex items-center gap-3"><span className="text-muted-foreground">{d.targets} ta qurilma · {date(d.createdAt)}</span><StatusBadge status={d.status} /></span>
            </Link>
          ))}
          {!r.deployments.length && <p className="text-sm text-muted-foreground">Deploymentlar yo'q</p>}
        </TabsContent>
        <TabsContent value="history"><Card><CardContent className="pt-6"><ResourceHistory resourceType="release" resourceId={r.id} /></CardContent></Card></TabsContent>
      </Tabs>
    </>
  );
}
