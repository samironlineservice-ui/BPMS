import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Plus, ShieldCheck, Users } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Field } from '@/components/common/field';
import { PageHeader } from '@/components/common/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { useCan } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { PermissionPicker } from '@/features/roles/permission-picker';
import { rolesQuery } from '@/features/users/api';

export const Route = createFileRoute('/_app/roles/')({ component: RolesPage });

function RolesPage() {
  const { data } = useQuery(rolesQuery);
  const can = useCan();
  return (
    <>
      <PageHeader title="Rollar" description="Rollar ruxsatlar to'plamidir. Tizim rollari o'zgarmaydi — o'zingizga mos rol yarating." actions={can('users:manage_roles') && <NewRole />} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data?.map((r) => (
          <Link key={r.id} to="/roles/$roleId" params={{ roleId: r.id }}>
            <Card className="h-full transition-colors hover:border-primary/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="size-4 text-primary" />{r.name}{r.isSystem && <Badge variant="secondary">tizim</Badge>}</CardTitle>
                <CardDescription className="line-clamp-2">{r.description}</CardDescription>
                <div className="flex gap-4 pt-2 text-xs text-muted-foreground">
                  <span>{r.permissionCount} ta ruxsat</span>
                  <span className="flex items-center gap-1"><Users className="size-3" />{r.userCount}</span>
                </div>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}

function NewRole() {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [perms, setPerms] = useState<string[]>([]);
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => api.post('/roles', { key, name, permissions: perms }),
    onSuccess: () => { toast.success('Rol yaratildi'); setOpen(false); void qc.invalidateQueries({ queryKey: ['roles'] }); },
    onError: (e) => handleApiError(e),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus className="mr-2 size-4" />Yangi rol</Button></DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-3xl">
        <DialogHeader><DialogTitle>Yangi rol</DialogTitle></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nomi" required><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Savdo menejeri" /></Field>
          <Field label="Kalit" required hint="kichik lotin harflar: sales_manager"><Input value={key} onChange={(e) => setKey(e.target.value)} /></Field>
        </div>
        <PermissionPicker value={perms} onChange={setPerms} />
        <DialogFooter><Button disabled={m.isPending || !key || !name} onClick={() => m.mutate()}>Yaratish</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
