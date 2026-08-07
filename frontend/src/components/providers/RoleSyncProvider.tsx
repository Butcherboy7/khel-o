'use client';

import { useEffect, type ReactNode } from 'react';
import { useAuthStore } from '@/store/authStore';
import { apiClient } from '@/lib/api/client';

export function RoleSyncProvider({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (!isAuthenticated || !accessToken || typeof window === 'undefined') return;

    const syncRoles = async () => {
      try {
        const res = await apiClient.get<{ success: boolean; data: { user: any } }>('/auth/me');
        const freshUser = res.data?.data?.user;
        
        if (freshUser && freshUser.roles) {
          const storedUserStr = localStorage.getItem('user');
          const storedUser = storedUserStr ? JSON.parse(storedUserStr) : null;
          
          if (storedUser) {
            const storedRoles = storedUser.roles || [];
            const freshRoles = freshUser.roles || [];
            
            const rolesChanged = 
              storedRoles.length !== freshRoles.length ||
              storedRoles.some((r: string, i: number) => r !== freshRoles[i]);
            
            if (rolesChanged) {
              localStorage.setItem('user', JSON.stringify(freshUser));
              localStorage.setItem('roles', JSON.stringify(freshUser.roles));
              if (freshUser.role) {
                const activeRole = localStorage.getItem('activeRole') || freshUser.role;
                localStorage.setItem('activeRole', activeRole);
              }
            }
          }
        }
      } catch (err) {
        // Silently ignore sync failures - user stays in current state
      }
    };

    syncRoles();
  }, [isAuthenticated, accessToken]);

  return <>{children}</>;
}
