import { useQuery } from '@tanstack/react-query';
import { useCan } from '@/lib/auth';
import { filesQuery } from './api';
import { FileTable } from './file-table';
import { DropZone, UploadButton } from './upload';

/** Entity kartochkasidagi "Fayllar" tab'i: shu obyektga biriktirilgan hujjatlar. */
export function EntityFiles({ entityType, entityId }: { entityType: string; entityId: string }) {
  const can = useCan();
  const { data, isLoading } = useQuery(filesQuery({ entityType, entityId }));
  const target = { entityType, entityId };
  return (
    <div className="grid gap-3">
      {can('files:upload') && <div className="flex items-center gap-3"><UploadButton target={target} size="sm" /><span className="text-xs text-muted-foreground">yoki fayllarni ro'yxatga sudrab tashlang</span></div>}
      <DropZone target={target}>
        <FileTable files={data?.items} loading={isLoading} empty="Biriktirilgan fayllar yo'q" />
      </DropZone>
    </div>
  );
}
