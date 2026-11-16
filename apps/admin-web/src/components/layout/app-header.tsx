import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { KeyRound, LogOut, Monitor, Moon, Search, Send, Sun } from 'lucide-react';
import { useState } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { api } from '@/lib/api';
import { useMe } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { NotificationsBell, TelegramDialog } from './notifications';
import { PasswordDialog } from './password-dialog';

export function AppHeader() {
  const { data: me } = useMe();
  const { setMode } = useTheme();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [tg, setTg] = useState(false);
  const [pw, setPw] = useState(false);
  const initials = (me?.user.fullName ?? '?').split(' ').map((s) => s[0]).join('').slice(0, 2).toUpperCase();
  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />
      <Button variant="outline" className="h-9 w-full max-w-sm justify-start text-muted-foreground" onClick={() => window.dispatchEvent(new Event('ads:command'))}>
        <Search className="mr-2 size-4" />
        <span className="hidden sm:inline">Qidirish…</span>
        <kbd className="ml-auto hidden rounded border bg-muted px-1.5 text-[10px] font-medium sm:inline">Ctrl K</kbd>
      </Button>
      <div className="ml-auto flex items-center gap-2">
        <NotificationsBell />
        <TelegramDialog open={tg} onOpenChange={setTg} />
        <PasswordDialog open={pw} onOpenChange={setPw} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Mavzu"><Sun className="size-4 dark:hidden" /><Moon className="hidden size-4 dark:block" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setMode('light')}><Sun className="mr-2 size-4" />Yorug'</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setMode('dark')}><Moon className="mr-2 size-4" />Qorong'i</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setMode('system')}><Monitor className="mr-2 size-4" />Tizim</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-9 gap-2 px-2">
              <Avatar className="size-7"><AvatarFallback className="text-xs">{initials}</AvatarFallback></Avatar>
              <span className="hidden text-sm md:inline">{me?.user.fullName}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="text-sm">{me?.user.fullName}</div>
              <div className="text-xs font-normal text-muted-foreground">{me?.user.email}</div>
              <div className="mt-1 text-xs font-normal text-muted-foreground">{me?.roles.map((r) => r.name).join(', ')}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setPw(true)}><KeyRound className="mr-2 size-4" />Parolni o'zgartirish</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setTg(true)}><Send className="mr-2 size-4" />Telegram'ni ulash</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={async () => { await api.post('/auth/logout').catch(() => {}); qc.clear(); void navigate({ to: '/login' }); }}
            >
              <LogOut className="mr-2 size-4" />Chiqish
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
