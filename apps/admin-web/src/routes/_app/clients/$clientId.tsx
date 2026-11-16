import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { Archive, ArrowLeft, FilePlus2, Mail, MapPin, Pencil, Phone, Pin, PinOff, Plus, Repeat, Send, Star, Trash2, Wallet } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { ClientDetail } from '@ads/contracts';
import { Confirm } from '@/components/common/confirm';
import { DetailList } from '@/components/common/detail-list';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { useCan } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { dateTime } from '@/lib/format';
import { ResourceHistory } from '@/features/common-audit';
import { EntityFiles } from '@/features/files/entity-files';
import { clientNotesQuery, clientQuery } from '@/features/clients/api';
import { ClientFormSheet } from '@/features/clients/client-form';
import { balanceQuery } from '@/features/billing/api';
import { OneTimeInvoiceDialog, PaymentDialog } from '@/features/billing/money-dialogs';
import { StatementView } from '@/features/billing/statement';
import { DeviceFormSheet } from '@/features/devices/device-forms';
import { requestsQuery } from '@/features/requests/api';
import { NewRequestDialog, RequestsTable } from '@/features/requests/components';
import { DevicesTable } from '@/features/devices/tables';
import { SubscriptionCreateSheet } from '@/features/billing/subscription-forms';
import { InvoicesTable, PaymentsTable, SubscriptionsTable } from '@/features/billing/tables';
import { Money } from '@/components/common/money';
import { ClientProjectsTable } from '@/features/projects/client-projects-table';
import { ContactDialog, SiteDialog } from '@/features/clients/contact-dialog';
import { PortalUsersTab } from '@/features/clients/portal-users';
import { CopyField } from '@/features/users/invite-dialog';

export const Route = createFileRoute('/_app/clients/$clientId')({ component: ClientPage });

function ClientPage() {
  const { clientId } = Route.useParams();
  const { data: c, isLoading } = useQuery(clientQuery(clientId));
  const can = useCan();
  const qc = useQueryClient();
  const navigate = useNavigate();
  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!c) return null;
  const edit = can('clients:update');
  return (
    <>
      <Link to="/clients" className="mb-3 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="mr-1 size-4" />Mijozlar</Link>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">{c.displayName}<StatusBadge status={c.status} /></span>}
        description={`${c.code} · ${c.legalName}${c.tin ? ` · STIR ${c.tin}` : ''}`}
        actions={
          <>
            {can('subscriptions:create') && <SubscriptionCreateSheet clientId={c.id} trigger={<Button variant="outline"><Repeat className="mr-2 size-4" />Obuna</Button>} />}
            {can('invoices:issue') && can('invoices:create') && <OneTimeInvoiceDialog clientId={c.id} clientName={c.displayName} trigger={<Button variant="outline"><FilePlus2 className="mr-2 size-4" />Invoice</Button>} />}
            {can('payments:record') && <PaymentDialog clientId={c.id} clientName={c.displayName} currency={c.billingCurrency} trigger={<Button variant="outline"><Wallet className="mr-2 size-4" />To'lov</Button>} />}
            {edit && <ClientFormSheet client={c} trigger={<Button variant="outline"><Pencil className="mr-2 size-4" />Tahrirlash</Button>} />}
            {can('clients:archive') && (
              <Confirm destructive title="Mijozni arxivlash" description="Arxivlangan mijoz ro'yxatlarda ko'rinmaydi. Faol obunalar bo'lsa arxivlab bo'lmaydi." confirmText="Arxivlash"
                trigger={<Button variant="outline"><Archive className="mr-2 size-4" />Arxivlash</Button>}
                onConfirm={async () => {
                  try { await api.post(`/clients/${clientId}/archive`); toast.success('Arxivlandi'); void qc.invalidateQueries({ queryKey: ['clients'] }); void navigate({ to: '/clients' }); }
                  catch (e) { handleApiError(e); }
                }} />
            )}
          </>
        }
      />
      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">Umumiy</TabsTrigger>
          <TabsTrigger value="contacts">Kontaktlar ({c.contacts.length})</TabsTrigger>
          <TabsTrigger value="sites">Filiallar ({c.sites.length})</TabsTrigger>
          <TabsTrigger value="projects">Loyihalar ({c.projects.length})</TabsTrigger>
          {can('subscriptions:read') && <TabsTrigger value="subscriptions">Obunalar</TabsTrigger>}
          {can('invoices:read') && <TabsTrigger value="invoices">Invoice'lar</TabsTrigger>}
          {can('payments:read') && <TabsTrigger value="payments">To'lovlar</TabsTrigger>}
          {can('finance:read') && <TabsTrigger value="statement">Akt-sverka</TabsTrigger>}
          {can('devices:read') && <TabsTrigger value="devices">Qurilmalar</TabsTrigger>}
          {can('portal_users:read') && <TabsTrigger value="portal">Kabinet</TabsTrigger>}
          {can('requests:read') && <TabsTrigger value="requests">Murojaatlar</TabsTrigger>}
          <TabsTrigger value="notes">Eslatmalar</TabsTrigger>
          <TabsTrigger value="files">Fayllar</TabsTrigger>
          <TabsTrigger value="history">Tarix</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="grid gap-4">{can('invoices:read') && <Balance clientId={c.id} />}<Overview c={c} /></TabsContent>
        <TabsContent value="contacts"><Contacts c={c} edit={edit} /></TabsContent>
        <TabsContent value="sites"><Sites c={c} edit={edit} /></TabsContent>
        <TabsContent value="projects"><Projects c={c} /></TabsContent>
        <TabsContent value="subscriptions"><SubscriptionsTable clientId={c.id} /></TabsContent>
        <TabsContent value="invoices"><InvoicesTable clientId={c.id} /></TabsContent>
        <TabsContent value="payments"><PaymentsTable clientId={c.id} /></TabsContent>
        <TabsContent value="statement"><StatementView clientId={c.id} /></TabsContent>
        <TabsContent value="portal"><PortalUsersTab client={c} /></TabsContent>
        <TabsContent value="requests"><ClientRequests clientId={c.id} /></TabsContent>
        <TabsContent value="devices" className="grid gap-3">
          {can('devices:create') && <div><DeviceFormSheet clientId={c.id} trigger={<Button size="sm"><Plus className="mr-2 size-4" />Qurilma qo'shish</Button>} /></div>}
          <DevicesTable clientId={c.id} />
        </TabsContent>
        <TabsContent value="notes"><Notes clientId={c.id} edit={edit} /></TabsContent>
        <TabsContent value="files"><EntityFiles entityType="CLIENT" entityId={c.id} /></TabsContent>
        <TabsContent value="history"><Card><CardContent className="pt-6"><ResourceHistory resourceType="client" resourceId={c.id} /></CardContent></Card></TabsContent>
      </Tabs>
    </>
  );
}

function Balance({ clientId }: { clientId: string }) {
  const { data } = useQuery(balanceQuery(clientId));
  if (!data?.length) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {data.map((b) => (
        <Card key={b.currency} className={b.overdueMinor !== '0' ? 'border-destructive/50' : undefined}>
          <CardHeader className="pb-2">
            <div className="text-sm text-muted-foreground">Qarz ({b.currency}) · {b.openInvoices} ta ochiq invoice</div>
            <CardTitle className="text-xl"><Money minor={b.receivableMinor} currency={b.currency} /></CardTitle>
          </CardHeader>
          <CardContent className="grid gap-0.5 pt-0 text-xs text-muted-foreground">
            {b.overdueMinor !== '0' && <span className="font-medium text-destructive">Muddati o'tgan: <Money minor={b.overdueMinor} currency={b.currency} /></span>}
            {b.creditMinor !== '0' && <span>Avans (kredit): <Money minor={b.creditMinor} currency={b.currency} /></span>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function Overview({ c }: { c: ClientDetail }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle className="text-base">Rekvizitlar</CardTitle></CardHeader>
        <CardContent>
          <DetailList items={[
            ['Turi', c.type === 'COMPANY' ? 'Yuridik shaxs' : 'Jismoniy shaxs'],
            [c.type === 'COMPANY' ? 'Yuridik nomi' : 'F.I.Sh.', c.legalName],
            ['STIR', c.tin && <span className="font-mono">{c.tin}</span>],
            ['JSHSHIR', c.pinfl && <span className="font-mono">{c.pinfl}</span>],
            ["QQS to'lovchisi", c.vatPayer ? 'Ha' : "Yo'q"],
            ['Yuridik manzil', c.legalAddress],
            ['Hudud', c.region],
            ['Bank', c.bankName],
            ['MFO', c.bankMfo && <span className="font-mono">{c.bankMfo}</span>],
            ['Hisob raqami', c.bankAccount && <span className="font-mono">{c.bankAccount}</span>],
          ]} />
        </CardContent>
      </Card>
      <div className="grid content-start gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Billing va aloqa</CardTitle></CardHeader>
          <CardContent>
            <DetailList items={[
              ["Mas'ul menejer", c.accountManager?.fullName],
              ['Telefon', c.phone],
              ['Billing email', c.billingEmail],
              ['Hujjatlar tili', { uz: "O'zbekcha", ru: 'Ruscha', en: 'Inglizcha' }[c.preferredLocale] ?? c.preferredLocale],
              ['Billing valyutasi', c.billingCurrency],
              ['Rezident', c.isResident ? 'Ha' : "Yo'q (norezident)"],
              ['Teglar', c.tags.length ? <div className="flex flex-wrap gap-1">{c.tags.map((t) => <Badge key={t} variant="secondary">{t}</Badge>)}</div> : null],
            ]} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Shaxsiy hisob raqami</CardTitle></CardHeader>
          <CardContent className="grid gap-2">
            <CopyField value={c.accountNo} />
            <p className="text-xs text-muted-foreground">Mijoz Payme/Click/Uzum ilovasida shu raqam bilan balansini to'ldiradi (integratsiya keyingi bosqichda).</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Contacts({ c, edit }: { c: ClientDetail; edit: boolean }) {
  const qc = useQueryClient();
  return (
    <div className="grid gap-3">
      {edit && <div><ContactDialog clientId={c.id} trigger={<Button size="sm"><Plus className="mr-2 size-4" />Kontakt qo'shish</Button>} /></div>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {c.contacts.map((x) => (
          <Card key={x.id}>
            <CardContent className="grid gap-2 pt-6 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 font-medium">{x.fullName}{x.isPrimary && <Star className="size-3.5 fill-warning text-warning" aria-label="Asosiy" />}</div>
                  <div className="text-xs text-muted-foreground">{x.position ?? '—'}</div>
                </div>
                {edit && (
                  <div className="flex">
                    <ContactDialog clientId={c.id} contact={x} trigger={<Button variant="ghost" size="icon" aria-label="Tahrirlash"><Pencil className="size-4" /></Button>} />
                    <Confirm destructive title="Kontaktni o'chirish" trigger={<Button variant="ghost" size="icon" aria-label="O'chirish"><Trash2 className="size-4" /></Button>}
                      onConfirm={async () => { await api.delete(`/clients/${c.id}/contacts/${x.id}`).catch(handleApiError); void qc.invalidateQueries({ queryKey: ['clients', c.id] }); }} />
                  </div>
                )}
              </div>
              {x.phone && <a href={`tel:${x.phone}`} className="flex items-center gap-2 hover:underline"><Phone className="size-3.5 text-muted-foreground" />{x.phone}</a>}
              {x.email && <a href={`mailto:${x.email}`} className="flex items-center gap-2 hover:underline"><Mail className="size-3.5 text-muted-foreground" />{x.email}</a>}
              {x.telegram && <span className="flex items-center gap-2"><Send className="size-3.5 text-muted-foreground" />{x.telegram}</span>}
              {x.isBilling && <Badge variant="outline" className="w-fit">Hisob-fakturalar</Badge>}
            </CardContent>
          </Card>
        ))}
      </div>
      {!c.contacts.length && <p className="text-sm text-muted-foreground">Kontaktlar yo'q</p>}
    </div>
  );
}

function Sites({ c, edit }: { c: ClientDetail; edit: boolean }) {
  const qc = useQueryClient();
  return (
    <div className="grid gap-3">
      {edit && <div><SiteDialog clientId={c.id} trigger={<Button size="sm"><Plus className="mr-2 size-4" />Filial qo'shish</Button>} /></div>}
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader><TableRow><TableHead>Nomi</TableHead><TableHead>Manzil</TableHead><TableHead>Vaqt zonasi</TableHead><TableHead className="text-right">Qurilmalar</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {c.sites.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell className="text-sm"><span className="flex items-center gap-1"><MapPin className="size-3.5 text-muted-foreground" />{[s.region, s.address].filter(Boolean).join(', ') || '—'}</span></TableCell>
                <TableCell className="text-sm text-muted-foreground">{s.timezone}</TableCell>
                <TableCell className="text-right">{s.deviceCount}</TableCell>
                <TableCell className="w-24 text-right">
                  {edit && (
                    <>
                      <SiteDialog clientId={c.id} site={s} trigger={<Button variant="ghost" size="icon" aria-label="Tahrirlash"><Pencil className="size-4" /></Button>} />
                      <Confirm destructive title="Filialni o'chirish" trigger={<Button variant="ghost" size="icon" aria-label="O'chirish"><Trash2 className="size-4" /></Button>}
                        onConfirm={async () => { await api.delete(`/clients/${c.id}/sites/${s.id}`).catch(handleApiError); void qc.invalidateQueries({ queryKey: ['clients', c.id] }); }} />
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {!c.sites.length && <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">Filiallar yo'q</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function Projects({ c }: { c: ClientDetail }) {
  return <ClientProjectsTable clientId={c.id} />;
}

function Notes({ clientId, edit }: { clientId: string; edit: boolean }) {
  const qc = useQueryClient();
  const { data } = useQuery(clientNotesQuery(clientId));
  const [body, setBody] = useState('');
  const [pinned, setPinned] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ['clients', clientId, 'notes'] });
  const add = useMutation({
    mutationFn: () => api.post(`/clients/${clientId}/notes`, { body, pinned }),
    onSuccess: () => { setBody(''); setPinned(false); void refresh(); },
    onError: (e) => handleApiError(e),
  });
  return (
    <div className="grid max-w-3xl gap-4">
      {edit && (
        <Card>
          <CardContent className="grid gap-3 pt-6">
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Qo'ng'iroq, uchrashuv, kelishuvlar…" rows={3} />
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={pinned} onCheckedChange={(v) => setPinned(v === true)} />Tepaga qadash</label>
              <Button size="sm" disabled={!body.trim() || add.isPending} onClick={() => add.mutate()}>Qo'shish</Button>
            </div>
          </CardContent>
        </Card>
      )}
      {data?.map((n) => (
        <Card key={n.id} className={n.pinned ? 'border-warning/50' : undefined}>
          <CardContent className="grid gap-2 pt-6">
            <p className="text-sm whitespace-pre-wrap">{n.body}</p>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{n.author} · {dateTime(n.createdAt)}</span>
              {edit && (
                <Button variant="ghost" size="sm" onClick={async () => { await api.patch(`/clients/${clientId}/notes/${n.id}`, { pinned: !n.pinned }).catch(handleApiError); void refresh(); }}>
                  {n.pinned ? <><PinOff className="mr-1 size-3.5" />Qadashni olish</> : <><Pin className="mr-1 size-3.5" />Qadash</>}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
      {data && !data.length && <p className="text-sm text-muted-foreground">Eslatmalar yo'q</p>}
    </div>
  );
}

function ClientRequests({ clientId }: { clientId: string }) {
  const can = useCan();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery(requestsQuery({ clientId, status: 'all', page }));
  return (
    <div className="grid gap-3">
      {can('requests:manage') && <div className="flex justify-end"><Button size="sm" onClick={() => setOpen(true)}><Plus className="mr-2 size-4" />Murojaat ochish</Button></div>}
      <RequestsTable rows={data?.items} loading={isLoading} page={page} total={data?.total} onPageChange={setPage} hideClient />
      <NewRequestDialog clientId={clientId} open={open} onOpenChange={setOpen} />
    </div>
  );
}
