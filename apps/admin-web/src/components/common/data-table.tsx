import { ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  className?: string;
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[] | undefined;
  loading?: boolean;
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  empty?: React.ReactNode;
  page?: number;
  pageSize?: number;
  total?: number;
  onPageChange?: (page: number) => void;
}

export function DataTable<T>({ columns, rows, loading, rowKey, onRowClick, empty, page, pageSize, total, onPageChange }: Props<T>) {
  const pages = total && pageSize ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  return (
    <div className="rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((c) => (
              <TableHead key={c.key} className={c.className}>{c.header}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading && !rows
            ? Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {columns.map((c) => (
                    <TableCell key={c.key}><Skeleton className="h-4 w-full max-w-40" /></TableCell>
                  ))}
                </TableRow>
              ))
            : rows?.map((r) => (
                <TableRow key={rowKey(r)} onClick={onRowClick ? () => onRowClick(r) : undefined} className={cn(onRowClick && 'cursor-pointer')}>
                  {columns.map((c) => (
                    <TableCell key={c.key} className={c.className}>{c.cell(r)}</TableCell>
                  ))}
                </TableRow>
              ))}
          {!loading && rows?.length === 0 && (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-32 text-center text-muted-foreground">
                <div className="flex flex-col items-center gap-2">
                  <Inbox className="size-6 opacity-50" />
                  {empty ?? "Hozircha ma'lumot yo'q"}
                </div>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {onPageChange && total !== undefined && total > (pageSize ?? 20) && (
        <div className="flex items-center justify-between border-t px-4 py-2 text-sm text-muted-foreground">
          <span>Jami: {total}</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="size-8" disabled={(page ?? 1) <= 1} onClick={() => onPageChange((page ?? 1) - 1)}>
              <ChevronLeft className="size-4" />
            </Button>
            <span>{page} / {pages}</span>
            <Button variant="outline" size="icon" className="size-8" disabled={(page ?? 1) >= pages} onClick={() => onPageChange((page ?? 1) + 1)}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
