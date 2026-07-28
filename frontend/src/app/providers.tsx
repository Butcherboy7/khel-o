'use client';

import React, { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';

const queryClient = new QueryClient();

export default function Providers({ children }: { children: React.ReactNode }) {
  const initializeFromStorage = useAuthStore((state) => state.initializeFromStorage);

  useEffect(() => {
    initializeFromStorage();
  }, [initializeFromStorage]);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
