import { REQUEST_STATUS_LABELS } from '@ads/contracts';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const TONE: Record<string, string> = {
  OPEN: 'border-primary/30 bg-primary/10 text-primary', IN_PROGRESS: 'border-warning/40 bg-warning/15 text-warning',
  RESOLVED: 'border-success/30 bg-success/15 text-success', CLOSED: 'border-border bg-muted text-muted-foreground',
};

export function RequestStatusBadge({ status, className }: { status: string; className?: string }) {
  return <Badge variant="outline" className={cn('font-medium', TONE[status], className)}>{REQUEST_STATUS_LABELS[status] ?? status}</Badge>;
}
