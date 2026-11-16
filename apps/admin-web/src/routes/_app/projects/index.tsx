import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { Boxes, Layers, Plus, Users } from 'lucide-react';
import { z } from 'zod';
import { PageHeader } from '@/components/common/page-header';
import { SearchInput } from '@/components/common/search-input';
import { StatusBadge } from '@/components/common/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useCan } from '@/lib/auth';
import { PLATFORM_LABELS, PROJECT_STATUSES, projectsQuery } from '@/features/projects/api';
import { ProjectFormSheet } from '@/features/projects/forms';

const search = z.object({ page: z.number().int().min(1).catch(1).default(1), q: z.string().optional(), status: z.string().optional() });
export const Route = createFileRoute('/_app/projects/')({ validateSearch: search, component: ProjectsPage });

function ProjectsPage() {
  const s = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const can = useCan();
  const { data, isLoading } = useQuery(projectsQuery(s));
  const set = (p: Partial<typeof s>) => navigate({ search: (prev) => ({ ...prev, ...p, page: 1 }) });
  return (
    <>
      <PageHeader title="Loyihalar" description="Mahsulotlar, ularning komponentlari va mijozlari"
        actions={can('projects:create') && <ProjectFormSheet trigger={<Button><Plus className="mr-2 size-4" />Yangi loyiha</Button>} />} />
      <div className="mb-4 flex flex-wrap gap-2">
        <SearchInput value={s.q} onChange={(q) => set({ q })} placeholder="Nom yoki kod…" />
        <Select value={s.status ?? 'all'} onValueChange={(v) => set({ status: v === 'all' ? undefined : v })}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Barcha holatlar</SelectItem>
            {PROJECT_STATUSES.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
            <SelectItem value="ARCHIVED">Arxiv</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-40" />)}</div>
      ) : data?.items.length ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.items.map((p) => (
            <Link key={p.id} to="/projects/$projectId" params={{ projectId: p.id }}>
              <Card className="h-full transition-colors hover:border-primary/50">
                <CardHeader>
                  <CardTitle className="flex items-start justify-between gap-2 text-base">
                    <span className="flex items-center gap-2"><Boxes className="size-4 text-primary" />{p.name}</span>
                    <StatusBadge status={p.status} />
                  </CardTitle>
                  <div className="font-mono text-xs text-muted-foreground">{p.code}{p.isInternal && ' · ichki'}</div>
                </CardHeader>
                <CardContent className="grid gap-3">
                  <div className="flex flex-wrap gap-1">{p.supportedPlatforms.map((x) => <Badge key={x} variant="secondary">{PLATFORM_LABELS[x] ?? x}</Badge>)}</div>
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Users className="size-3.5" />{p.clientCount} mijoz</span>
                    <span className="flex items-center gap-1"><Layers className="size-3.5" />{p.componentCount} komponent</span>
                    {p.owner && <span>PM: {p.owner.fullName}</span>}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Loyihalar yo'q</CardContent></Card>
      )}
    </>
  );
}
