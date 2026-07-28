import { create } from 'zustand';
import api from '@/lib/api';

export interface UserResponse {
  id: string;
  email: string;
  fullName: string;
  phoneNumber?: string | null;
  role: 'gamer' | 'cafe_owner' | 'admin';
  avatarUrl?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string | null;
}

interface AuthState {
  user: UserResponse | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setAuth: (user: UserResponse, accessToken: string, refreshToken: string) => void;
  setUser: (user: UserResponse | null) => void;
  setLoading: (loading: boolean) => void;
  logout: () => void;
  initializeFromStorage: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
  isLoading: true,

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
    });
  },

  initializeFromStorage: async () => {
    if (typeof window === 'undefined') return;

    const accessToken = localStorage.getItem('accessToken');
    const refreshToken = localStorage.getItem('refreshToken');

    if (!accessToken) {
      set({ isLoading: false, isAuthenticated: false, user: null });
      return;
    }

    try {
      set({ isLoading: true });
      const res = await api.get('/api/v1/auth/me');
      const user = res.data?.data?.user;
      if (user) {
        set({
          user,
          accessToken,
          refreshToken,
          isAuthenticated: true,
          isLoading: false,
        });
      } else {
        throw new Error('User not returned');
      }
    } catch {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
      set({
        user: null,
        accessToken: null,
        refreshToken: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  },
}));
