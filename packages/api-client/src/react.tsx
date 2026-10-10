import { useMutation, useQuery } from '@tanstack/react-query';
import { createContext, useContext, type ReactNode } from 'react';
import type { ApiClient } from './client';
import { queryKeys } from './index';

const ApiContext = createContext<ApiClient | null>(null);

export function ApiProvider({ client, children }: { client: ApiClient; children: ReactNode }) {
  return <ApiContext.Provider value={client}>{children}</ApiContext.Provider>;
}

export function useApi(): ApiClient {
  const client = useContext(ApiContext);
  if (!client) throw new Error('useApi must be used inside <ApiProvider>');
  return client;
}

export function useMe(enabled = true) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.me, queryFn: () => api.me.get(), enabled });
}

export function useOtpStart() {
  const api = useApi();
  return useMutation({ mutationFn: api.auth.start });
}

export function useOtpVerify() {
  const api = useApi();
  return useMutation({ mutationFn: api.auth.verify });
}
