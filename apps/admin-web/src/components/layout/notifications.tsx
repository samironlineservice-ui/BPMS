import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Bell, CheckCheck, Send } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { api } from '@/lib/api';
import { handleApiError } from '@/lib/errors';
import { ago } from '@/lib/format';
import { cn } from '@/lib/utils';

interface NotificationsDto { unread: number; items: { id: string; eventType: string; title: string; body: string; link: string | null; createdAt: string; read: boolean }[] }

/** Header'dagi qo'ng'iroqcha: tizim ichidagi bildirishnomalar (har daqiqada yangilanadi). */
export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data } = useQuery({ queryKey: ['notifications'], queryFn: () => api.get<NotificationsDto>('/notifications'), refetchInterval: 60_000 });
  const read = useMutation({
    mutationFn: (ids?: string[]) => api.post('/notifications/read', { ids }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`Bildirishnomalar${data?.unread ? ` (${data.unread} yangi)` : ''}`}>
          <Bell className="size-4" />
          {!!data?.unread && <span className="absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white">{data.unread > 99 ? '99+' : data.unread}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-medium">Bildirishnomalar</span>
          {!!data?.unread && <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => read.mutate(undefined)}><CheckCheck className="mr-1 size-3.5" />Hammasi o'qildi</Button>}
        </div>
        <ScrollArea className="max-h-96">
          {data?.items.map((n) => (
            <button key={n.id} type="button" className={cn('grid w-full gap-0.5 border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-muted', !n.read && 'bg-primary/5')}
              onClick={() => { if (!n.read) read.mutate([n.id]); setOpen(false); if (n.link) void navigate({ to: n.link }); }}>
              <span className="flex items-center gap-2 font-medium">{!n.read && <span className="size-1.5 shrink-0 rounded-full bg-primary" />}{n.title}</span>
              <span className="text-xs text-muted-foreground">{n.body}</span>
              <span className="text-[10px] text-muted-foreground">{ago(n.createdAt)}</span>
            </button>
          ))}
          {data && !data.items.length && <p className="px-3 py-8 text-center text-sm text-muted-foreground">Bildirishnomalar yo'q</p>}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

/** Profil menyusidan: Telegram'ni ulash (bir martalik havola, 10 daqiqa). */
export function TelegramDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['telegram'], queryFn: () => api.get<{ enabled: boolean; linked: boolean; linkedAt: string | null }>('/me/telegram'), enabled: open });
  const [url, setUrl] = useState<string | null>(null);
  const link = useMutation({ mutationFn: () => api.post<{ url: string }>('/me/telegram/link'), onSuccess: (r) => setUrl(r.url), onError: (e) => handleApiError(e) });
  const unlink = useMutation({ mutationFn: () => api.delete('/me/telegram'), onSuccess: () => { toast.success('Uzildi'); void qc.invalidateQueries({ queryKey: ['telegram'] }); } });
  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setUrl(null); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Send className="size-4" />Telegram bildirishnomalari</DialogTitle>
          <DialogDescription>Tasdiq so'rovlari, kechikkan to'lovlar va deployment natijalari Telegram'ga ham keladi.</DialogDescription>
        </DialogHeader>
        {data && !data.enabled && <p className="text-sm text-muted-foreground">Bot hali sozlanmagan (server .env: TELEGRAM_BOT_TOKEN). Hozircha bildirishnomalar tizim ichida (qo'ng'iroqcha).</p>}
        {data?.enabled && data.linked && (
          <div className="grid gap-3 text-sm"><p>✅ Telegram ulangan.</p><Button variant="outline" onClick={() => unlink.mutate()}>Uzish</Button></div>
        )}
        {data?.enabled && !data.linked && (
          url
            ? <div className="grid gap-2 text-sm"><p>Havolani oching va botda «Start» ni bosing (10 daqiqa amal qiladi):</p><Button asChild><a href={url} target="_blank" rel="noreferrer">Telegram'da ochish</a></Button></div>
            : <Button disabled={link.isPending} onClick={() => link.mutate()}>Ulash havolasini olish</Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
