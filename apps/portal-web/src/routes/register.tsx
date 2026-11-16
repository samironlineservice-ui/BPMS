import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { Building2, Loader2, UserRound } from 'lucide-react';
import { useState } from 'react';
import { type PortalAuthConfig, portalRegisterSchema } from '@ads/contracts';
import { Field } from '@/components/common/field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api, errorText } from '@/lib/api';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/register')({ component: Register });

const authConfigQuery = { queryKey: ['auth-config'], queryFn: () => api.get<PortalAuthConfig>('/auth/config'), staleTime: 10 * 60_000 };

function Register() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const cfg = useQuery(authConfigQuery);
  const [type, setType] = useState<'COMPANY' | 'INDIVIDUAL'>('COMPANY');
  const [f, setF] = useState({ companyName: '', tin: '', fullName: '', position: '', phone: '+998 ', email: '', password: '', password2: '', message: '', website: '' });
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const m = useMutation({
    mutationFn: (input: unknown) => api.post('/auth/register', input),
    onSuccess: async () => { await qc.invalidateQueries(); void navigate({ to: '/' }); },
    onError: (e) => setErrors({ form: errorText(e) }),
  });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const input = {
      type, companyName: type === 'COMPANY' ? f.companyName : null, tin: f.tin || null, fullName: f.fullName, position: f.position || null,
      phone: f.phone.trim(), email: f.email, password: f.password, message: f.message || null, consent, website: f.website || undefined,
    };
    const r = portalRegisterSchema.safeParse(input);
    const errs: Record<string, string> = r.success ? {} : Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message]));
    if (f.password2 !== f.password) errs.password2 = 'Parollar mos emas';
    setErrors(errs);
    if (r.success && !Object.keys(errs).length) m.mutate(r.data);
  };
  const closed = cfg.data && !cfg.data.registration;
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-lg py-6">
        <div className="mb-6 flex items-center justify-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Building2 className="size-5" /></div>
          <span className="text-xl font-semibold">Mijoz kabineti</span>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Ro'yxatdan o'tish</CardTitle>
            <CardDescription>Kabinet ochiladi va menejerimiz siz bilan bog'lanadi. Allaqachon mijozimiz bo'lsangiz — menejeringizdan taklif havolasini so'rang.</CardDescription>
          </CardHeader>
          <CardContent>
            {closed ? (
              <Alert><AlertDescription>Ro'yxatdan o'tish hozircha yopiq. Kabinetga kirish uchun menejeringizdan taklif havolasini so'rang.</AlertDescription></Alert>
            ) : (
              <form className="grid gap-4" onSubmit={submit} noValidate>
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Kim sifatida">
                  {([['COMPANY', 'Kompaniya', Building2], ['INDIVIDUAL', "Jismoniy shaxs / YaTT", UserRound]] as const).map(([v, label, Icon]) => (
                    <button key={v} type="button" role="radio" aria-checked={type === v} onClick={() => setType(v)}
                      className={cn('flex items-center justify-center gap-2 rounded-md border px-3 py-2.5 text-sm', type === v ? 'border-primary bg-primary/5 font-medium text-primary' : 'text-muted-foreground hover:bg-muted')}>
                      <Icon className="size-4" />{label}
                    </button>
                  ))}
                </div>
                {type === 'COMPANY' && (
                  <div className="grid gap-4 sm:grid-cols-[1fr_150px]">
                    <Field label="Kompaniya nomi" required error={errors.companyName}><Input value={f.companyName} onChange={set('companyName')} placeholder={'"Misol Savdo" MChJ'} autoComplete="organization" /></Field>
                    <Field label="STIR" error={errors.tin} hint="ixtiyoriy"><Input value={f.tin} onChange={set('tin')} inputMode="numeric" maxLength={9} placeholder="123456789" /></Field>
                  </div>
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Ism familiya" required error={errors.fullName}><Input value={f.fullName} onChange={set('fullName')} autoComplete="name" /></Field>
                  {type === 'COMPANY'
                    ? <Field label="Lavozim" hint="ixtiyoriy"><Input value={f.position} onChange={set('position')} placeholder="Direktor" autoComplete="organization-title" /></Field>
                    : <Field label="STIR" error={errors.tin} hint="ixtiyoriy"><Input value={f.tin} onChange={set('tin')} inputMode="numeric" maxLength={9} /></Field>}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Telefon" required error={errors.phone}><Input value={f.phone} onChange={set('phone')} type="tel" autoComplete="tel" /></Field>
                  <Field label="Email" required error={errors.email} hint="kirish uchun"><Input value={f.email} onChange={set('email')} type="email" autoComplete="username" /></Field>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Parol" required error={errors.password} hint="Kamida 12 belgi"><Input value={f.password} onChange={set('password')} type="password" autoComplete="new-password" /></Field>
                  <Field label="Parolni takrorlang" required error={errors.password2}><Input value={f.password2} onChange={set('password2')} type="password" autoComplete="new-password" /></Field>
                </div>
                <Field label="Qanday xizmat kerak?" hint="ixtiyoriy — menejerimizga murojaat sifatida yuboriladi" error={errors.message}>
                  <Textarea value={f.message} onChange={set('message')} rows={3} maxLength={2000} placeholder="Masalan: 3 ta do'konimiz uchun savdo va qoldiq hisobotlari kerak" />
                </Field>
                {/* Botlarga qarshi yashirin maydon (odam ko'rmaydi) */}
                <input type="text" name="website" value={f.website} onChange={set('website')} tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 opacity-0" />
                <div className="grid gap-1">
                  <Label className="flex items-start gap-2 text-sm font-normal leading-snug">
                    <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-0.5" />
                    <span>Shaxsga doir ma'lumotlarimni xizmat ko'rsatish maqsadida qayta ishlashga roziman</span>
                  </Label>
                  {errors.consent && <p className="text-xs text-destructive">{errors.consent}</p>}
                </div>
                {errors.form && <Alert variant="destructive"><AlertDescription>{errors.form}</AlertDescription></Alert>}
                <Button type="submit" disabled={m.isPending}>{m.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}Ro'yxatdan o'tish</Button>
              </form>
            )}
          </CardContent>
        </Card>
        <p className="mt-4 text-center text-sm text-muted-foreground">Kabinetingiz bormi? <Link to="/login" className="font-medium text-primary hover:underline">Kirish</Link></p>
      </div>
    </div>
  );
}
