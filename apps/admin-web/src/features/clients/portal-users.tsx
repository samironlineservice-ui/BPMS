import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Link2, Power, PowerOff, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { ClientDetail, PortalUserDto } from '@ads/contracts';
import { Confirm } from '@/components/common/confirm';
import { Field } from '@/components/common/field';
import { StatusBadge } from '@/components/common/status-badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import { useCan } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { ago } from '@/lib/format';
import { CopyField } from '@/features/users/invite-dialog';

const ROLES: Record<string, string> = { OWNER: 'Egasi (hammasi)', ACCOUNTANT: "Buxgalter (invoice, to'lov, akt-sverka)", TECHNICIAN: 'Texnik (qurilmalar)', VIEWER: "Faqat ko'rish" };

function InviteDialog({ client }: { client: ClientDetail }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(''); const [name, setName] = useState(''); const [role, setRole] = useState('ACCOUNTANT'); const [contactId, setContactId] = useState('');
  const [link, setLink] = useState<string | null>(null);
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => api.post<{ inviteUrl: string }>(`/clients/${client.id}/portal-users`, { email, fullName: name, portalRole: role, contactId: contactId || null }),
    onSuccess: (r) => { setLink(r.inviteUrl); void qc.invalidateQueries({ queryKey: ['portal-users', client.id] }); },
    onError: (e) => handleApiError(e),
  });
  const pickContact = (id: string) => {
    setContactId(id === 'none' ? '' : id);
    const c = client.contacts.find((x) => x.id === id);
    if (c) { setName(c.fullName); if (c.email) setEmail(c.email); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) { setLink(null); setEmail(''); setName(''); setRole('ACCOUNTANT'); setContactId(''); } }}>
      <DialogTrigger asChild><Button size="sm"><UserPlus className="mr-2 size-4" />Kabinetga taklif</Button></DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Mijoz kabinetiga taklif</DialogTitle><DialogDescription>Havola 72 soat amal qiladi. Mijoz parol o'rnatib, o'z invoice, to'lov va akt-sverkasini ko'radi.</DialogDescription></DialogHeader>
        {link ? (
          <div className="grid gap-3"><p className="text-sm">Taklif havolasi (mijozga yuboring):</p><CopyField value={link} /><DialogFooter><Button onClick={() => setOpen(false)}>Yopish</Button></DialogFooter></div>
        ) : (
          <div className="grid gap-4">
            {client.contacts.length > 0 && (
              <Field label="Kontaktdan tanlash">
                <Select value={contactId || 'none'} onValueChange={pickContact}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="none">— qo'lda kiritish —</SelectItem>{client.contacts.map((c) => <SelectItem key={c.id} value={c.id}>{c.fullName}{c.position ? ` · ${c.position}` : ''}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            )}
            <Field label="F.I.Sh." required><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="Email" required><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <Field label="Huquqi">
              <Select value={role} onValueChange={setRole}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(ROLES).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select>
            </Field>
            <DialogFooter><Button disabled={!email || name.trim().length < 2 || m.isPending} onClick={() => m.mutate()}>Taklif yaratish</Button></DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function PortalUsersTab({ client }: { client: ClientDetail }) {
  const can = useCan();
  const qc = useQueryClient();
  const [link, setLink] = useState<string | null>(null);
  const { data } = useQuery({ queryKey: ['portal-users', client.id], queryFn: () => api.get<PortalUserDto[]>(`/clients/${client.id}/portal-users`) });
  const refresh = () => qc.invalidateQueries({ queryKey: ['portal-users', client.id] });
  return (
    <div className="grid gap-3">
      <Alert><KeyRound className="size-4" /><AlertDescription>Mijoz kabineti (portal) alohida manzilda ishlaydi. Har bir foydalanuvchi faqat o'z kompaniyasi ma'lumotlarini ko'radi (DB darajasida cheklangan).</AlertDescription></Alert>
      {can('portal_users:invite') && <div><InviteDialog client={client} /></div>}
      {link && <CopyField value={link} />}
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader><TableRow><TableHead>Foydalanuvchi</TableHead><TableHead>Huquqi</TableHead><TableHead>Holat</TableHead><TableHead>Oxirgi kirish</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {data?.map((u) => (
              <TableRow key={u.id}>
                <TableCell><div className="font-medium">{u.fullName}</div><div className="text-xs text-muted-foreground">{u.email}</div></TableCell>
                <TableCell><Badge variant="outline">{ROLES[u.role]?.split(' (')[0] ?? u.role}</Badge></TableCell>
                <TableCell><StatusBadge status={u.status} /></TableCell>
                <TableCell className="text-sm text-muted-foreground">{ago(u.lastLoginAt)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {u.status === 'INVITED' && can('portal_users:invite') && (
                      <Button variant="ghost" size="sm" onClick={async () => { try { const r = await api.post<{ inviteUrl: string }>(`/portal-users/${u.id}/reinvite`); setLink(r.inviteUrl); toast.success('Yangi havola tayyor'); } catch (e) { handleApiError(e); } }}><Link2 className="mr-1 size-4" />Havola</Button>
                    )}
                    {can('portal_users:deactivate') && u.status === 'ACTIVE' && (
                      <Confirm destructive title={`${u.fullName}: kirishni bloklash`} description="Barcha sessiyalari yopiladi." confirmText="Bloklash"
                        trigger={<Button variant="ghost" size="icon" aria-label="Bloklash"><PowerOff className="size-4" /></Button>}
                        onConfirm={async () => { try { await api.post(`/portal-users/${u.id}/deactivate`); void refresh(); } catch (e) { handleApiError(e); } }} />
                    )}
                    {can('portal_users:deactivate') && u.status === 'DEACTIVATED' && (
                      <Button variant="ghost" size="icon" aria-label="Faollashtirish" onClick={async () => { try { await api.post(`/portal-users/${u.id}/activate`); void refresh(); } catch (e) { handleApiError(e); } }}><Power className="size-4" /></Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {data && !data.length && <TableRow><TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">Kabinetga kirish berilmagan</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
