import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { Archive, ArrowLeft, ExternalLink, Pencil, Plus, Trash2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import type { ProjectDetail } from '@ads/contracts';
import { Confirm } from '@/components/common/confirm';
import { DetailList } from '@/components/common/detail-list';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { useCan } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { date } from '@/lib/format';
import { PlansTab } from '@/features/billing/plans-tab';
import { ReleaseCreateDialog } from '@/features/devices/release-forms';
import { ReleasesTable } from '@/features/devices/tables';
import { ResourceHistory } from '@/features/common-audit';
import { EntityFiles } from '@/features/files/entity-files';
import { MEMBER_ROLE_LABELS, PLATFORM_LABELS, projectQuery, RUNTIME_LABELS } from '@/features/projects/api';
import { ClientProjectsTable } from '@/features/projects/client-projects-table';
import { ComponentDialog, MemberDialog, ProjectFormSheet } from '@/features/projects/forms';

export const Route = createFileRoute('/_app/projects/$projectId')({ component: ProjectPage });

function ProjectPage() {
  const { projectId } = Route.useParams();
  const { data: p, isLoading } = useQuery(projectQuery(projectId));
  const can = useCan();
  const qc = useQueryClient();
  const navigate = useNavigate();
  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!p) return null;
  return (
    <>
      <Link to="/projects" className="mb-3 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="mr-1 size-4" />Loyihalar</Link>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">{p.name}<StatusBadge status={p.status} />{p.isInternal && <Badge variant="outline">ichki</Badge>}</span>}
        description={<span className="font-mono">{p.code}</span>}
        actions={
          <>
            {can('projects:update') && <ProjectFormSheet project={p} trigger={<Button variant="outline"><Pencil className="mr-2 size-4" />Tahrirlash</Button>} />}
            {can('projects:archive') && (
              <Confirm destructive title="Loyihani arxivlash" description="Faol obunalari bo'lsa arxivlab bo'lmaydi." confirmText="Arxivlash"
                trigger={<Button variant="outline"><Archive className="mr-2 size-4" />Arxivlash</Button>}
                onConfirm={async () => {
                  try { await api.post(`/projects/${projectId}/archive`); toast.success('Arxivlandi'); void qc.invalidateQueries({ queryKey: ['projects'] }); void navigate({ to: '/projects' }); }
                  catch (e) { handleApiError(e); }
                }} />
            )}
          </>
        }
      />
      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">Umumiy</TabsTrigger>
          <TabsTrigger value="components">Komponentlar ({p.components.length})</TabsTrigger>
          <TabsTrigger value="plans">Tariflar</TabsTrigger>
          <TabsTrigger value="releases">Versiyalar</TabsTrigger>
          <TabsTrigger value="clients">Mijozlar ({p.clientCount})</TabsTrigger>
          <TabsTrigger value="team">Jamoa ({p.members.length})</TabsTrigger>
          <TabsTrigger value="files">Fayllar</TabsTrigger>
          <TabsTrigger value="history">Tarix</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <Card className="max-w-3xl">
            <CardContent className="pt-6">
              <DetailList items={[
                ['Tavsif', p.description && <span className="whitespace-pre-wrap">{p.description}</span>],
                ["Mas'ul (PM)", p.owner?.fullName],
                ['Platformalar', p.supportedPlatforms.length ? <div className="flex flex-wrap gap-1">{p.supportedPlatforms.map((x) => <Badge key={x} variant="secondary">{PLATFORM_LABELS[x] ?? x}</Badge>)}</div> : null],
                ['Repozitoriy', p.repositoryUrl && <a href={p.repositoryUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 hover:underline">{p.repositoryUrl}<ExternalLink className="size-3" /></a>],
                ['Yaratilgan', date(p.createdAt)],
              ]} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="components"><Components p={p} edit={can('projects:update')} /></TabsContent>
        <TabsContent value="plans"><PlansTab projectId={p.id} /></TabsContent>
        <TabsContent value="releases" className="grid gap-3">
          {can('releases:create') && <div><ReleaseCreateDialog projectId={p.id} trigger={<Button size="sm"><Plus className="mr-2 size-4" />Yangi versiya</Button>} /></div>}
          <ReleasesTable projectId={p.id} />
        </TabsContent>
        <TabsContent value="clients"><ClientProjectsTable projectId={p.id} /></TabsContent>
        <TabsContent value="team"><Team p={p} edit={can('projects:manage_members')} /></TabsContent>
        <TabsContent value="files"><EntityFiles entityType="PROJECT" entityId={p.id} /></TabsContent>
        <TabsContent value="history"><Card><CardContent className="pt-6"><ResourceHistory resourceType="project" resourceId={p.id} /></CardContent></Card></TabsContent>
      </Tabs>
    </>
  );
}

function Components({ p, edit }: { p: ProjectDetail; edit: boolean }) {
  const qc = useQueryClient();
  return (
    <div className="grid gap-3">
      {edit && <div><ComponentDialog projectId={p.id} trigger={<Button size="sm"><Plus className="mr-2 size-4" />Komponent qo'shish</Button>} /></div>}
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader><TableRow><TableHead>Komponent</TableHead><TableHead>Ishlash turi</TableHead><TableHead>Platformalar</TableHead><TableHead className="text-right">Versiyalar</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {p.components.map((c) => (
              <TableRow key={c.id} className={c.isActive ? undefined : 'opacity-60'}>
                <TableCell>
                  <div className="font-medium">{c.name}{!c.isActive && <Badge variant="outline" className="ml-2">nofaol</Badge>}</div>
                  <div className="font-mono text-xs text-muted-foreground">{c.key}</div>
                  {c.description && <div className="text-xs text-muted-foreground">{c.description}</div>}
                </TableCell>
                <TableCell className="text-sm">{RUNTIME_LABELS[c.runtime] ?? c.runtime}</TableCell>
                <TableCell><div className="flex flex-wrap gap-1">{c.supportedPlatforms.map((x) => <Badge key={x} variant="secondary">{PLATFORM_LABELS[x] ?? x}</Badge>)}</div></TableCell>
                <TableCell className="text-right">{c.releaseCount}</TableCell>
                <TableCell className="w-24 text-right">
                  {edit && (
                    <>
                      <ComponentDialog projectId={p.id} component={c} trigger={<Button variant="ghost" size="icon" aria-label="Tahrirlash"><Pencil className="size-4" /></Button>} />
                      <Confirm destructive title="Komponentni o'chirish" description="Versiyalari bo'lsa o'chirib bo'lmaydi — nofaol qiling."
                        trigger={<Button variant="ghost" size="icon" aria-label="O'chirish"><Trash2 className="size-4" /></Button>}
                        onConfirm={async () => { try { await api.delete(`/projects/${p.id}/components/${c.id}`); void qc.invalidateQueries({ queryKey: ['projects', p.id] }); } catch (e) { handleApiError(e); } }} />
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {!p.components.length && <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">Komponentlar yo'q. Masalan: VPS server, lokal servis, AI model, ESP32 firmware.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function Team({ p, edit }: { p: ProjectDetail; edit: boolean }) {
  const qc = useQueryClient();
  return (
    <div className="grid max-w-3xl gap-3">
      {edit && <div><MemberDialog projectId={p.id} trigger={<Button size="sm"><UserPlus className="mr-2 size-4" />Qo'shish</Button>} /></div>}
      {p.members.map((m) => (
        <div key={m.userId} className="flex items-center justify-between rounded-md border bg-card p-3 text-sm">
          <div>
            <div className="font-medium">{m.fullName}</div>
            <div className="text-xs text-muted-foreground">{m.email} · {MEMBER_ROLE_LABELS[m.role] ?? m.role}</div>
          </div>
          {edit && (
            <Confirm title="Jamoadan chiqarish" trigger={<Button variant="ghost" size="icon" aria-label="Chiqarish"><Trash2 className="size-4" /></Button>}
              onConfirm={async () => { await api.delete(`/projects/${p.id}/members/${m.userId}`).catch(handleApiError); void qc.invalidateQueries({ queryKey: ['projects', p.id] }); }} />
          )}
        </div>
      ))}
      {!p.members.length && <p className="text-sm text-muted-foreground">Jamoa a'zolari yo'q</p>}
    </div>
  );
}
