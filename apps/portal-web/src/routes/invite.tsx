import { useMutation, useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { z } from 'zod';
import { Field } from '@/components/common/field';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api, errorText } from '@/lib/api';

export const Route = createFileRoute('/invite')({ validateSearch: z.object({ token: z.string().catch('') }), component: Invite });

function Invite() {
  const { token } = Route.useSearch();
  const info = useQuery({ queryKey: ['invite', token], queryFn: () => api.get<{ email: string; fullName: string; clientName: string }>(`/auth/invite/${token}`), retry: false });
  const [pw, setPw] = useState(''); const [pw2, setPw2] = useState(''); const [error, setError] = useState('');
  const m = useMutation({ mutationFn: () => api.post('/auth/invite/accept', { token, password: pw }), onError: (e) => setError(errorText(e)) });
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Kabinetni faollashtirish</CardTitle>
          <CardDescription>{info.data ? `${info.data.clientName} · ${info.data.email}` : info.error ? errorText(info.error) : 'Tekshirilmoqda…'}</CardDescription>
        </CardHeader>
        <CardContent>
          {m.isSuccess ? (
            <div className="grid gap-3 text-center">
              <CheckCircle2 className="mx-auto size-10 text-success" />
              <p className="text-sm">Parol o'rnatildi. Endi kabinetga kiring.</p>
              <Button asChild><Link to="/login">Kirish</Link></Button>
            </div>
          ) : info.data ? (
            <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); setError(''); m.mutate(); }}>
              <Field label="Yangi parol" hint="Kamida 12 belgi"><Input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
              <Field label="Parolni takrorlang" error={error || (pw2 && pw !== pw2 ? 'Parollar mos emas' : undefined)}><Input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></Field>
              <Button type="submit" disabled={m.isPending || pw.length < 12 || pw !== pw2}>{m.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}Saqlash</Button>
            </form>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
