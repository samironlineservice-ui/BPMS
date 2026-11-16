import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, Outlet, redirect, useNavigate, useRouterState } from '@tanstack/react-router';
import { Building2, ChevronDown, LogOut, Moon, Sun, UserRound, Users } from 'lucide-react';
import type { PortalRequestItem } from '@ads/contracts';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { api } from '@/lib/api';
import { meQuery, ROLE_LABELS, useAccess } from '@/lib/session';
import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ context }) => {
    try { await context.queryClient.ensureQueryData(meQuery); } catch { throw redirect({ to: '/login' }); }
  },
  component: Layout,
});

const NAV = [
  { to: '/', label: 'Bosh sahifa' },
  { to: '/subscriptions', label: 'Obunalar' },
  { to: '/services', label: 'Xizmatlar', finance: true },
  { to: '/invoices', label: "Invoice'lar", finance: true },
  { to: '/payments', label: "To'lovlar", finance: true },
  { to: '/cards', label: 'Kartalar', pay: true },
  { to: '/statement', label: 'Akt-sverka', finance: true },
  { to: '/devices', label: 'Qurilmalar' },
  { to: '/requests', label: 'Murojaatlar', badge: true },
] as const;

function Layout() {
  const qc = useQueryClient();
  const { data } = useQuery(meQuery);
  const access = useAccess();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const { resolved, setMode } = useTheme();
  const reqs = useQuery({ queryKey: ['requests'], queryFn: () => api.get<PortalRequestItem[]>('/requests'), refetchInterval: 60_000 });
  const unread = reqs.data?.filter((r) => r.unread).length ?? 0;
  const logout = async () => { await api.post('/auth/logout').catch(() => null); qc.clear(); void navigate({ to: '/login' }); };
  return (
    <div className="min-h-svh bg-muted/30">
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur print:hidden">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <Link to="/" className="flex min-w-0 items-center gap-2 font-semibold">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground"><Building2 className="size-4" /></span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate">{data?.client.name ?? 'Mijoz kabineti'}</span>
              <span className="block text-[11px] font-normal text-muted-foreground">Mijoz kabineti</span>
            </span>
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="icon" aria-label={resolved === 'dark' ? "Yorug' mavzu" : "Qorong'i mavzu"} onClick={() => setMode(resolved === 'dark' ? 'light' : 'dark')}>
              {resolved === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-9 gap-2 px-2">
                  <span className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{(data?.user.fullName ?? '?').slice(0, 1).toUpperCase()}</span>
                  <span className="hidden text-left text-xs leading-tight sm:block"><span className="block font-medium">{data?.user.fullName}</span><span className="block text-muted-foreground">{ROLE_LABELS[data?.user.role ?? ''] ?? ''}</span></span>
                  <ChevronDown className="size-3.5 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal"><div className="text-sm font-medium">{data?.user.fullName}</div><div className="text-xs text-muted-foreground">{data?.user.email}</div></DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void navigate({ to: '/profile' })}><UserRound className="mr-2 size-4" />Profil va parol</DropdownMenuItem>
                {access.team && <DropdownMenuItem onSelect={() => void navigate({ to: '/team' })}><Users className="mr-2 size-4" />Jamoa</DropdownMenuItem>}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void logout()}><LogOut className="mr-2 size-4" />Chiqish</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2 text-sm" aria-label="Bo'limlar">
          {NAV.filter((n) => (!('finance' in n) || access.finance) && (!('pay' in n) || access.pay)).map((n) => {
            const active = n.to === '/' ? path === '/' : path.startsWith(n.to);
            return (
              <Link key={n.to} to={n.to} className={cn('flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5', active ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
                {n.label}
                {'badge' in n && unread > 0 && <span className="flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white" aria-label={`${unread} ta yangi javob`}>{unread}</span>}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl p-4 md:p-6"><Outlet /></main>
    </div>
  );
}
