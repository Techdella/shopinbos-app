'use client';
import { createApiClient } from '@shopinbos/api-client';
import { ApiProvider } from '@shopinbos/api-client/react';
import { ToastProvider } from '@shopinbos/ui-web';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } }),
  );
  // Same-origin: the web session cookie authenticates /api calls.
  const [api] = useState(() => createApiClient({ baseUrl: '' }));
  return (
    <QueryClientProvider client={queryClient}>
      <ApiProvider client={api}>
        <ToastProvider>{children}</ToastProvider>
      </ApiProvider>
    </QueryClientProvider>
  );
}
