import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { z } from 'zod';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { useCan } from '@/lib/auth';
import { PaymentDialog } from '@/features/billing/money-dialogs';
import { PaymentsTable } from '@/features/billing/tables';

const search = z.object({
  page: z.number().int().min(1).catch(1).default(1), q: z.string().optional(), status: z.string().optional(),
  currency: z.string().optional(), overdue: z.string().optional(),
});
export const Route = createFileRoute('/_app/payments/')({ validateSearch: search, component: Page });

function Page() {
  const s = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const can = useCan();
  return (
    <>
      <PageHeader title="To'lovlar" description="Qabul qilingan to'lovlar, tasdiqlash va taqsimlash"
        actions={can('payments:record') && <PaymentDialog trigger={<Button><Plus className="mr-2 size-4" />To'lov kiritish</Button>} />} />
      <PaymentsTable filters={{ value: s, set: (p) => navigate({ search: (prev) => ({ ...prev, ...p }) }) }} />
    </>
  );
}
