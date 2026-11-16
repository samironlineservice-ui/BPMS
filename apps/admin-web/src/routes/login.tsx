import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Boxes, KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { loginSchema, type AuthStep } from '@ads/contracts';
import { Field } from '@/components/common/field';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api';
import { meQuery } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';

export const Route = createFileRoute('/login')({
  validateSearch: z.object({ redirect: z.string().optional() }),
  component: LoginPage,
});

function LoginPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { redirect: back } = Route.useSearch();
  const me = useQuery({ ...meQuery, retry: false });
  const [step, setStep] = useState<AuthStep | 'CREDENTIALS'>('CREDENTIALS');

  useEffect(() => {
    if (me.data && step === 'CREDENTIALS') {
      if (me.data.mfa.verified) void navigate({ to: back ?? '/' });
      else setStep(me.data.mfa.enabled ? 'MFA_VERIFY' : 'MFA_SETUP');
    }
  }, [me.data, step, navigate, back]);

  const done = async () => {
    await qc.invalidateQueries({ queryKey: ['me'] });
    await qc.fetchQuery(meQuery);
    void navigate({ to: back ?? '/' });
  };

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Boxes className="size-5" /></div>
          <span className="text-xl font-semibold">ADS-ERP</span>
        </div>
        {step === 'CREDENTIALS' && <CredentialsForm onStep={(s) => (s === 'DONE' ? void done() : setStep(s))} />}
        {step === 'MFA_VERIFY' && <MfaVerify onDone={done} />}
        {step === 'MFA_SETUP' && <MfaSetup onDone={done} />}
      </div>
    </div>
  );
}

function CredentialsForm({ onStep }: { onStep: (s: AuthStep) => void }) {
  const form = useForm({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } });
  const m = useMutation({
    mutationFn: (v: z.infer<typeof loginSchema>) => api.post<{ step: AuthStep }>('/auth/login', v),
    onSuccess: (r) => onStep(r.step),
    onError: (e) => handleApiError(e, form.setError),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Tizimga kirish</CardTitle>
        <CardDescription>Faqat kompaniya xodimlari uchun</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={form.handleSubmit((v) => m.mutate(v))}>
          <Field label="Email" error={form.formState.errors.email}>
            <Input type="email" autoComplete="username" autoFocus {...form.register('email')} />
          </Field>
          <Field label="Parol" error={form.formState.errors.password}>
            <Input type="password" autoComplete="current-password" {...form.register('password')} />
          </Field>
          <Button type="submit" disabled={m.isPending}>
            {m.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <KeyRound className="mr-2 size-4" />}
            Kirish
          </Button>
        </form>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Bu yerda ro'yxatdan o'tish yo'q — xodim akkauntini rahbar yaratadi. Akkauntingiz yo'q bo'lsa, rahbardan taklif havolasini so'rang.
        </p>
      </CardContent>
    </Card>
  );
}

function CodeForm({ submit, pending, label }: { submit: (code: string) => void; pending: boolean; label: string }) {
  const [code, setCode] = useState('');
  return (
    <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); submit(code); }}>
      <Field label={label}>
        <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="text-center font-mono text-lg tracking-[0.5em]" />
      </Field>
      <Button type="submit" disabled={pending || code.length !== 6}>
        {pending && <Loader2 className="mr-2 size-4 animate-spin" />}Tasdiqlash
      </Button>
    </form>
  );
}

function MfaVerify({ onDone }: { onDone: () => void }) {
  const m = useMutation({ mutationFn: (code: string) => api.post('/auth/mfa/verify', { code }), onSuccess: onDone, onError: (e) => handleApiError(e) });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ShieldCheck className="size-5 text-primary" />Ikki bosqichli tasdiqlash</CardTitle>
        <CardDescription>Authenticator ilovasidagi 6 xonali kodni kiriting</CardDescription>
      </CardHeader>
      <CardContent><CodeForm submit={(c) => m.mutate(c)} pending={m.isPending} label="Kod" /></CardContent>
    </Card>
  );
}

function MfaSetup({ onDone }: { onDone: () => void }) {
  const setup = useQuery({ queryKey: ['mfa-setup'], queryFn: () => api.post<{ otpauthUrl: string; secret: string }>('/auth/mfa/setup'), staleTime: Infinity, retry: false });
  const m = useMutation({ mutationFn: (code: string) => api.post('/auth/mfa/confirm', { code }), onSuccess: onDone, onError: (e) => handleApiError(e) });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ShieldCheck className="size-5 text-primary" />Ikki bosqichli himoyani yoqing</CardTitle>
        <CardDescription>Google Authenticator, Microsoft Authenticator yoki boshqa TOTP ilovasi bilan QR-kodni skanerlang</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {setup.isLoading && <Loader2 className="mx-auto size-6 animate-spin" />}
        {setup.error instanceof ApiError && <p className="text-sm text-destructive">{setup.error.message}</p>}
        {setup.data && (
          <>
            <div className="mx-auto rounded-lg bg-white p-3"><QRCodeSVG value={setup.data.otpauthUrl} size={176} /></div>
            <p className="break-all text-center font-mono text-xs text-muted-foreground">{setup.data.secret}</p>
          </>
        )}
        <CodeForm submit={(c) => m.mutate(c)} pending={m.isPending} label="Ilovadagi kod" />
      </CardContent>
    </Card>
  );
}
