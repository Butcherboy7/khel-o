import type { UserRole } from './shared';

export interface User {
  id: string;
  email: string;
  fullName: string;
  phoneNumber: string | null;
  role: UserRole;
  roles: UserRole[];
  cafeId?: string;
  isActive: boolean;
  avatarUrl: string | null;
  // false for accounts that only ever signed in via Google — they have no
  // KHEL-O password to change.
  hasPassword?: boolean;
  pendingInvitations?: Array<{
    id: string;
    venueName: string;
    token: string;
    role: string;
    createdAt: string;
  }>;
  createdAt: string;
  updatedAt: string | null;
}

export interface RegisterRequest {
  email: string;
  password: string;
  fullName: string;
  phoneNumber?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}
