import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { MessageSquare, MessageSquarePlus } from 'lucide-react';
import { useState } from 'react';
import { type PortalRequestItem, REQUEST_CATEGORY_LABELS } from '@ads/contracts';
import { PageHeader } from '@/components/common/page-header';
import { RequestStatusBadge } from '@/components/common/request-status';
import { Empty } from '@/components/common/stat';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { ago, date } from '@/lib/format';
import { useAccess } from '@/lib/session';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/requests/')({ component: Requests });

function Requests() {
  const access = useAccess();
  const [tab, setTab] = useState('active');
  const { data, isLoading } = useQuery({ queryKey: ['requests'], queryFn: () => api.get<PortalRequestItem[]>('/requests') });
  const rows = (data ?? []).filter((r) => tab === 'all' || r.status !== 'CLOSED');
  return (
    <>
      <PageHeader
        title="Murojaatlar" description="Savol, muammo yoki xizmatni o'zgartirish bo'yicha so'rovlaringiz va ularga javoblar"
        actions={access.writeRequests && <Button asChild><Link to="/requests/new"><MessageSquarePlus className="mr-2 size-4" />Yangi murojaat</Link></Button>}
      />
      <Tabs value={tab} onValueChange={setTab} className="mb-3"><TabsList><TabsTrigger value="active">Faol</TabsTrigger><TabsTrigger value="all">Hammasi</TabsTrigger></TabsList></Tabs>
      {isLoading && <Skeleton className="h-40" />}
      {rows.length > 0 && (
        <Card className="gap-0 divide-y overflow-hidden p-0">
          {rows.map((r) => (
            <Link key={r.id} to="/requests/$requestId" params={{ requestId: r.id }} className={cn('flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-muted/50', r.unread && 'bg-primary/5')}>
              <span className="min-w-0">
                <span className="flex items-center gap-2 font-medium">{r.unread && <span className="size-2 shrink-0 rounded-full bg-primary" aria-label="Yangi javob" />}{r.subject}</span>
                <span className="block text-xs text-muted-foreground"><span className="font-mono">{r.code}</span> · {REQUEST_CATEGORY_LABELS[r.category] ?? r.category} · {date(r.createdAt)} · {r.createdBy}</span>
              </span>
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                {r.unread ? <Badge>Yangi javob</Badge> : <span>{r.lastMessageBy === 'STAFF' ? 'ADS javob berdi' : 'Javob kutilmoqda'} · {ago(r.lastMessageAt)}</span>}
                <RequestStatusBadge status={r.status} />
              </span>
            </Link>
          ))}
        </Card>
      )}
      {data && !rows.length && (
        <Empty icon={MessageSquare} title={tab === 'active' ? "Faol murojaatlar yo'q" : "Murojaatlar yo'q"}
          text="Savolingiz yoki muammo bo'lsa — murojaat yuboring, mutaxassislarimiz shu yerda javob beradi."
          action={access.writeRequests && <Button asChild variant="outline"><Link to="/requests/new">Murojaat yuborish</Link></Button>} />
      )}
    </>
  );
}
