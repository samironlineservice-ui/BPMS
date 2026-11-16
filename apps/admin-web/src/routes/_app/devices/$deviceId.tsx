import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft, Ban, Pencil, Plus, Power, PowerOff } from 'lucide-react';
import { toast } from 'sonner';
import { Confirm } from '@/components/common/confirm';
import { DetailList } from '@/components/common/detail-list';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { useCan } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { dateTime } from '@/lib/format';
import { ReasonDialog } from '@/features/billing/money-dialogs';
import { ResourceHistory } from '@/features/common-audit';
import { ARCH_LABELS, CLASS_LABELS, DEVICE_KEYS, deviceQuery, MODE_LABELS } from '@/features/devices/api';
import { DeviceFormSheet, InstallationDialog } from '@/features/devices/device-forms';
import { ClassIcon } from '@/features/devices/tables';
import { PLATFORM_LABELS, RUNTIME_LABELS } from '@/features/projects/api';

export const Route = createFileRoute('/_app/devices/$deviceId')({ component: DevicePage });

function DevicePage() {
  const { deviceId } = Route.useParams();
  const { data: d, isLoading } = useQuery(deviceQuery(deviceId));
  const can = useCan();
  const qc = useQueryClient();
  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!d) return null;
  const refresh = () => { for (const k of DEVICE_KEYS) void qc.invalidateQueries({ queryKey: k }); };
  const setStatus = async (status: string, reason?: string) => {
    try { await api.post(`/devices/${d.id}/status`, { status, reason, rowVersion: d.rowVersion }); toast.success('Saqlandi'); refresh(); } catch (e) { handleApiError(e); }
  };
  const retired = d.status === 'DECOMMISSIONED' || d.status === 'REVOKED';
  const edit = can('devices:update') && !retired;
  return (
    <>
      <Link to="/devices" className="mb-3 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="mr-1 size-4" />Qurilmalar</Link>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3"><ClassIcon cls={d.deviceClass} />{d.name}<StatusBadge status={d.status} />{d.tags.map((t) => <Badge key={t} variant="secondary">{t}</Badge>)}</span>}
        description={<span><span className="font-mono">{d.code}</span> · {d.client ? <Link to="/clients/$clientId" params={{ clientId: d.client.id }} className="hover:underline">{d.client.name}</Link> : 'Kompaniya qurilmasi'}{d.site ? ` · ${d.site.name}` : ''}</span>}
        actions={edit && (
          <>
            <DeviceFormSheet device={d} trigger={<Button variant="outline"><Pencil className="mr-2 size-4" />Tahrirlash</Button>} />
            {d.status === 'ACTIVE'
              ? <Button variant="outline" onClick={() => setStatus('DISABLED')}><PowerOff className="mr-2 size-4" />O'chirish</Button>
              : <Button variant="outline" onClick={() => setStatus('ACTIVE')}><Power className="mr-2 size-4" />Yoqish</Button>}
            {can('devices:decommission') && (
              <ReasonDialog title="Foydalanishdan chiqarish" description="Qurilma arxivlanadi, undagi barcha komponentlar o'chirilgan deb belgilanadi. Qaytarib bo'lmaydi." destructive confirmText="Chiqarish"
                trigger={<Button variant="destructive"><Ban className="mr-2 size-4" />Chiqarish</Button>}
                onSubmit={(p) => api.post(`/devices/${d.id}/status`, { status: 'DECOMMISSIONED', reason: p.reason, rowVersion: d.rowVersion }).then(() => { toast.success('Foydalanishdan chiqarildi'); refresh(); })} />
            )}
          </>
        )}
      />
      {retired && <Alert variant="destructive" className="mb-4"><AlertTitle>Foydalanishdan chiqarilgan</AlertTitle><AlertDescription>{dateTime(d.revokedAt)} — {d.revokeReason}</AlertDescription></Alert>}
      <Tabs defaultValue="installations">
        <TabsList>
          <TabsTrigger value="installations">Komponentlar ({d.installations.filter((i) => i.status !== 'UNINSTALLED').length})</TabsTrigger>
          <TabsTrigger value="info">Ma'lumot</TabsTrigger>
          <TabsTrigger value="deployments">Deploymentlar ({d.recentTargets.length})</TabsTrigger>
          <TabsTrigger value="history">Tarix</TabsTrigger>
        </TabsList>
        <TabsContent value="installations" className="grid gap-3">
          {edit && <div><InstallationDialog device={d} trigger={<Button size="sm"><Plus className="mr-2 size-4" />Komponent qo'shish</Button>} /></div>}
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader><TableRow><TableHead>Komponent</TableHead><TableHead>Loyiha / mijoz</TableHead><TableHead>Versiya</TableHead><TableHead>Holat</TableHead><TableHead>Yangilangan</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {d.installations.map((i) => (
                  <TableRow key={i.id} className={i.status === 'UNINSTALLED' ? 'text-muted-foreground' : undefined}>
                    <TableCell><div className="font-medium">{i.componentName}{i.instanceName && <span className="text-xs text-muted-foreground"> · {i.instanceName}</span>}</div><div className="text-xs text-muted-foreground">{RUNTIME_LABELS[i.runtime]}</div></TableCell>
                    <TableCell className="text-sm"><Link to="/projects/$projectId" params={{ projectId: i.projectId }} className="hover:underline">{i.projectName}</Link><div className="text-xs text-muted-foreground">{i.clientName ?? 'umumiy instans'}</div></TableCell>
                    <TableCell><span className="font-mono">{i.currentVersion ?? '—'}</span>{i.pinnedVersion && <Badge variant="outline" className="ml-2">qotirilgan {i.pinnedVersion}</Badge>}{i.lastError && <div className="max-w-xs truncate text-xs text-destructive">{i.lastError}</div>}</TableCell>
                    <TableCell><StatusBadge status={i.status} /></TableCell>
                    <TableCell className="text-sm text-muted-foreground">{dateTime(i.lastReportedAt ?? i.updatedAt)}</TableCell>
                    <TableCell className="text-right">
                      {edit && i.status !== 'UNINSTALLED' && (
                        <div className="flex justify-end gap-1">
                          <InstallationDialog device={d} installation={i} trigger={<Button variant="ghost" size="icon" aria-label="Tahrirlash"><Pencil className="size-4" /></Button>} />
                          <Confirm title={`${i.componentName} o'chirilgan deb belgilash`} description="Qurilmada endi bu komponent ishlamaydi."
                            trigger={<Button variant="ghost" size="icon" aria-label="O'chirish"><PowerOff className="size-4" /></Button>}
                            onConfirm={async () => { try { await api.patch(`/devices/${d.id}/installations/${i.id}`, { status: 'UNINSTALLED' }); refresh(); } catch (e) { handleApiError(e); } }} />
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {!d.installations.length && <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">Qurilmada qaysi loyiha qismi ishlashini qo'shing</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
        <TabsContent value="info">
          <Card className="max-w-3xl">
            <CardHeader><CardTitle className="text-base">Texnik ma'lumot</CardTitle></CardHeader>
            <CardContent>
              <DetailList items={[
                ['Turi', CLASS_LABELS[d.deviceClass]], ['Platforma', `${PLATFORM_LABELS[d.platform] ?? d.platform} · ${ARCH_LABELS[d.arch] ?? d.arch}`],
                ['Boshqaruv', MODE_LABELS[d.managementMode]], ['Gateway', d.gateway && <Link to="/devices/$deviceId" params={{ deviceId: d.gateway.id }} className="hover:underline">{d.gateway.name} ({d.gateway.code})</Link>],
                ['Hostname', d.hostname && <span className="font-mono">{d.hostname}</span>], ['OS', [d.osName, d.osVersion].filter(Boolean).join(' ')],
                ['Agent', d.agentVersion ?? "hali ulanmagan (agent — keyingi bosqich)"], ['Avtomatik yangilanish', d.autoUpdate ? 'Ha' : "Yo'q"],
                ['Izoh', d.notes && <span className="whitespace-pre-wrap">{d.notes}</span>], ["Ro'yxatga olingan", dateTime(d.createdAt)],
              ]} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="deployments">
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader><TableRow><TableHead>Deployment</TableHead><TableHead>Komponent</TableHead><TableHead>Versiya</TableHead><TableHead>Natija</TableHead><TableHead>Vaqt</TableHead></TableRow></TableHeader>
              <TableBody>
                {d.recentTargets.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell><Link to="/deployments/$deploymentId" params={{ deploymentId: t.deploymentId }} className="font-mono text-xs hover:underline">{t.deploymentCode}</Link></TableCell>
                    <TableCell>{t.componentName}</TableCell><TableCell className="font-mono">{t.toVersion}</TableCell>
                    <TableCell><StatusBadge status={t.status} /></TableCell><TableCell className="text-sm text-muted-foreground">{dateTime(t.updatedAt)}</TableCell>
                  </TableRow>
                ))}
                {!d.recentTargets.length && <TableRow><TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">Deploymentlar yo'q</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
        <TabsContent value="history"><Card><CardContent className="pt-6"><ResourceHistory resourceType="device" resourceId={d.id} /></CardContent></Card></TabsContent>
      </Tabs>
    </>
  );
}
