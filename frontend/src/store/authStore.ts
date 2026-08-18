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

export type UserActiveRole = 'gamer' | 'cafe_owner' | 'staff' | 'admin';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  activeRole: UserActiveRole;
  isAuthenticated: boolean;
  isLoading: boolean;
  isHydrated: boolean;
  bookingDraft: BookingDraft | null;

  setAuth: (user: User, accessToken: string, refreshToken: string) => void;
  setUser: (user: User) => void;
  setActiveRole: (role: UserActiveRole) => void;
  switchActiveRole: (targetRole: UserActiveRole) => Promise<void>;
  setBookingDraft: (draft: BookingDraft | null) => void;
  logout: () => void;
  initializeFromStorage: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  activeRole: 'gamer',
  isAuthenticated: false,
  isLoading: true,
  isHydrated: false,
  bookingDraft: null,

  setAuth: (user, accessToken, refreshToken) => {
    const roleVal = (user.role as string) || 'gamer';
    const rolesVal = user.roles || [roleVal];
    if (typeof window !== 'undefined') {
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('activeRole', roleVal);
      localStorage.setItem('roles', JSON.stringify(rolesVal));
    }
    set({ user, accessToken, refreshToken, activeRole: roleVal as UserActiveRole, isAuthenticated: true, isLoading: false, isHydrated: true });
  },

  setUser: (user) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('user', JSON.stringify(user));
    }
    set({ user });
  },

  setActiveRole: (role) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('activeRole', role);
    }
    set({ activeRole: role });
  },

  switchActiveRole: async (targetRole) => {
    try {
      const res = await apiClient.post<{ success: boolean; data: { accessToken: string; refreshToken: string; activeRole: string; user: User } }>('/api/v1/auth/switch-role', { targetRole });
      const { accessToken, refreshToken, activeRole, user } = res.data.data;
      const rolesVal = user.roles || [user.role];
      if (typeof window !== 'undefined') {
        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('refreshToken', refreshToken);
        localStorage.setItem('activeRole', activeRole);
        localStorage.setItem('user', JSON.stringify(user));
        localStorage.setItem('roles', JSON.stringify(rolesVal));
      }
      set({ accessToken, refreshToken, activeRole: activeRole as UserActiveRole, user });
    } catch (err: any) {
      throw new Error(err?.response?.data?.detail?.message || err?.message || 'Failed to switch role');
    }
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
      localStorage.removeItem('activeRole');
      localStorage.removeItem('roles');
      localStorage.removeItem('khel_booking_draft');
      window.location.href = '/login';
    }
    set({
      user: null,
      accessToken: null,
      refreshToken: null,
      activeRole: 'gamer',
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
    const savedActiveRole = (localStorage.getItem('activeRole') as UserActiveRole) || 'gamer';

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
      set({ isLoading: false, isAuthenticated: false, user: null, activeRole: 'gamer', bookingDraft: cachedDraft, isHydrated: true });
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
      set({ user: cachedUser, accessToken, refreshToken, activeRole: savedActiveRole, isAuthenticated: true, isLoading: false, bookingDraft: cachedDraft, isHydrated: true });
    }

    try {
      const res = await apiClient.get<{ success: boolean; data: { user: User } }>('/api/v1/auth/me');
      const user = res.data?.data?.user;
      if (user) {
        const rolesVal = user.roles || [user.role];
        localStorage.setItem('user', JSON.stringify(user));
        localStorage.setItem('roles', JSON.stringify(rolesVal));
        set({ user, accessToken, refreshToken, activeRole: savedActiveRole, isAuthenticated: true, isLoading: false, isHydrated: true });
      } else if (!cachedUser) {
        throw new Error('No user in /me response');
      }
    } catch {
      if (!cachedUser) {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        localStorage.removeItem('activeRole');
        localStorage.removeItem('roles');
        set({ user: null, accessToken: null, refreshToken: null, activeRole: 'gamer', isAuthenticated: false, isLoading: false, isHydrated: true });
      }
    }
  },
}));

// Cross-tab authentication session synchronizer
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === 'user' || e.key === 'accessToken' || e.key === 'activeRole') {
      const storedUser = localStorage.getItem('user');
      const storedToken = localStorage.getItem('accessToken');
      const storedRefreshToken = localStorage.getItem('refreshToken');
      const storedRole = (localStorage.getItem('activeRole') as UserActiveRole) || 'gamer';

      if (storedUser && storedToken) {
        try {
          const parsedUser = JSON.parse(storedUser);
          useAuthStore.setState({
            user: parsedUser,
            accessToken: storedToken,
            refreshToken: storedRefreshToken,
            activeRole: storedRole,
            isAuthenticated: true,
          });
        } catch {
          // Ignore JSON parse errors
        }
      } else if (!storedToken) {
        useAuthStore.setState({
          user: null,
          accessToken: null,
          refreshToken: null,
          activeRole: 'gamer',
          isAuthenticated: false,
        });
      }
    }
  });
}

