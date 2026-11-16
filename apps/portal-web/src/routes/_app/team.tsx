import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Link2, MoreHorizontal, UserPlus, Users } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { type PortalTeamMember, portalTeamInviteSchema } from '@ads/contracts';
import { CopyButton } from '@/components/common/copy-button';
import { Field } from '@/components/common/field';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, errorText } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { requireAccess, ROLE_HINTS, ROLE_LABELS } from '@/lib/session';

export const Route = createFileRoute('/_app/team')({ beforeLoad: requireAccess('team'), component: Team });

function InviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('ACCOUNTANT');
  const [link, setLink] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const m = useMutation({
    mutationFn: (input: unknown) => api.post<{ inviteUrl: string }>('/team', input),
    onSuccess: (r) => { setLink(r.inviteUrl); void qc.invalidateQueries({ queryKey: ['team'] }); },
    onError: (e) => toast.error(errorText(e)),
  });
  const reset = () => { setEmail(''); setFullName(''); setRole('ACCOUNTANT'); setLink(null); setErrors({}); };
  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Xodimni taklif qilish</DialogTitle><DialogDescription>Taklif havolasi 72 soat amal qiladi. Uni xodimingizga o'zingiz yuborasiz.</DialogDescription></DialogHeader>
        {link ? (
          <div className="grid gap-3 text-sm">
            <p>Havola tayyor. Xodim uni ochib, parol o'rnatadi va kabinetga kiradi:</p>
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-2"><Link2 className="size-4 shrink-0 text-muted-foreground" /><span className="truncate font-mono text-xs">{link}</span><CopyButton text={link} /></div>
            <DialogFooter><Button onClick={() => { onOpenChange(false); reset(); }}>Tayyor</Button></DialogFooter>
          </div>
        ) : (
          <form className="grid gap-4" onSubmit={(e) => {
            e.preventDefault();
            const r = portalTeamInviteSchema.safeParse({ email, fullName, portalRole: role });
            if (!r.success) { setErrors(Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message]))); return; }
            setErrors({}); m.mutate(r.data);
          }}>
            <Field label="Ism familiya" required error={errors.fullName}><Input value={fullName} onChange={(e) => setFullName(e.target.value)} /></Field>
            <Field label="Email" required error={errors.email}><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <Field label="Rol" hint={ROLE_HINTS[role]}>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{['OWNER', 'ACCOUNTANT', 'TECHNICIAN', 'VIEWER'].map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <DialogFooter><Button type="submit" disabled={m.isPending}><UserPlus className="mr-2 size-4" />Havola yaratish</Button></DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Team() {
  const qc = useQueryClient();
  const [invite, setInvite] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [remove, setRemove] = useState<PortalTeamMember | null>(null);
  const { data } = useQuery({ queryKey: ['team'], queryFn: () => api.get<PortalTeamMember[]>('/team') });
  const reinvite = useMutation({
    mutationFn: (id: string) => api.post<{ inviteUrl: string }>(`/team/${id}/reinvite`),
    onSuccess: (r) => setLink(r.inviteUrl), onError: (e) => toast.error(errorText(e)),
  });
  const deactivate = useMutation({
    mutationFn: (id: string) => api.post(`/team/${id}/deactivate`),
    onSuccess: () => { toast.success("Foydalanuvchi o'chirildi"); setRemove(null); void qc.invalidateQueries({ queryKey: ['team'] }); },
    onError: (e) => toast.error(errorText(e)),
  });
  return (
    <>
      <PageHeader title="Jamoa" description="Kompaniyangiz xodimlarining kabinetga kirishi va rollari"
        actions={<Button onClick={() => setInvite(true)}><UserPlus className="mr-2 size-4" />Taklif qilish</Button>} />
      <Card className="gap-0 overflow-hidden p-0">
        <Table>
          <TableHeader><TableRow><TableHead>Xodim</TableHead><TableHead>Rol</TableHead><TableHead>Holat</TableHead><TableHead>Oxirgi kirish</TableHead><TableHead className="w-10" /></TableRow></TableHeader>
          <TableBody>
            {data?.map((u) => (
              <TableRow key={u.id}>
                <TableCell><span className="font-medium">{u.fullName}</span>{u.isMe && <Badge variant="outline" className="ml-2">siz</Badge>}<div className="text-xs text-muted-foreground">{u.email}</div></TableCell>
                <TableCell className="text-sm">{ROLE_LABELS[u.role] ?? u.role}</TableCell>
                <TableCell><StatusBadge status={u.status} /></TableCell>
                <TableCell className="text-sm text-muted-foreground">{dateTime(u.lastLoginAt)}</TableCell>
                <TableCell>
                  {!u.isMe && u.status !== 'DEACTIVATED' && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Amallar"><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {u.status === 'INVITED' && <DropdownMenuItem onSelect={() => reinvite.mutate(u.id)}><Link2 className="mr-2 size-4" />Yangi taklif havolasi</DropdownMenuItem>}
                        <DropdownMenuItem className="text-destructive" onSelect={() => setRemove(u)}>Kirishni o'chirish</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {data && !data.length && <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground"><Users className="mx-auto mb-2 size-6" />Jamoa a'zolari yo'q</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>
      <InviteDialog open={invite} onOpenChange={setInvite} />
      <Dialog open={!!link} onOpenChange={(o) => !o && setLink(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Yangi taklif havolasi</DialogTitle><DialogDescription>Avvalgi havola bekor qilindi. Yangisi 72 soat amal qiladi.</DialogDescription></DialogHeader>
          {link && <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-2"><Link2 className="size-4 shrink-0 text-muted-foreground" /><span className="truncate font-mono text-xs">{link}</span><CopyButton text={link} /></div>}
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!remove} onOpenChange={(o) => !o && setRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{remove?.fullName} — kirishni o'chirasizmi?</AlertDialogTitle>
            <AlertDialogDescription>Foydalanuvchi kabinetdan darhol chiqariladi. Keyinroq menejeringiz orqali qayta tiklash mumkin.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Bekor qilish</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); if (remove) deactivate.mutate(remove.id); }} disabled={deactivate.isPending}>O'chirish</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
