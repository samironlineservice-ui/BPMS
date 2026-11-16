import { useQuery } from '@tanstack/react-query';
import { Link, useRouterState } from '@tanstack/react-router';
import { Boxes } from 'lucide-react';
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton,
  SidebarMenuBadge, SidebarMenuItem, SidebarRail,
} from '@/components/ui/sidebar';
import { inboxQuery } from '@/features/billing/api';
import { requestCountsQuery } from '@/features/requests/api';
import { useCan } from '@/lib/auth';
import { NAV } from './nav';

export function AppSidebar() {
  const can = useCan();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const inbox = useQuery({ ...inboxQuery, enabled: can('approvals:read') });
  const pending = inbox.data?.filter((i) => i.canDecide).length ?? 0;
  const requests = useQuery({ ...requestCountsQuery, enabled: can('requests:read') });
  const awaiting = requests.data?.unread ?? 0;
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to="/">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Boxes className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">ADS-ERP</span>
                  <span className="truncate text-xs text-muted-foreground">Boshqaruv tizimi</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {NAV.map((g) => {
          const items = g.items.filter((i) => can(i.perm));
          if (!items.length) return null;
          return (
            <SidebarGroup key={g.title}>
              <SidebarGroupLabel>{g.title}</SidebarGroupLabel>
              <SidebarMenu>
                {items.map((i) => {
                  const active = i.to === '/' ? path === '/' : path.startsWith(i.to);
                  return (
                    <SidebarMenuItem key={i.to}>
                      <SidebarMenuButton asChild isActive={active} tooltip={i.title}>
                        <Link to={i.to}>
                          <i.icon />
                          <span>{i.title}</span>
                        </Link>
                      </SidebarMenuButton>
                      {i.to === '/approvals' && pending > 0 && <SidebarMenuBadge className="bg-warning/20 text-warning">{pending}</SidebarMenuBadge>}
                      {i.to === '/requests' && awaiting > 0 && <SidebarMenuBadge className="bg-destructive/15 text-destructive">{awaiting}</SidebarMenuBadge>}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroup>
          );
        })}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
