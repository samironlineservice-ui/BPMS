import { createFileRoute, isRedirect, Outlet, redirect } from '@tanstack/react-router';
import { AppHeader } from '@/components/layout/app-header';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { CommandMenu } from '@/components/layout/command-menu';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { meQuery } from '@/lib/auth';

export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ context, location }) => {
    try {
      const me = await context.queryClient.ensureQueryData(meQuery);
      if (!me.mfa.verified) throw redirect({ to: '/login' });
      return { me };
    } catch (e) {
      if (isRedirect(e)) throw e;
      throw redirect({ to: '/login', search: { redirect: location.href } });
    }
  },
  component: AppLayout,
});

function AppLayout() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <AppHeader />
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </SidebarInset>
      <CommandMenu />
    </SidebarProvider>
  );
}
