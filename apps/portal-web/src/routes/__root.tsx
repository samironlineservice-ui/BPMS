import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, Link, Outlet } from '@tanstack/react-router';

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: Outlet,
  notFoundComponent: () => (
    <div className="flex min-h-svh flex-col items-center justify-center gap-2 p-6 text-center">
      <div className="text-4xl font-semibold">404</div>
      <p className="text-muted-foreground">Sahifa topilmadi</p>
      <Link to="/" className="text-primary hover:underline">Bosh sahifa</Link>
    </div>
  ),
});
