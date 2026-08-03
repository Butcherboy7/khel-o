import { create } from 'zustand';
import type { User } from '@/types';
import { apiClient } from '@/lib/api/client';

interface BookingDraft {
  cafeId: string;
  hardwareTierId?: string;
  sessionDate?: string;
  startTime?: string;
  durationHours?: number;
  seatsCount?: number;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isHydrated: boolean;
  bookingDraft: BookingDraft | null;

  setAuth: (user: User, accessToken: string, refreshToken: string) => void;
  setUser: (user: User) => void;
  setBookingDraft: (draft: BookingDraft | null) => void;
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
  bookingDraft: null,

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

  setBookingDraft: (draft) => {
    if (typeof window !== 'undefined') {
      if (draft) {
        localStorage.setItem('khel_booking_draft', JSON.stringify(draft));
      } else {
        localStorage.removeItem('khel_booking_draft');
      }
    }
    set({ bookingDraft: draft });
  },

  logout: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
      localStorage.removeItem('khel_booking_draft');
      window.location.href = '/login';
    }
    set({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
      isHydrated: true,
      bookingDraft: null,
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

    const draftStr = localStorage.getItem('khel_booking_draft');
    let cachedDraft = null;
    if (draftStr) {
      try {
        cachedDraft = JSON.parse(draftStr);
      } catch {
        cachedDraft = null;
      }
    }

    if (!accessToken) {
      set({ isLoading: false, isAuthenticated: false, user: null, bookingDraft: cachedDraft, isHydrated: true });
      return;
    }

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
      set({ user: cachedUser, accessToken, refreshToken, isAuthenticated: true, isLoading: false, bookingDraft: cachedDraft, isHydrated: true });
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
