import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { DetailList } from '@/components/common/detail-list';
import { GatewaysTab } from '@/features/billing/gateways-tab';
import { Field } from '@/components/common/field';
import { PageHeader } from '@/components/common/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { useCan } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { date, dateTime } from '@/lib/format';

export const Route = createFileRoute('/_app/settings/')({ component: SettingsPage });

type Company = Record<'name' | 'legalName' | 'tagline' | 'tin' | 'address' | 'bankName' | 'bankMfo' | 'bankAccount' | 'phone' | 'email', string | null>;
interface Policy { key: string; description: string; approverPermission: string; requiredApprovals: number; enabled: boolean; allowSelfApproval: boolean }
interface SystemInfo {
  dbTime: string; outbox: { pending: number; failing: number; total: number }; lastBillingRun: { date: string; status: string; invoiced: number; failed: number } | null;
  lastFxRate: { date: string; rate: string; source: string } | null; openPeriods: number; activeUsers: number; mfaEnabled: boolean;
}
const FIELDS: [keyof Company, string, string?][] = [
  ['name', 'Qisqa nom (sarlavha)'], ['legalName', 'Yuridik nomi'], ['tagline', 'Shior / tavsif'], ['tin', 'STIR'], ['address', 'Yuridik manzil'],
  ['bankName', 'Bank'], ['bankMfo', 'MFO'], ['bankAccount', 'Hisob raqami'], ['phone', 'Telefon'], ['email', 'Email'],
];
const POLICY_LABELS: Record<string, string> = {
  'deployments.production': 'Prod deployment', 'invoices.void': "Invoice'ni bekor qilish", refunds: 'Refund (pul qaytarish)', credit_notes: 'Credit note',
};

function CompanyTab() {
  const can = useCan();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['settings', 'company'], queryFn: () => api.get<Company>('/settings/company') });
  const [form, setForm] = useState<Company | null>(null);
  useEffect(() => { if (data) setForm(data); }, [data]);
  const m = useMutation({
    mutationFn: () => api.put('/settings/company', form),
    onSuccess: () => { toast.success("Saqlandi — yangi invoice PDF'larida ko'rinadi"); void qc.invalidateQueries({ queryKey: ['settings'] }); },
    onError: (e) => handleApiError(e),
  });
  if (!form) return null;
  const edit = can('settings:manage');
  return (
    <Card className="max-w-3xl">
      <CardHeader><CardTitle className="text-base">Kompaniya rekvizitlari</CardTitle><CardDescription>Invoice PDF'dagi "Yetkazib beruvchi" bloki. Oldin chiqarilgan PDF'lar o'zgarmaydi.</CardDescription></CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map(([k, label]) => (
          <Field key={k} label={label} className={k === 'address' || k === 'legalName' ? 'sm:col-span-2' : undefined}>
            <Input value={form[k] ?? ''} disabled={!edit} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
          </Field>
        ))}
        {edit && <div className="sm:col-span-2"><Button disabled={m.isPending || !form.name} onClick={() => m.mutate()}><Save className="mr-2 size-4" />Saqlash</Button></div>}
      </CardContent>
    </Card>
  );
}

function PoliciesTab() {
  const can = useCan();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['settings', 'policies'], queryFn: () => api.get<Policy[]>('/settings/approval-policies') });
  const m = useMutation({
    mutationFn: (p: Policy) => api.put(`/settings/approval-policies/${p.key}`, { enabled: p.enabled, allowSelfApproval: p.allowSelfApproval, requiredApprovals: p.requiredApprovals }),
    onSuccess: () => { toast.success('Saqlandi'); void qc.invalidateQueries({ queryKey: ['settings', 'policies'] }); },
    onError: (e) => handleApiError(e),
  });
  const edit = can('settings:manage');
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tasdiqlash qoidalari</CardTitle>
        <CardDescription>Kim tasdiqlaydi — ruxsat orqali (rahbar yoki u ruxsat bergan xodim). "O'zini tasdiqlash" yoqilgan bo'lsa, ruxsati bor xodimning o'z so'rovi darhol bajariladi.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow><TableHead>Amal</TableHead><TableHead>Tasdiqlovchi ruxsati</TableHead><TableHead>Faol</TableHead><TableHead>O'zini tasdiqlash</TableHead></TableRow></TableHeader>
          <TableBody>
            {data?.map((p) => (
              <TableRow key={p.key}>
                <TableCell className="font-medium">{POLICY_LABELS[p.key] ?? p.description}<div className="font-mono text-xs text-muted-foreground">{p.key}</div></TableCell>
                <TableCell><Badge variant="outline" className="font-mono">{p.approverPermission}</Badge></TableCell>
                <TableCell><Switch checked={p.enabled} disabled={!edit || m.isPending} onCheckedChange={(v) => m.mutate({ ...p, enabled: v })} /></TableCell>
                <TableCell><Switch checked={p.allowSelfApproval} disabled={!edit || m.isPending} onCheckedChange={(v) => m.mutate({ ...p, allowSelfApproval: v })} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="mt-3 text-xs text-muted-foreground">Qo'lda kiritilgan to'lovlarni faqat <span className="font-mono">payments:approve</span> ruxsati bor xodim tasdiqlaydi (DB darajasida majburiy).</p>
      </CardContent>
    </Card>
  );
}

function SystemTab() {
  const { data } = useQuery({ queryKey: ['settings', 'system'], queryFn: () => api.get<SystemInfo>('/settings/system'), refetchInterval: 30_000 });
  if (!data) return null;
  return (
    <Card className="max-w-3xl">
      <CardHeader><CardTitle className="text-base">Tizim holati</CardTitle></CardHeader>
      <CardContent>
        <DetailList items={[
          ['Server vaqti', dateTime(data.dbTime)],
          ['Outbox (event navbati)', <span key="o">{data.outbox.pending} kutilmoqda{data.outbox.failing ? <Badge variant="destructive" className="ml-2">{data.outbox.failing} xato bilan</Badge> : null} · jami {data.outbox.total}</span>],
          ['Oxirgi billing', data.lastBillingRun ? `${date(data.lastBillingRun.date)} · ${data.lastBillingRun.status} · ${data.lastBillingRun.invoiced} invoice, ${data.lastBillingRun.failed} xato` : '—'],
          ['Oxirgi MB kursi', data.lastFxRate ? `${date(data.lastFxRate.date)} · 1 USD = ${data.lastFxRate.rate} (${data.lastFxRate.source})` : '—'],
          ['Ochiq moliyaviy davrlar', data.openPeriods],
          ['Faol xodimlar', data.activeUsers],
          ['Ikki bosqichli tasdiqlash', data.mfaEnabled ? 'Majburiy (TOTP)' : <Badge key="mfa" variant="destructive">Vaqtincha o'chirilgan — .env: MFA_ENABLED=false (faqat lokal)</Badge>],
        ]} />
      </CardContent>
    </Card>
  );
}

function SettingsPage() {
  const can = useCan();
  return (
    <>
      <PageHeader title="Sozlamalar" description="Kompaniya rekvizitlari, tasdiqlash qoidalari va tizim holati" />
      <Tabs defaultValue="company">
        <TabsList><TabsTrigger value="company">Kompaniya</TabsTrigger>{can('gateways:read') && <TabsTrigger value="gateways">To'lov tizimlari</TabsTrigger>}<TabsTrigger value="policies">Tasdiqlash qoidalari</TabsTrigger><TabsTrigger value="system">Tizim</TabsTrigger></TabsList>
        <TabsContent value="company"><CompanyTab /></TabsContent>
        {can('gateways:read') && <TabsContent value="gateways"><GatewaysTab /></TabsContent>}
        <TabsContent value="policies"><PoliciesTab /></TabsContent>
        <TabsContent value="system"><SystemTab /></TabsContent>
      </Tabs>
    </>
  );
}
