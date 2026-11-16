import { useMutation, useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { KeyRound } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Field } from '@/components/common/field';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api, errorText } from '@/lib/api';
import { meQuery, ROLE_HINTS, ROLE_LABELS } from '@/lib/session';

export const Route = createFileRoute('/_app/profile')({ component: Profile });

function Profile() {
  const { data: me } = useQuery(meQuery);
  const [cur, setCur] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const m = useMutation({
    mutationFn: () => api.post('/auth/password', { currentPassword: cur, newPassword: pw }),
    onSuccess: () => { toast.success("Parol o'zgartirildi. Boshqa qurilmalardagi sessiyalar yopildi."); setCur(''); setPw(''); setPw2(''); },
    onError: (e) => toast.error(errorText(e)),
  });
  if (!me) return null;
  const rows: [string, React.ReactNode][] = [
    ['Ism', me.user.fullName], ['Email', me.user.email], ['Rol', <span key="r">{ROLE_LABELS[me.user.role] ?? me.user.role}<span className="block text-xs text-muted-foreground">{ROLE_HINTS[me.user.role]}</span></span>],
    ['Kompaniya', me.client.legalName], ['Shaxsiy hisob raqami', <span key="a" className="font-mono">{me.client.accountNo}</span>],
  ];
  return (
    <>
      <PageHeader title="Profil" description="Shaxsiy ma'lumotlar va xavfsizlik" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Ma'lumotlar</CardTitle><CardDescription>O'zgartirish uchun menejeringizga yoki kompaniya egasiga murojaat qiling.</CardDescription></CardHeader>
          <CardContent>
            <dl className="grid gap-3 text-sm">{rows.map(([k, v]) => <div key={k} className="grid grid-cols-[140px_1fr] gap-2"><dt className="text-muted-foreground">{k}</dt><dd>{v}</dd></div>)}</dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><KeyRound className="size-4 text-muted-foreground" />Parolni o'zgartirish</CardTitle><CardDescription>Kamida 12 belgi. Boshqa qurilmalardan chiqib ketiladi.</CardDescription></CardHeader>
          <CardContent>
            <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
              <Field label="Joriy parol"><Input type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} /></Field>
              <Field label="Yangi parol" hint="Kamida 12 belgi"><Input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
              <Field label="Yangi parolni takrorlang" error={pw2 && pw !== pw2 ? 'Parollar mos emas' : undefined}><Input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></Field>
              <Button type="submit" className="justify-self-start" disabled={!cur || pw.length < 12 || pw !== pw2 || m.isPending}>Saqlash</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
