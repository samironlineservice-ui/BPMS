import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft, KeyRound, Link2, Power, ShieldOff, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Confirm } from '@/components/common/confirm';
import { Field } from '@/components/common/field';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { useCan, useMe } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { ago, date, dateTime } from '@/lib/format';
import { ResourceHistory } from '@/features/common-audit';
import { PermissionPicker } from '@/features/roles/permission-picker';
import { rolesQuery, userQuery } from '@/features/users/api';
import { CopyField } from '@/features/users/invite-dialog';

export const Route = createFileRoute('/_app/users/$userId')({ component: UserPage });

const toIso = (d: string) => (d ? new Date(`${d}T23:59:59`).toISOString() : null);

function UserPage() {
  const { userId } = Route.useParams();
  const qc = useQueryClient();
  const can = useCan();
  const { data: me } = useMe();
  const { data: u } = useQuery(userQuery(userId));
  const roles = useQuery(rolesQuery);
  const [roleId, setRoleId] = useState('');
  const [roleUntil, setRoleUntil] = useState('');
  const [perms, setPerms] = useState<string[]>([]);
  const [permUntil, setPermUntil] = useState('');
  const [invite, setInvite] = useState<string | null>(null);
  useEffect(() => {
    if (u) { setPerms(u.directPermissions?.permissions ?? []); setPermUntil(u.directPermissions?.expiresAt?.slice(0, 10) ?? ''); }
  }, [u]);
  const refresh = () => qc.invalidateQueries({ queryKey: ['users'] });
  const act = (fn: () => Promise<unknown>, ok: string) => useMutation({ mutationFn: fn, onSuccess: () => { toast.success(ok); void refresh(); }, onError: (e) => handleApiError(e) });
  const assign = act(() => api.post(`/users/${userId}/roles`, { roleId, expiresAt: toIso(roleUntil) }), 'Rol berildi');
  const savePerms = act(() => api.put(`/users/${userId}/permissions`, { permissions: perms, expiresAt: toIso(permUntil) }), 'Ruxsatlar saqlandi');
  if (!u) return null;
  const self = me?.user.id === u.id;
  const manage = can('users:manage_roles');

  return (
    <>
      <Link to="/users" className="mb-3 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="mr-1 size-4" />Foydalanuvchilar</Link>
      <PageHeader
        title={<span className="flex items-center gap-3">{u.fullName}<StatusBadge status={u.status} /></span>}
        description={`${u.email} · yaratilgan ${date(u.createdAt)} · oxirgi kirish ${ago(u.lastLoginAt)}`}
        actions={!self && (
          <>
            {u.status === 'INVITED' && can('users:invite') && (
              <Button variant="outline" onClick={async () => { try { const r = await api.post<{ inviteUrl: string }>(`/users/${userId}/reinvite`); setInvite(r.inviteUrl); } catch (e) { handleApiError(e); } }}>
                <Link2 className="mr-2 size-4" />Yangi havola
              </Button>
            )}
            {manage && u.mfaEnabled && (
              <Confirm title="2FA'ni qayta sozlash" description="Xodim keyingi kirishda TOTP'ni qaytadan sozlaydi. Barcha sessiyalari yopiladi."
                trigger={<Button variant="outline"><ShieldOff className="mr-2 size-4" />2FA reset</Button>}
                onConfirm={async () => { await api.post(`/users/${userId}/reset-mfa`); toast.success('2FA reset qilindi'); void refresh(); }} />
            )}
            {can('users:deactivate') && (u.status === 'DEACTIVATED' ? (
              <Button variant="outline" onClick={async () => { await api.post(`/users/${userId}/activate`).catch(handleApiError); void refresh(); }}><Power className="mr-2 size-4" />Faollashtirish</Button>
            ) : (
              <Confirm destructive title="Foydalanuvchini o'chirish" description="Akkaunt bloklanadi va barcha sessiyalari yopiladi." confirmText="O'chirish"
                trigger={<Button variant="destructive"><Power className="mr-2 size-4" />O'chirish</Button>}
                onConfirm={async () => { await api.post(`/users/${userId}/deactivate`).catch(handleApiError); void refresh(); }} />
            ))}
          </>
        )}
      />
      {invite && <Card className="mb-4"><CardContent className="pt-6"><CopyField value={invite} /></CardContent></Card>}
      <Tabs defaultValue="roles">
        <TabsList>
          <TabsTrigger value="roles">Rollar</TabsTrigger>
          <TabsTrigger value="perms">Individual ruxsatlar</TabsTrigger>
          <TabsTrigger value="sessions">Sessiyalar ({u.sessions.length})</TabsTrigger>
          <TabsTrigger value="history">Tarix</TabsTrigger>
        </TabsList>
        <TabsContent value="roles" className="grid gap-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Berilgan rollar</CardTitle></CardHeader>
            <CardContent className="grid gap-2">
              {u.assignments.filter((a) => !a.personal).map((a) => (
                <div key={a.id} className="flex items-center justify-between rounded-md border p-3 text-sm">
                  <div>
                    <div className="font-medium">{a.role.name} {a.role.isSystem && <Badge variant="secondary" className="ml-1">tizim</Badge>}</div>
                    <div className="text-xs text-muted-foreground">
                      {a.expiresAt ? `muddat: ${date(a.expiresAt)}` : 'doimiy'}{a.grantedBy ? ` · bergan: ${a.grantedBy}` : ''}
                    </div>
                  </div>
                  {manage && (
                    <Confirm title="Rolni olib tashlash" trigger={<Button variant="ghost" size="icon"><Trash2 className="size-4" /></Button>}
                      onConfirm={async () => { await api.delete(`/users/${userId}/roles/${a.id}`).catch(handleApiError); void refresh(); }} />
                  )}
                </div>
              ))}
              {!u.assignments.some((a) => !a.personal) && <p className="text-sm text-muted-foreground">Rol berilmagan</p>}
            </CardContent>
          </Card>
          {manage && (
            <Card>
              <CardHeader><CardTitle className="text-base">Rol berish</CardTitle><CardDescription>Muddat ko'rsatilsa, rol o'sha kun oxirida avtomatik tugaydi</CardDescription></CardHeader>
              <CardContent className="flex flex-wrap items-end gap-3">
                <Field label="Rol" className="min-w-56">
                  <Select value={roleId} onValueChange={setRoleId}>
                    <SelectTrigger><SelectValue placeholder="Tanlang" /></SelectTrigger>
                    <SelectContent>{roles.data?.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="Muddat (ixtiyoriy)"><Input type="date" value={roleUntil} onChange={(e) => setRoleUntil(e.target.value)} /></Field>
                <Button disabled={!roleId || assign.isPending} onClick={() => assign.mutate()}>Berish</Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>
        <TabsContent value="perms">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><KeyRound className="size-4" />Individual ruxsatlar</CardTitle>
              <CardDescription>Rahbar xodimga alohida ruxsat berishi mumkin (masalan, to'lov yoki deploymentni tasdiqlash). Faqat o'zingizda bor ruxsatlarni bera olasiz.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <PermissionPicker value={perms} onChange={setPerms} disabled={!manage} />
              {manage && (
                <div className="flex flex-wrap items-end gap-3">
                  <Field label="Amal qilish muddati (ixtiyoriy)"><Input type="date" value={permUntil} onChange={(e) => setPermUntil(e.target.value)} /></Field>
                  <Button disabled={savePerms.isPending} onClick={() => savePerms.mutate()}>Saqlash</Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="sessions">
          <Card>
            <CardContent className="grid gap-2 pt-6">
              {u.sessions.map((s) => (
                <div key={s.id} className="flex items-center justify-between rounded-md border p-3 text-sm">
                  <div>
                    <div className="font-medium">{s.ip ?? "IP noma'lum"} {s.current && <Badge className="ml-1">joriy</Badge>}</div>
                    <div className="max-w-xl truncate text-xs text-muted-foreground">{s.userAgent}</div>
                    <div className="text-xs text-muted-foreground">boshlangan {dateTime(s.createdAt)} · faol {ago(s.lastSeenAt)}</div>
                  </div>
                  {manage && !s.current && (
                    <Button variant="ghost" size="sm" onClick={async () => { await api.delete(`/users/${userId}/sessions/${s.id}`).catch(handleApiError); void refresh(); }}>Yopish</Button>
                  )}
                </div>
              ))}
              {!u.sessions.length && <p className="text-sm text-muted-foreground">Faol sessiya yo'q</p>}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="history"><Card><CardContent className="pt-6"><ResourceHistory resourceType="user" resourceId={u.id} /></CardContent></Card></TabsContent>
      </Tabs>
    </>
  );
}
