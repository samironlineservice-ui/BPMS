import { Construction } from 'lucide-react';
import { PageHeader } from './page-header';

export function ComingSoon({ title }: { title: string }) {
  return (
    <>
      <PageHeader title={title} />
      <div className="flex h-64 flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-muted-foreground">
        <Construction className="size-8 opacity-60" />
        <p>Bu bo'lim ishlab chiqilmoqda</p>
      </div>
    </>
  );
}
