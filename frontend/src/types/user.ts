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
