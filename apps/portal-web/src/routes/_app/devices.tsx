import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Cpu, MapPin, MessageSquareWarning, Server } from 'lucide-react';
import type { PortalDevice } from '@ads/contracts';
import { PageHeader } from '@/components/common/page-header';
import { Empty } from '@/components/common/stat';
import { StatusBadge } from '@/components/common/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { date } from '@/lib/format';
import { useAccess } from '@/lib/session';

export const Route = createFileRoute('/_app/devices')({ component: Devices });
const CLASS: Record<string, string> = {
  SERVER: 'Server', GPU_SERVER: 'GPU server', VPS: 'VPS', EDGE_SBC: 'Raspberry Pi / mini-kompyuter', MICROCONTROLLER: 'Datchik (ESP32)', DESKTOP: 'Kompyuter', MOBILE: 'Mobil qurilma',
};

function Devices() {
  const access = useAccess();
  const { data, isLoading } = useQuery({ queryKey: ['devices'], queryFn: () => api.get<PortalDevice[]>('/devices') });
  const groups = new Map<string, PortalDevice[]>();
  for (const d of data ?? []) {
    const k = d.siteName ?? 'Filial ko\'rsatilmagan';
    groups.set(k, [...(groups.get(k) ?? []), d]);
  }
  const updates = (data ?? []).reduce((a, d) => a + d.installations.filter((i) => i.updateAvailable).length, 0);
  return (
    <>
      <PageHeader
        title="Qurilmalar" description="Qurilmalaringiz va ularda ishlayotgan dasturlar versiyasi"
        actions={updates > 0 && <Badge variant="outline" className="border-primary/40 py-1 text-primary">{updates} ta dasturga yangi versiya mavjud</Badge>}
      />
      {isLoading && <Skeleton className="h-48" />}
      <div className="grid gap-6">
        {[...groups.entries()].map(([site, devices]) => (
          <section key={site}>
            <h2 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-muted-foreground"><MapPin className="size-3.5" />{site} <span className="font-normal">· {devices.length}</span></h2>
            <div className="grid gap-3 md:grid-cols-2">
              {devices.map((d) => (
                <Card key={d.id}>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center justify-between gap-2 text-base">
                      <span className="flex items-center gap-2">{d.deviceClass === 'MICROCONTROLLER' ? <Cpu className="size-4 text-muted-foreground" /> : <Server className="size-4 text-muted-foreground" />}{d.name}</span>
                      <StatusBadge status={d.status} />
                    </CardTitle>
                    <div className="text-xs text-muted-foreground"><span className="font-mono">{d.code}</span> · {CLASS[d.deviceClass] ?? d.deviceClass}</div>
                  </CardHeader>
                  <CardContent className="grid gap-2 text-sm">
                    {d.installations.map((i, k) => (
                      <div key={k} className="flex flex-wrap items-center justify-between gap-2">
                        <span>{i.componentName} <span className="text-xs text-muted-foreground">({i.projectName})</span>{i.lastUpdatedAt && <span className="block text-xs text-muted-foreground">yangilangan {date(i.lastUpdatedAt)}</span>}</span>
                        <span className="flex items-center gap-2">
                          <span className="font-mono text-xs">{i.currentVersion ?? '—'}</span>
                          {i.updateAvailable ? <Badge variant="outline" className="border-primary/40 text-primary">yangi: {i.latestVersion}</Badge>
                            : i.latestVersion && <span className="text-xs text-success">eng so'nggi</span>}
                        </span>
                      </div>
                    ))}
                    {!d.installations.length && <span className="text-muted-foreground">Dasturlar qayd etilmagan</span>}
                    {access.writeRequests && (
                      <Button asChild variant="ghost" size="sm" className="mt-1 justify-self-start px-2 text-xs text-muted-foreground">
                        <Link to="/requests/new" search={{ category: 'DEVICE', deviceId: d.id }}><MessageSquareWarning className="mr-1.5 size-3.5" />Muammo haqida xabar berish</Link>
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        ))}
      </div>
      {data && !data.length && <Empty icon={Server} title="Qurilmalar qayd etilmagan" text="Qurilmalaringiz ulangach, ular va ulardagi dastur versiyalari shu yerda ko'rinadi." />}
    </>
  );
}
