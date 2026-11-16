import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { z } from 'zod';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { useCan } from '@/lib/auth';
import { ReleaseCreateDialog } from '@/features/devices/release-forms';
import { ReleasesTable } from '@/features/devices/tables';

const search = z.object({ page: z.number().int().min(1).catch(1).default(1), q: z.string().optional(), status: z.string().optional() });
export const Route = createFileRoute('/_app/releases/')({ validateSearch: search, component: ReleasesPage });

function ReleasesPage() {
  const s = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const can = useCan();
  return (
    <>
      <PageHeader title="Versiyalar" description="Loyiha komponentlarining relizlari: fayllar, kanallar (stable/beta/canary), holat"
        actions={can('releases:create') && <ReleaseCreateDialog trigger={<Button><Plus className="mr-2 size-4" />Yangi versiya</Button>} />} />
      <ReleasesTable filters={{ value: s, set: (p) => navigate({ search: (prev) => ({ ...prev, ...p }) }) }} />
    </>
  );
}
