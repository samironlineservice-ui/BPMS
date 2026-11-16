import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: () => <Outlet />,
  notFoundComponent: () => (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2 text-center">
      <div className="text-5xl font-bold text-muted-foreground">404</div>
      <p className="text-muted-foreground">Sahifa topilmadi</p>
    </div>
  ),
});
