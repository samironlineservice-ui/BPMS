import { useQueryClient } from '@tanstack/react-query';
import { Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import type { FileItem } from '@ads/contracts';
import { Button } from '@/components/ui/button';
import { uploadWithProgress } from '@/lib/api';
import { handleApiError } from '@/lib/errors';
import { cn } from '@/lib/utils';

export interface UploadTarget { folderId?: string; entityType?: string; entityId?: string; label?: string; previousVersionId?: string }

export function useUploader(target: UploadTarget) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const upload = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length) return;
    setBusy(true);
    try {
      for (const file of list) {
        const id = toast.loading(`${file.name}: 0%`);
        const fd = new FormData();
        for (const [k, v] of Object.entries(target)) if (v) fd.append(k, v); // maydonlar fayldan oldin
        fd.append('file', file, file.name);
        try {
          await uploadWithProgress<FileItem>('/files', fd, (p) => toast.loading(`${file.name}: ${p}%`, { id }));
          toast.success(`${file.name} yuklandi`, { id });
        } catch (e) {
          toast.dismiss(id);
          handleApiError(e);
        }
      }
    } finally {
      setBusy(false);
      void qc.invalidateQueries({ queryKey: ['files'] });
      void qc.invalidateQueries({ queryKey: ['folders'] });
    }
  };
  return { upload, busy };
}

export function UploadButton({ target, label = 'Yuklash', multiple = true, variant = 'default', size }: {
  target: UploadTarget; label?: string; multiple?: boolean; variant?: 'default' | 'outline' | 'ghost'; size?: 'sm' | 'default' | 'icon';
}) {
  const ref = useRef<HTMLInputElement>(null);
  const { upload, busy } = useUploader(target);
  return (
    <>
      <input ref={ref} type="file" multiple={multiple} className="hidden" onChange={(e) => { if (e.target.files) void upload(e.target.files); e.target.value = ''; }} />
      <Button type="button" variant={variant} size={size} disabled={busy} onClick={() => ref.current?.click()}>
        <Upload className={cn('size-4', size !== 'icon' && 'mr-2')} />{size !== 'icon' && label}
      </Button>
    </>
  );
}

/** Fayllarni sudrab tashlash maydoni (butun ro'yxat ustida). */
export function DropZone({ target, children, className }: { target: UploadTarget; children: React.ReactNode; className?: string }) {
  const { upload } = useUploader(target);
  const [over, setOver] = useState(false);
  return (
    <div
      className={cn('relative', className)}
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setOver(true); } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false); }}
      onDrop={(e) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files.length) void upload(e.dataTransfer.files); }}
    >
      {children}
      {over && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-primary/5 text-sm font-medium text-primary">
          Fayllarni shu yerga tashlang
        </div>
      )}
    </div>
  );
}
