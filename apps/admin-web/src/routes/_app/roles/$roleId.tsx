import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Confirm } from '@/components/common/confirm';
import { Field } from '@/components/common/field';
import { PageHeader } from '@/components/common/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { useCan } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { PermissionPicker } from '@/features/roles/permission-picker';
import { roleQuery } from '@/features/users/api';

export const Route = createFileRoute('/_app/roles/$roleId')({ component: RolePage });

function RolePage() {
  const { roleId } = Route.useParams();
  const { data: r } = useQuery(roleQuery(roleId));
  const can = useCan();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [perms, setPerms] = useState<string[]>([]);
  useEffect(() => { if (r) { setName(r.name); setPerms(r.permissions); } }, [r]);
  const save = useMutation({
    mutationFn: () => api.put(`/roles/${roleId}`, { key: r!.key, name, description: r!.description, permissions: perms }),
    onSuccess: () => { toast.success('Saqlandi'); void qc.invalidateQueries({ queryKey: ['roles'] }); },
    onError: (e) => handleApiError(e),
  });
  if (!r) return null;
  const editable = !r.isSystem && can('users:manage_roles');
  return (
    <>
      <Link to="/roles" className="mb-3 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="mr-1 size-4" />Rollar</Link>
      <PageHeader
        title={<span className="flex items-center gap-2">{r.name}{r.isSystem && <Badge variant="secondary">tizim roli</Badge>}</span>}
        description={`${r.key} · ${r.userCount} ta foydalanuvchi · ${r.permissions.length} ta ruxsat`}
        actions={editable && (
          <>
            <Confirm destructive title="Rolni o'chirish" trigger={<Button variant="outline"><Trash2 className="mr-2 size-4" />O'chirish</Button>}
              onConfirm={async () => { try { await api.delete(`/roles/${roleId}`); void qc.invalidateQueries({ queryKey: ['roles'] }); void navigate({ to: '/roles' }); } catch (e) { handleApiError(e); } }} />
            <Button disabled={save.isPending} onClick={() => save.mutate()}>Saqlash</Button>
          </>
        )}
      />
      {editable && <Field label="Nomi" className="mb-4 max-w-sm"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>}
      <PermissionPicker value={perms} onChange={setPerms} disabled={!editable} />
    </>
  );
}
