import { create } from 'zustand';
import api from '@/lib/api';
import { User } from '@/types';

export type UserResponse = User;

interface AuthState {
  user: UserResponse | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isHydrated: boolean;
  setAuth: (user: UserResponse, accessToken: string, refreshToken: string) => void;
  setUser: (user: UserResponse | null) => void;
  setLoading: (loading: boolean) => void;
  logout: () => void;
  initializeFromStorage: () => Promise<void>;
}

const getInitialState = () => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
  isLoading: true,
  isHydrated: false,
});

export const useAuthStore = create<AuthState>((set, get) => ({
  ...getInitialState(),

  setAuth: (user, accessToken, refreshToken) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      localStorage.setItem('user', JSON.stringify(user));
    }
    set({
      user,
      accessToken,
      refreshToken,
      isAuthenticated: true,
      isLoading: false,
      isHydrated: true,
    });
  },

  setUser: (user) => set({ user }),

  setLoading: (isLoading) => set({ isLoading }),

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

    const userStr = localStorage.getItem('user');
    let cachedUser: UserResponse | null = null;
    if (userStr) {
      try {
        cachedUser = JSON.parse(userStr);
      } catch {
        cachedUser = null;
      }
    }

    if (cachedUser) {
      set({
        user: cachedUser,
        accessToken,
        refreshToken,
        isAuthenticated: true,
        isLoading: false,
        isHydrated: true,
      });
    }

    try {
      if (!cachedUser) {
        set({ isLoading: true });
      }
      const res = await api.get('/api/v1/auth/me');
      const user = res.data?.data?.user;
      if (user) {
        localStorage.setItem('user', JSON.stringify(user));
        set({
          user,
          accessToken,
          refreshToken,
          isAuthenticated: true,
          isLoading: false,
          isHydrated: true,
        });
      } else if (!cachedUser) {
        throw new Error('User not returned');
      }
    } catch {
      if (!cachedUser) {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
          isLoading: false,
          isHydrated: true,
        });
      }
    }
  },
}));
