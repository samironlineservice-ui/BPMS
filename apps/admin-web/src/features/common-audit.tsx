import { useQuery } from '@tanstack/react-query';
import type { AuditItem, Paginated } from '@ads/contracts';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { dateTime } from '@/lib/format';

/** Entity sahifasidagi "Tarix" tab'i: shu resurs bo'yicha audit yozuvlari. */
export function ResourceHistory({ resourceType, resourceId }: { resourceType: string; resourceId: string }) {
  const { data } = useQuery({
    queryKey: ['audit', resourceType, resourceId],
    queryFn: () => api.get<Paginated<AuditItem>>('/audit', { resourceType, resourceId, pageSize: 50 }),
  });
  if (!data?.items.length) return <p className="text-sm text-muted-foreground">Tarix bo'sh</p>;
  return (
    <ol className="relative grid gap-3 border-l pl-4">
      {data.items.map((a) => (
        <li key={a.id} className="text-sm">
          <span className="absolute -left-1.5 mt-1.5 size-3 rounded-full border bg-background" />
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="font-mono text-xs">{a.action}</Badge>
            <span className="text-muted-foreground">{a.actorLabel ?? a.actorType}</span>
            <span className="text-xs text-muted-foreground">{dateTime(a.occurredAt)}</span>
          </div>
          {a.changes ? (
            <pre className="mt-1 max-h-40 overflow-auto rounded bg-muted p-2 text-xs">{JSON.stringify(a.changes, null, 2)}</pre>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
