'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState, type ReactNode } from 'react';

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Data is fresh for 5 seconds before background refetch
            staleTime: 5 * 1000,
            // Unused data stays in cache for 10 minutes
            gcTime: 10 * 60 * 1000,
            // Retry failed queries once with exponential backoff (prevent retry storms)
            retry: 1,
            retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
            // Instantly refetch when user returns to the window/tab
            refetchOnWindowFocus: true,

          },
          mutations: {
            // Never auto-retry mutations (don't double-charge a card)
            retry: 0,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV === 'development' && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </QueryClientProvider>
  );
}
