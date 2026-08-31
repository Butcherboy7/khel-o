'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AnimatePresence } from 'framer-motion';
import { useState, useEffect, type ReactNode } from 'react';
import { useAuthStore } from '@/store/authStore';
import { RoleSyncProvider } from '@/components/providers/RoleSyncProvider';
import { PwaUpdatePrompt } from '@/components/PwaUpdatePrompt';

/* ── QueryClient Factory ─────────────────────────────────────────── */

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000,          // 30 seconds
        gcTime: 30 * 60 * 1000,        // 30 minutes garbage collection
        retry: 1,
        refetchOnWindowFocus: false,   // Prevent surprise refetches during booking flow
        refetchOnReconnect: true,
      },
      mutations: {
        retry: 0,                      // Mutations never auto-retry
      },
    },
  });
}

/* ── Singleton for browser, fresh per request on server ───────── */

let browserQueryClient: QueryClient | undefined;

function getQueryClient(): QueryClient {
  if (typeof window === 'undefined') {
    // Server: always make a new client
    return makeQueryClient();
  }
  // Browser: reuse singleton
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient();
  }
  return browserQueryClient;
}

/* ── Auth Initializer ────────────────────────────────────────────── */

function AuthInitializer({ children }: { children: ReactNode }) {
  const initializeFromStorage = useAuthStore(
    (state) => state.initializeFromStorage,
  );

  useEffect(() => {
    initializeFromStorage();
  }, [initializeFromStorage]);

  return <>{children}</>;
}

/* ── Providers ───────────────────────────────────────────────────── */

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(getQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthInitializer>
        <RoleSyncProvider>
          <AnimatePresence mode="wait">{children}</AnimatePresence>
          <PwaUpdatePrompt />
        </RoleSyncProvider>
      </AuthInitializer>
    </QueryClientProvider>
  );
}
