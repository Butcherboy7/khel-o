// ── Shared Primitive Types ───────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface TierSpecs {
  gpu?: string;
  cpu?: string;
  ram?: string;
  storage?: string;
  monitor?: string;
  peripherals?: string;
  [key: string]: string | undefined;
}

// ── Enum Types ───────────────────────────────────────────────────────────────

export type UserRole = 'gamer' | 'cafe_owner' | 'staff' | 'admin';

export type VerificationStatus = 'pending' | 'verified' | 'rejected' | 'suspended';

export type BookingStatus =
  | 'pending_payment'
  | 'confirmed'
  | 'cancelled'
  | 'completed'
  | 'no_show'
  | 'checked_in'
  | 'failed';

export type PaymentStatus = 'created' | 'captured' | 'failed' | 'refunded';

export type KycStatus = 'pending' | 'submitted' | 'activated' | 'suspended' | 'rejected';

export type PresetCategory = 'esports_starter' | 'pro_gaming' | 'ultra_streamer';
