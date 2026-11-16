import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, FlaskConical, KeyRound, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { GATEWAY_MODE_LABELS, type GatewayConfigDto } from '@ads/contracts';
import { Field } from '@/components/common/field';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api';
import { useCan } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { dateTime } from '@/lib/format';

/** Kalitlar qayerdan olinadi (har provayderning merchant kabineti). */
const WHERE: Record<string, string> = {
  PAYME: "Payme Business kabineti → kassa → «Dasturchilar uchun»: Merchant ID (kassa ID), KEY va TEST_KEY. Sandbox: test.paycom.uz. Endpoint URL sifatida quyidagi manzilni kiriting.",
  CLICK: "Click merchant kabineti → servis sozlamalari: Service ID, Merchant ID, Merchant user ID va Secret key. Prepare va Complete URL'lari — quyidagi manzillar.",
  UZUM: "Uzum Bank merchant menejeri ulanishda beradi: Service ID va webhook login/paroli. Check/Create/Confirm/Reverse/Status URL'lari — quyidagilar.",
  PAYNET: "Paynet bilan shartnomadan keyin: Service ID va UWS login/paroli. Endpoint — quyidagi manzil.",
};
const NEEDS_MERCHANT = new Set(['PAYME', 'CLICK']);

function CopyText({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex items-center gap-1 rounded-md border bg-muted/40 py-1 pl-2 pr-1">
      <code className="min-w-0 flex-1 truncate text-xs">{text}</code>
      <Button type="button" size="icon" variant="ghost" className="size-7" aria-label="Nusxalash"
        onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { toast.error("Nusxalab bo'lmadi"); } }}>
        {done ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
      </Button>
    </div>
  );
}

function ProviderCard({ c, edit }: { c: GatewayConfigDto; edit: boolean }) {
  const qc = useQueryClient();
  const [enabled, setEnabled] = useState(c.enabled);
  const [mode, setMode] = useState(c.mode);
  const [merchantId, setMerchantId] = useState(c.merchantId);
  const [settings, setSettings] = useState<Record<string, string>>(c.settings);
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  useEffect(() => { setEnabled(c.enabled); setMode(c.mode); setMerchantId(c.merchantId); setSettings(c.settings); setSecrets({}); }, [c]);
  const m = useMutation({
    mutationFn: () => api.put(`/gateways/config/${c.provider}`, { enabled, mode, merchantId, settings, secrets }),
    onSuccess: () => { toast.success(`${c.label}: saqlandi`); void qc.invalidateQueries({ queryKey: ['gateways'] }); },
    onError: (e) => handleApiError(e),
  });
  const emulator = mode === 'EMULATOR';
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">{c.label}
            <Badge variant="outline" className={c.enabled ? 'border-success/40 text-success' : undefined}>{c.enabled ? 'yoqilgan' : "o'chirilgan"}</Badge>
            <Badge variant="outline" className={c.mode === 'PROD' ? 'border-primary/40 text-primary' : 'border-warning/50'}>{GATEWAY_MODE_LABELS[c.mode] ?? c.mode}</Badge>
          </CardTitle>
          <CardDescription className="mt-1">{WHERE[c.provider]}</CardDescription>
        </div>
        {c.updatedAt && <span className="text-xs text-muted-foreground">o'zgartirilgan {dateTime(c.updatedAt)}</span>}
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">Mijozlarga ko'rsatish (yoqilgan)<Switch checked={enabled} disabled={!edit} onCheckedChange={setEnabled} /></label>
          <Field label="Rejim">
            <Select value={mode} onValueChange={setMode} disabled={!edit}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(GATEWAY_MODE_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        </div>
        {emulator ? (
          <p className="flex items-start gap-2 rounded-md bg-warning/10 px-3 py-2 text-xs"><FlaskConical className="mt-0.5 size-3.5 shrink-0" />Emulyator kalitsiz ishlaydi va faqat lokal muhitda (production'da avtomatik o'chiq). Haqiqiy sandbox uchun «Test» rejimini tanlab, kabinetdagi test kalitlarini kiriting.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {NEEDS_MERCHANT.has(c.provider) && <Field label="Merchant ID" required><Input value={merchantId} disabled={!edit} onChange={(e) => setMerchantId(e.target.value)} className="font-mono" /></Field>}
            {c.fields.settings.map((f) => (
              <Field key={f.key} label={f.label} required={f.key === 'serviceId'}><Input value={settings[f.key] ?? ''} disabled={!edit} onChange={(e) => setSettings({ ...settings, [f.key]: e.target.value })} className="font-mono" /></Field>
            ))}
            {c.fields.secrets.map((f) => {
              const saved = c.secretKeys.includes(f.key);
              return (
                <Field key={f.key} label={<span className="inline-flex items-center gap-1"><KeyRound className="size-3.5" />{f.label}</span>} hint={saved ? "Saqlangan — o'zgartirish uchun yangisini kiriting" : 'Kiritilmagan'}>
                  <Input type="password" autoComplete="new-password" value={secrets[f.key] ?? ''} disabled={!edit} placeholder={saved ? '••••••••' : ''} onChange={(e) => setSecrets({ ...secrets, [f.key]: e.target.value })} className="font-mono" />
                </Field>
              );
            })}
          </div>
        )}
        <div className="grid gap-1.5">
          <div className="text-sm font-medium">Callback URL'lar (provayder kabinetiga kiritiladi)</div>
          {c.callbackUrls.map((u) => <CopyText key={u} text={u} />)}
        </div>
        {edit && <div><Button disabled={m.isPending} onClick={() => m.mutate()}><Save className="mr-2 size-4" />Saqlash</Button></div>}
      </CardContent>
    </Card>
  );
}

/** Sozlamalar → To'lov tizimlari: Payme, Click, Uzum, Paynet (rejim, kalitlar, callback manzillar). */
export function GatewaysTab() {
  const can = useCan();
  const { data } = useQuery({ queryKey: ['gateways', 'config'], queryFn: () => api.get<GatewayConfigDto[]>('/gateways/config') });
  const local = data?.some((c) => c.callbackUrls[0]?.includes('://localhost') || c.callbackUrls[0]?.includes('://127.0.0.1'));
  return (
    <div className="grid gap-4">
      <Alert>
        <KeyRound className="size-4" />
        <AlertTitle>Ulash tartibi</AlertTitle>
        <AlertDescription className="grid gap-1 text-sm">
          <span>1) Har provayderning merchant kabinetidan test kalitlarini oling va «Test» rejimida saqlang. 2) Callback URL'larni provayder kabinetiga kiriting. 3) Sandbox sinovlaridan o'tgach, haqiqiy kalitlar bilan «Haqiqiy to'lovlar» rejimiga o'ting.</span>
          <span>Kalitlar shifrlangan holda saqlanadi, audit jurnaliga faqat qaysi kalit o'zgargani yoziladi.</span>
          {local && <span className="font-medium">Diqqat: callback manzillari lokal (PUBLIC_API_URL). Provayder serverlari ularga yeta olmaydi — sandbox uchun ommaviy HTTPS manzil kerak (masalan, staging server yoki tunnel).</span>}
        </AlertDescription>
      </Alert>
      {data?.map((c) => <ProviderCard key={c.provider} c={c} edit={can('gateways:configure')} />)}
    </div>
  );
}
