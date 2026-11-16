import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Eye, File as FileIcon, FileArchive, FileImage, FileSpreadsheet, FileText, History, MoreHorizontal, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import type { FileItem } from '@ads/contracts';
import { Confirm } from '@/components/common/confirm';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import { useCan } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { bytes, dateTime } from '@/lib/format';
import { downloadUrl, versionsQuery } from './api';
import { useUploader } from './upload';

const INLINE = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'text/plain', 'text/csv']);

export function FileTypeIcon({ mime }: { mime: string }) {
  const cls = 'size-4 shrink-0 text-muted-foreground';
  if (mime.startsWith('image/')) return <FileImage className={cls} />;
  if (mime === 'application/pdf' || mime.startsWith('text/') || mime.includes('wordprocessing')) return <FileText className={cls} />;
  if (mime.includes('spreadsheet') || mime === 'text/csv') return <FileSpreadsheet className={cls} />;
  if (/zip|gzip|tar|7z|rar/.test(mime)) return <FileArchive className={cls} />;
  return <FileIcon className={cls} />;
}

function Versions({ file, open, onOpenChange }: { file: FileItem; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data } = useQuery({ ...versionsQuery(file.id), enabled: open });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader><DialogTitle>Versiyalar: {file.name}</DialogTitle></DialogHeader>
        <div className="grid gap-2">
          {data?.map((v) => (
            <div key={v.id} className="flex items-center justify-between gap-3 rounded-md border p-2 text-sm">
              <div className="min-w-0">
                <div className="flex items-center gap-2 font-medium"><Badge variant="outline">v{v.version}</Badge><span className="truncate">{v.name}</span></div>
                <div className="text-xs text-muted-foreground">{bytes(v.sizeBytes)} · {v.uploadedBy ?? '—'} · {dateTime(v.createdAt)}</div>
                <div className="truncate font-mono text-[10px] text-muted-foreground">sha256 {v.sha256}</div>
              </div>
              <Button variant="ghost" size="icon" asChild><a href={downloadUrl(v.id)} aria-label="Yuklab olish"><Download className="size-4" /></a></Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ f }: { f: FileItem }) {
  const can = useCan();
  const qc = useQueryClient();
  const [versions, setVersions] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const verInput = useRef<HTMLInputElement>(null);
  const { upload } = useUploader({ previousVersionId: f.id });
  return (
    <TableRow>
      <TableCell>
        <a href={downloadUrl(f.id)} className="flex min-w-0 items-center gap-2 font-medium hover:underline">
          <FileTypeIcon mime={f.mimeType} /><span className="truncate">{f.name}</span>
          {f.version > 1 && <Badge variant="outline" className="ml-1">v{f.version}</Badge>}
        </a>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">{bytes(f.sizeBytes)}</TableCell>
      <TableCell className="text-sm">{f.uploadedBy ?? '—'}</TableCell>
      <TableCell className="text-sm text-muted-foreground">{dateTime(f.createdAt)}</TableCell>
      <TableCell className="w-12 text-right">
        <input ref={verInput} type="file" className="hidden" onChange={(e) => { if (e.target.files?.[0]) void upload([e.target.files[0]]); e.target.value = ''; }} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Amallar"><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild><a href={downloadUrl(f.id)}><Download className="size-4" />Yuklab olish</a></DropdownMenuItem>
            {INLINE.has(f.mimeType) && <DropdownMenuItem asChild><a href={downloadUrl(f.id, true)} target="_blank" rel="noreferrer"><Eye className="size-4" />Ko'rish</a></DropdownMenuItem>}
            <DropdownMenuItem onSelect={() => setVersions(true)}><History className="size-4" />Versiyalar</DropdownMenuItem>
            {can('files:upload') && <DropdownMenuItem onSelect={() => verInput.current?.click()}><Upload className="size-4" />Yangi versiya yuklash</DropdownMenuItem>}
            {can('files:delete') && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setConfirmDel(true)} className="text-destructive"><Trash2 className="size-4" />O'chirish</DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <Versions file={f} open={versions} onOpenChange={setVersions} />
        <Confirm open={confirmDel} onOpenChange={setConfirmDel} destructive title={`"${f.name}" ni o'chirish`} description="Faylning barcha versiyalari o'chiriladi." confirmText="O'chirish"
          onConfirm={async () => { try { await api.delete(`/files/${f.id}`); toast.success("O'chirildi"); void qc.invalidateQueries({ queryKey: ['files'] }); void qc.invalidateQueries({ queryKey: ['folders'] }); } catch (e) { handleApiError(e); } }} />
      </TableCell>
    </TableRow>
  );
}

export function FileTable({ files, loading, empty = "Fayllar yo'q", prefix }: { files?: FileItem[]; loading?: boolean; empty?: string; prefix?: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card">
      <Table>
        <TableHeader><TableRow><TableHead>Nomi</TableHead><TableHead>Hajmi</TableHead><TableHead>Yuklagan</TableHead><TableHead>Sana</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>
          {prefix}
          {loading && [0, 1, 2].map((i) => <TableRow key={i}><TableCell colSpan={5}><Skeleton className="h-5" /></TableCell></TableRow>)}
          {files?.map((f) => <Row key={f.id} f={f} />)}
          {!loading && !files?.length && !prefix && <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">{empty}</TableCell></TableRow>}
        </TableBody>
      </Table>
    </div>
  );
}
