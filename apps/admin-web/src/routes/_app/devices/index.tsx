import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { z } from 'zod';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { useCan } from '@/lib/auth';
import { DeviceFormSheet } from '@/features/devices/device-forms';
import { DevicesTable } from '@/features/devices/tables';

const search = z.object({ page: z.number().int().min(1).catch(1).default(1), q: z.string().optional(), status: z.string().optional(), deviceClass: z.string().optional() });
export const Route = createFileRoute('/_app/devices/')({ validateSearch: search, component: DevicesPage });

function DevicesPage() {
  const s = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const can = useCan();
  return (
    <>
      <PageHeader title="Qurilmalar" description="Mijozlardagi va kompaniyadagi qurilmalar: serverlar, Raspberry Pi, GPU serverlar, VPS, ESP32"
        actions={can('devices:create') && <DeviceFormSheet trigger={<Button><Plus className="mr-2 size-4" />Qurilma qo'shish</Button>} />} />
      <DevicesTable filters={{ value: s, set: (p) => navigate({ search: (prev) => ({ ...prev, ...p }) }) }} />
    </>
  );
}
