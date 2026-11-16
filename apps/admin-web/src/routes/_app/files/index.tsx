import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { ChevronRight, Folder, FolderPlus, HardDrive, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import type { FolderItem } from '@ads/contracts';
import { Confirm } from '@/components/common/confirm';
import { PageHeader } from '@/components/common/page-header';
import { SearchInput } from '@/components/common/search-input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { TableCell, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import { useCan } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { filesQuery, foldersQuery } from '@/features/files/api';
import { FileTable } from '@/features/files/file-table';
import { DropZone, UploadButton } from '@/features/files/upload';

const search = z.object({ folder: z.string().optional(), q: z.string().optional() });
export const Route = createFileRoute('/_app/files/')({ validateSearch: search, component: FilesPage });

function NameDialog({ open, onOpenChange, title, initial = '', onSubmit }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; initial?: string; onSubmit: (name: string) => Promise<unknown>;
}) {
  const [name, setName] = useState(initial);
  const m = useMutation({ mutationFn: () => onSubmit(name.trim()), onSuccess: () => onOpenChange(false), onError: (e) => handleApiError(e) });
  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (o) setName(initial); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) m.mutate(); }} className="grid gap-4">
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Papka nomi" maxLength={120} />
          <DialogFooter><Button type="submit" disabled={!name.trim() || m.isPending}>Saqlash</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FolderRow({ f }: { f: FolderItem }) {
  const can = useCan();
  const qc = useQueryClient();
  const [rename, setRename] = useState(false);
  const [del, setDel] = useState(false);
  return (
    <TableRow>
      <TableCell>
        <Link to="/files" search={{ folder: f.id }} className="flex items-center gap-2 font-medium hover:underline">
          <Folder className="size-4 fill-primary/15 text-primary" />{f.name}
        </Link>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">{f.folderCount ? `${f.folderCount} papka, ` : ''}{f.fileCount} fayl</TableCell>
      <TableCell /><TableCell />
      <TableCell className="w-12 text-right">
        {can('files:upload') && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Amallar"><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setRename(true)}><Pencil className="size-4" />Nomini o'zgartirish</DropdownMenuItem>
              {can('files:delete') && <DropdownMenuItem className="text-destructive" onSelect={() => setDel(true)}><Trash2 className="size-4" />O'chirish</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <NameDialog open={rename} onOpenChange={setRename} title="Nomini o'zgartirish" initial={f.name}
          onSubmit={async (name) => { await api.patch(`/folders/${f.id}`, { name }); void qc.invalidateQueries({ queryKey: ['folders'] }); }} />
        <Confirm open={del} onOpenChange={setDel} destructive title={`"${f.name}" papkasini o'chirish`} description="Faqat bo'sh papkani o'chirish mumkin." confirmText="O'chirish"
          onConfirm={async () => { try { await api.delete(`/folders/${f.id}`); toast.success("O'chirildi"); void qc.invalidateQueries({ queryKey: ['folders'] }); } catch (e) { handleApiError(e); } }} />
      </TableCell>
    </TableRow>
  );
}

function FilesPage() {
  const s = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const can = useCan();
  const qc = useQueryClient();
  const [newFolder, setNewFolder] = useState(false);
  const folders = useQuery({ ...foldersQuery(s.folder), enabled: !s.q });
  const files = useQuery(filesQuery(s.q ? { q: s.q } : { folderId: s.folder ?? 'root' }));
  const target = { folderId: s.folder };
  return (
    <>
      <PageHeader title="Fayllar" description="Hujjatlar, shartnomalar, dalolatnomalar va boshqa fayllar"
        actions={can('files:upload') && (
          <>
            <Button variant="outline" onClick={() => setNewFolder(true)}><FolderPlus className="mr-2 size-4" />Yangi papka</Button>
            <UploadButton target={target} />
          </>
        )} />
      <NameDialog open={newFolder} onOpenChange={setNewFolder} title="Yangi papka"
        onSubmit={async (name) => { await api.post('/folders', { name, parentId: s.folder ?? null }); void qc.invalidateQueries({ queryKey: ['folders'] }); }} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <nav className="flex flex-wrap items-center gap-1 text-sm" aria-label="Papka yo'li">
          <Link to="/files" search={{}} className="flex items-center gap-1 text-muted-foreground hover:text-foreground"><HardDrive className="size-4" />Barcha fayllar</Link>
          {!s.q && folders.data?.breadcrumb.map((b) => (
            <span key={b.id} className="flex items-center gap-1">
              <ChevronRight className="size-3.5 text-muted-foreground" />
              <Link to="/files" search={{ folder: b.id }} className={b.id === s.folder ? 'font-medium' : 'text-muted-foreground hover:text-foreground'}>{b.name}</Link>
            </span>
          ))}
          {s.q && <span className="flex items-center gap-1"><ChevronRight className="size-3.5 text-muted-foreground" />Qidiruv: "{s.q}"</span>}
        </nav>
        <SearchInput value={s.q} onChange={(q) => navigate({ search: (prev) => ({ ...prev, q }) })} placeholder="Fayl nomi bo'yicha…" />
      </div>
      <DropZone target={target}>
        <FileTable files={files.data?.items} loading={files.isLoading}
          empty={s.q ? 'Hech narsa topilmadi' : "Bu papka bo'sh. Fayllarni shu yerga sudrab tashlang."}
          prefix={!s.q && folders.data?.folders.length ? folders.data.folders.map((f) => <FolderRow key={f.id} f={f} />) : undefined} />
      </DropZone>
    </>
  );
}
