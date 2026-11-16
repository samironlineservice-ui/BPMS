import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import type { PortalAuthConfig } from '@ads/contracts';
import { Building2, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Field } from '@/components/common/field';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api, errorText } from '@/lib/api';

export const Route = createFileRoute('/login')({ component: Login });

function Login() {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState('');
  const qc = useQueryClient();
  const navigate = useNavigate();
  const cfg = useQuery({ queryKey: ['auth-config'], queryFn: () => api.get<PortalAuthConfig>('/auth/config'), staleTime: 10 * 60_000 });
  const m = useMutation({
    mutationFn: () => api.post('/auth/login', { email, password }),
    onSuccess: async () => { await qc.invalidateQueries(); void navigate({ to: '/' }); },
    onError: (e) => setError(errorText(e)),
  });
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Building2 className="size-5" /></div>
          <span className="text-xl font-semibold">Mijoz kabineti</span>
        </div>
        <Card>
          <CardHeader><CardTitle>Kirish</CardTitle><CardDescription>Invoice'lar, to'lovlar, akt-sverka va qurilmalaringiz</CardDescription></CardHeader>
          <CardContent>
            <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); setError(''); m.mutate(); }}>
              <Field label="Email"><Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus /></Field>
              <Field label="Parol" error={error || undefined}><Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
              <Button type="submit" disabled={!email || !password || m.isPending}>{m.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}Kirish</Button>
            </form>
          </CardContent>
        </Card>
        {cfg.data?.registration && (
          <p className="mt-4 text-center text-sm text-muted-foreground">Kabinetingiz yo'qmi? <Link to="/register" className="font-medium text-primary hover:underline">Ro'yxatdan o'tish</Link></p>
        )}
        <p className="mt-2 text-center text-xs text-muted-foreground">Allaqachon mijozimizmisiz? Menejeringizdan taklif havolasini so'rang.</p>
      </div>
    </div>
  );
}
