import {
  BarChart3, CheckCircle2, FileText, Folder, FolderKanban, Landmark, LayoutDashboard, MessageSquare, Package, Repeat, Rocket,
  ScrollText, Server, Settings, ShieldCheck, UserCog, Users, Wallet, type LucideIcon,
} from 'lucide-react';

export interface NavItem { title: string; to: string; icon: LucideIcon; perm: string; }
export interface NavGroup { title: string; items: NavItem[]; }

export const NAV: NavGroup[] = [
  { title: 'Asosiy', items: [{ title: 'Bosh sahifa', to: '/', icon: LayoutDashboard, perm: 'dashboard:read' }] },
  {
    title: 'Mijozlar va loyihalar',
    items: [
      { title: 'Mijozlar', to: '/clients', icon: Users, perm: 'clients:read' },
      { title: 'Loyihalar', to: '/projects', icon: FolderKanban, perm: 'projects:read' },
      { title: 'Murojaatlar', to: '/requests', icon: MessageSquare, perm: 'requests:read' },
    ],
  },
  {
    title: 'Moliya',
    items: [
      { title: 'Obunalar', to: '/subscriptions', icon: Repeat, perm: 'subscriptions:read' },
      { title: 'Invoicelar', to: '/invoices', icon: FileText, perm: 'invoices:read' },
      { title: "To'lovlar", to: '/payments', icon: Wallet, perm: 'payments:read' },
      { title: 'Moliya', to: '/finance', icon: Landmark, perm: 'finance:read' },
    ],
  },
  {
    title: 'Qurilmalar va versiyalar',
    items: [
      { title: 'Qurilmalar', to: '/devices', icon: Server, perm: 'devices:read' },
      { title: 'Versiyalar', to: '/releases', icon: Package, perm: 'releases:read' },
      { title: 'Deploymentlar', to: '/deployments', icon: Rocket, perm: 'deployments:read' },
      { title: 'Fayllar', to: '/files', icon: Folder, perm: 'files:read' },
    ],
  },
  {
    title: 'Boshqaruv',
    items: [
      { title: 'Hisobotlar', to: '/reports', icon: BarChart3, perm: 'analytics:read' },
      { title: 'Tasdiqlar', to: '/approvals', icon: CheckCircle2, perm: 'approvals:read' },
      { title: 'Foydalanuvchilar', to: '/users', icon: UserCog, perm: 'users:read' },
      { title: 'Rollar', to: '/roles', icon: ShieldCheck, perm: 'users:read' },
      { title: 'Audit log', to: '/audit', icon: ScrollText, perm: 'audit:read' },
      { title: 'Sozlamalar', to: '/settings', icon: Settings, perm: 'settings:read' },
    ],
  },
];
