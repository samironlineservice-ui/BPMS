import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Send } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { type PortalDevice, type PortalSubscription, REQUEST_CATEGORY_LABELS, requestCreateSchema } from '@ads/contracts';
import { Field } from '@/components/common/field';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { api, errorText } from '@/lib/api';
import { requireAccess } from '@/lib/session';

const search = z.object({
  category: z.enum(['SUPPORT', 'CHANGE', 'BILLING', 'DEVICE', 'OTHER']).optional().catch(undefined),
  subscriptionId: z.uuid().optional().catch(undefined),
  deviceId: z.uuid().optional().catch(undefined),
});

export const Route = createFileRoute('/_app/requests/new')({
  validateSearch: (s: Record<string, unknown>) => search.parse(s),
  beforeLoad: requireAccess('writeRequests'),
  component: NewRequest,
});

const HINTS: Record<string, string> = {
  SUPPORT: "Dastur ishlamayapti, xato chiqyapti yoki sekin ishlayapti",
  CHANGE: "Tarif, miqdor (filial/qurilma soni) yoki xizmat tarkibini o'zgartirish",
  BILLING: "Invoice, to'lov, akt-sverka bo'yicha savol",
  DEVICE: "Qurilmani ulash, ko'chirish, yangilash yoki muammo",
  OTHER: 'Boshqa savol yoki taklif',
};
const NONE = '__none__';

function NewRequest() {
  const s = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [category, setCategory] = useState<string>(s.category ?? (s.deviceId ? 'DEVICE' : 'SUPPORT'));
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [subscriptionId, setSubscriptionId] = useState(s.subscriptionId ?? NONE);
  const [deviceId, setDeviceId] = useState(s.deviceId ?? NONE);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const subs = useQuery({ queryKey: ['subscriptions'], queryFn: () => api.get<PortalSubscription[]>('/subscriptions') });
  const devices = useQuery({ queryKey: ['devices'], queryFn: () => api.get<PortalDevice[]>('/devices') });
  const m = useMutation({
    mutationFn: (input: unknown) => api.post<{ id: string; code: string }>('/requests', input),
    onSuccess: (r) => {
      toast.success(`Murojaat yuborildi: ${r.code}`);
      void qc.invalidateQueries({ queryKey: ['requests'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      void navigate({ to: '/requests/$requestId', params: { requestId: r.id } });
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const input = { category, subject, body, subscriptionId: subscriptionId === NONE ? null : subscriptionId, deviceId: deviceId === NONE ? null : deviceId };
    const r = requestCreateSchema.safeParse(input);
    if (!r.success) {
      setErrors(Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    m.mutate(r.data);
  };
  return (
    <>
      <Link to="/requests" className="mb-3 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="mr-1 size-4" />Murojaatlar</Link>
      <PageHeader title="Yangi murojaat" description="Mutaxassislarimiz murojaatni ko'rib chiqib, shu yerda javob beradi" />
      <Card className="max-w-2xl">
        <CardContent>
          <form className="grid gap-4" onSubmit={submit}>
            <Field label="Murojaat turi" hint={HINTS[category]}>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(REQUEST_CATEGORY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Mavzu" required error={errors.subject}>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} placeholder="Masalan: Kunlik hisobot ochilmayapti" />
            </Field>
            <Field label="Batafsil" required error={errors.body} hint="Nima bo'ldi, qachondan beri, qaysi filial yoki qurilmada — qancha aniq bo'lsa, shuncha tez hal qilamiz">
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} maxLength={5000} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Xizmat (ixtiyoriy)">
                <Select value={subscriptionId} onValueChange={setSubscriptionId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— tanlanmagan —</SelectItem>
                    {subs.data?.map((x) => <SelectItem key={x.id} value={x.id}>{x.projectName} · {x.code}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Qurilma (ixtiyoriy)">
                <Select value={deviceId} onValueChange={setDeviceId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— tanlanmagan —</SelectItem>
                    {devices.data?.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}{d.siteName ? ` · ${d.siteName}` : ''}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => void navigate({ to: '/requests' })}>Bekor qilish</Button>
              <Button type="submit" disabled={m.isPending}><Send className="mr-2 size-4" />Yuborish</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
