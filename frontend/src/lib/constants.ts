// ── Cities ──────────────────────────────────────────────────────────────────
export const CITIES = [
  'Bengaluru',
  'Mumbai',
  'Pune',
  'Delhi',
  'Hyderabad',
  'Chennai',
  'Kolkata',
  'Ahmedabad',
  'Jaipur',
] as const;

export type City = (typeof CITIES)[number];

// ── Duration Options ─────────────────────────────────────────────────────────
export const DURATION_OPTIONS = [1, 1.5, 2, 3, 4, 5, 6, 8] as const;

// ── Booking Status Labels ────────────────────────────────────────────────────
export const BOOKING_STATUS_LABELS: Record<string, string> = {
  pending_payment: 'Awaiting Payment',
  confirmed: 'Confirmed',
  checked_in: 'Checked In',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No Show',
};

// ── Booking Status Badge Variants ────────────────────────────────────────────
export const BOOKING_STATUS_VARIANTS: Record<string, 'success' | 'accent' | 'warning' | 'error' | 'neutral'> = {
  pending_payment: 'warning',
  confirmed: 'accent',
  checked_in: 'success',
  completed: 'neutral',
  cancelled: 'error',
  no_show: 'error',
};

// ── Verification Status Labels ───────────────────────────────────────────────
export const VERIFICATION_STATUS_LABELS: Record<string, string> = {
  pending: 'Verification Pending',
  verified: 'Verified',
  rejected: 'Rejected',
  suspended: 'Suspended',
};

// ── Preset Category Labels ───────────────────────────────────────────────────
export const PRESET_CATEGORY_LABELS: Record<string, string> = {
  esports_starter: 'Esports Starter',
  pro_gaming: 'Pro Gaming',
  ultra_streamer: 'Ultra / Streamer',
};

// ── Amenity Options ──────────────────────────────────────────────────────────
export const AMENITY_OPTIONS = [
  'Air Conditioning',
  'High-Speed Wi-Fi',
  'Snacks & Beverages',
  'Noise-Cancelling Headsets',
  '4K Monitors',
  'Ergonomic Chairs',
  'PS5 Consoles',
  'Xbox Series X',
  'VR Headsets',
  'Private Booths',
  'Tournament Area',
  'Coaching Sessions',
  'Locker Storage',
  'Restrooms',
  'Parking',
] as const;

// ── Demo Accounts ────────────────────────────────────────────────────────────
export const DEMO_ACCOUNTS = [
  { label: 'Demo Gamer', email: 'gamer@demo.com', password: 'demo1234' },
  { label: 'Demo Owner', email: 'owner@demo.com', password: 'demo1234' },
  { label: 'Demo Admin', email: 'admin@demo.com', password: 'demo1234' },
] as const;

// ── Route Paths ──────────────────────────────────────────────────────────────
export const ROUTES = {
  login: '/login',
  register: '/register',
  home: '/',
  cafeDetail: (id: string) => `/cafes/${id}`,
  bookingNew: (cafeId: string, tierId: string) =>
    `/bookings/new?cafeId=${cafeId}&tierId=${tierId}`,
  bookingDetail: (id: string) => `/bookings/${id}`,
  bookings: '/bookings',
  rewards: '/rewards',
  profile: '/profile',
  ownerOnboarding: '/owner/onboarding',
  ownerDashboard: '/owner/dashboard',
  ownerCafe: '/owner/cafe',
  ownerTiers: '/owner/tiers',
  ownerBookings: '/owner/bookings',
  ownerPromotions: '/owner/promotions',
  ownerStaff: '/owner/staff',
  ownerPayouts: '/owner/payouts',
  admin: '/admin',
} as const;

// ── API Config ───────────────────────────────────────────────────────────────
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

// ── Pagination Defaults ──────────────────────────────────────────────────────
export const DEFAULT_PAGE_SIZE = 20;
export const OWNER_BOOKINGS_PAGE_SIZE = 50;
