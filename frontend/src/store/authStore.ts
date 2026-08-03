import { create } from 'zustand';
import type { User } from '@/types';
import { apiClient } from '@/lib/api/client';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isHydrated: boolean;

  setAuth: (user: User, accessToken: string, refreshToken: string) => void;
  setUser: (user: User) => void;
  logout: () => void;
  initializeFromStorage: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
  isLoading: true,
  isHydrated: false,

  setAuth: (user, accessToken, refreshToken) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      localStorage.setItem('user', JSON.stringify(user));
    }
    set({ user, accessToken, refreshToken, isAuthenticated: true, isLoading: false, isHydrated: true });
  },

  setUser: (user) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('user', JSON.stringify(user));
    }
    set({ user });
  },

  logout: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    set({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
      isHydrated: true,
    });
  },

  initializeFromStorage: async () => {
    if (typeof window === 'undefined') return;

    // Already hydrated with a user — skip
    if (get().isHydrated && get().user) {
      set({ isLoading: false });
      return;
    }

    const accessToken = localStorage.getItem('accessToken');
    const refreshToken = localStorage.getItem('refreshToken');

    if (!accessToken) {
      set({ isLoading: false, isAuthenticated: false, user: null, isHydrated: true });
      return;
    }

    // Optimistically set from cache while /me fetch is in flight
    const userStr = localStorage.getItem('user');
    let cachedUser: User | null = null;
    if (userStr) {
      try {
        cachedUser = JSON.parse(userStr) as User;
      } catch {
        cachedUser = null;
      }
    }

    if (cachedUser) {
      set({ user: cachedUser, accessToken, refreshToken, isAuthenticated: true, isLoading: false, isHydrated: true });
    }

    try {
      const res = await apiClient.get<{ success: boolean; data: { user: User } }>('/api/v1/auth/me');
      const user = res.data?.data?.user;
      if (user) {
        localStorage.setItem('user', JSON.stringify(user));
        set({ user, accessToken, refreshToken, isAuthenticated: true, isLoading: false, isHydrated: true });
      } else if (!cachedUser) {
        throw new Error('No user in /me response');
      }
    } catch {
      if (!cachedUser) {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false, isLoading: false, isHydrated: true });
      }
    }
  },
}));
