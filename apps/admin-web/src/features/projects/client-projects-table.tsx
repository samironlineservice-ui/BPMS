import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Link2, Pencil, Unlink } from 'lucide-react';
import { Confirm } from '@/components/common/confirm';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import { useCan } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { date } from '@/lib/format';
import { clientProjectsQuery } from './api';
import { ClientProjectDialog } from './forms';

/** Mijoz kartochkasida (loyihalari) yoki loyiha kartochkasida (mijozlari) ishlatiladi. */
export function ClientProjectsTable({ clientId, projectId }: { clientId?: string; projectId?: string }) {
  const { data, isLoading } = useQuery(clientProjectsQuery(clientId ? { clientId } : { projectId }));
  const can = useCan();
  const qc = useQueryClient();
  const edit = can('clients:update');
  const byClient = !!clientId;
  return (
    <div className="grid gap-3">
      {edit && (
        <div>
          <ClientProjectDialog clientId={clientId} projectId={projectId}
            trigger={<Button size="sm"><Link2 className="mr-2 size-4" />{byClient ? 'Loyihaga ulash' : "Mijoz qo'shish"}</Button>} />
        </div>
      )}
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{byClient ? 'Loyiha' : 'Mijoz'}</TableHead><TableHead>Holat</TableHead><TableHead>Davr</TableHead>
              <TableHead>Menejer</TableHead><TableHead className="text-right">Obunalar</TableHead><TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.map((l) => (
              <TableRow key={l.id}>
                <TableCell>
                  {byClient
                    ? <Link to="/projects/$projectId" params={{ projectId: l.projectId }} className="font-medium hover:underline">{l.projectName}</Link>
                    : <Link to="/clients/$clientId" params={{ clientId: l.clientId }} className="font-medium hover:underline">{l.clientName}</Link>}
                  <div className="font-mono text-xs text-muted-foreground">{byClient ? l.projectCode : l.clientCode}</div>
                </TableCell>
                <TableCell><StatusBadge status={l.status} /></TableCell>
                <TableCell className="text-sm">{l.startedOn ? `${date(l.startedOn)} — ${l.endedOn ? date(l.endedOn) : 'hozir'}` : '—'}</TableCell>
                <TableCell className="text-sm">{l.accountManager?.fullName ?? '—'}</TableCell>
                <TableCell className="text-right">{l.subscriptionCount}</TableCell>
                <TableCell className="w-24 text-right">
                  {edit && (
                    <>
                      <ClientProjectDialog link={l} trigger={<Button variant="ghost" size="icon" aria-label="Tahrirlash"><Pencil className="size-4" /></Button>} />
                      <Confirm destructive title="Bog'lanishni o'chirish" description="Obuna yoki o'rnatmalari bo'lsa o'chirib bo'lmaydi — holatini 'Ketgan' qiling."
                        trigger={<Button variant="ghost" size="icon" aria-label="Uzish"><Unlink className="size-4" /></Button>}
                        onConfirm={async () => {
                          try { await api.delete(`/client-projects/${l.id}`); void qc.invalidateQueries({ queryKey: ['client-projects'] }); void qc.invalidateQueries({ queryKey: ['clients'] }); void qc.invalidateQueries({ queryKey: ['projects'] }); }
                          catch (e) { handleApiError(e); }
                        }} />
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {!isLoading && !data?.length && (
              <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">{byClient ? 'Loyihalarga ulanmagan' : 'Mijozlar ulanmagan'}</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
