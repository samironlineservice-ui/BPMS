import { useMutation, useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Boxes, CheckCircle2, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { z } from 'zod';
import { Field } from '@/components/common/field';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api';
import { handleApiError } from '@/lib/errors';

export const Route = createFileRoute('/invite')({ validateSearch: z.object({ token: z.string().catch('') }), component: InvitePage });

function InvitePage() {
  const { token } = Route.useSearch();
  const info = useQuery({ queryKey: ['invite', token], queryFn: () => api.get<{ email: string; fullName: string }>(`/auth/invite/${token}`), retry: false });
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const m = useMutation({ mutationFn: () => api.post('/auth/invite/accept', { token, password: pw }), onError: (e) => handleApiError(e) });
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Boxes className="size-5" /></div>
          <span className="text-xl font-semibold">ADS-ERP</span>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Akkauntni faollashtirish</CardTitle>
            <CardDescription>{info.data ? `${info.data.fullName} · ${info.data.email}` : 'Taklif tekshirilmoqda…'}</CardDescription>
          </CardHeader>
          <CardContent>
            {info.error instanceof ApiError && <p className="text-sm text-destructive">{info.error.message}</p>}
            {m.isSuccess ? (
              <div className="grid gap-3 text-center">
                <CheckCircle2 className="mx-auto size-10 text-success" />
                <p className="text-sm">Parol o'rnatildi. Endi tizimga kiring va ikki bosqichli himoyani yoqing.</p>
                <Button asChild><Link to="/login">Kirish</Link></Button>
              </div>
            ) : info.data ? (
              <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
                <Field label="Yangi parol" hint="Kamida 12 belgi"><Input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
                <Field label="Parolni takrorlang" error={pw2 && pw !== pw2 ? 'Parollar mos emas' : undefined}><Input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></Field>
                <Button type="submit" disabled={m.isPending || pw.length < 12 || pw !== pw2}>{m.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}Saqlash</Button>
              </form>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
