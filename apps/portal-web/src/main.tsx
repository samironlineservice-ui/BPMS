import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from '@/components/ui/sonner';
import { ApiError, setUnauthenticatedHandler } from '@/lib/api';
import { ThemeProvider } from '@/lib/theme';
import { routeTree } from './routeTree.gen';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: (n, e) => !(e instanceof ApiError && e.status < 500) && n < 2 } },
});
const router = createRouter({ routeTree, context: { queryClient }, defaultPreload: 'intent' });
declare module '@tanstack/react-router' {
  interface Register { router: typeof router }
}
setUnauthenticatedHandler(() => {
  queryClient.clear();
  if (!['/login', '/invite', '/register'].some((x) => location.pathname.startsWith(x))) void router.navigate({ to: '/login' });
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <Toaster richColors position="top-right" />
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
