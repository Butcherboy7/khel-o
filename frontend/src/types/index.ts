export interface User {
  id: string;
  email: string;
  fullName: string;
  phoneNumber?: string;
  role: 'gamer' | 'cafe_owner' | 'admin';
  isActive: boolean;
  avatarUrl?: string;
}

export interface HardwareTier {
  id: string;
  cafeId: string;
  name: string;
  description?: string;
  specs: Record<string, any>;
  seatsInTier: number;
  pricePerHour: number;
  isActive: boolean;
}

export interface Cafe {
  id: string;
  ownerId: string;
  name: string;
  description?: string;
  addressLine1: string;
  city: string;
  state: string;
  phone_number: string;
  verificationStatus: 'pending' | 'verified' | 'rejected' | 'suspended';
  amenities: string[];
  photos: string[];
  hardwareTiers?: HardwareTier[];
}

export interface Booking {
  id: string;
  bookingReference: string;
  gamerId: string;
  cafeId: string;
  hardwareTierId: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  durationHours: number;
  baseAmount: number;
  discountAmount: number;
  gatewayFee: number;
  totalAmount: number;
  status: 'pending_payment' | 'confirmed' | 'cancelled' | 'completed' | 'no_show';
  qrCodeUrl?: string;
}
