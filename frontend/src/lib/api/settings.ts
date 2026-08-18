import { apiClient, call } from './client';

export interface OwnerSettings {
  cafeId: string;
  cafeName: string;
  isEmergencyMode: boolean;
  bookingsPaused: boolean;
  openingTime: string | null;
  closingTime: string | null;
  phoneNumber: string;
  addressLine1: string;
  city: string;
  state: string;
  pincode: string;
  amenities: string[];
  photos: string[];
  latitude: number | null;
  longitude: number | null;
}

export interface SettingsResponse {
  success: boolean;
  cafe: OwnerSettings;
  data?: {
    cafe: OwnerSettings;
  };
}

// GET /api/v1/owner/settings
export async function getOwnerSettings(): Promise<SettingsResponse> {
  const res = await call<SettingsResponse>(() => apiClient.get('/api/v1/owner/settings'));
  const cafeObj = res.cafe || res.data?.cafe;
  return {
    ...res,
    cafe: cafeObj,
  };
}

// PATCH /api/v1/owner/cafe/emergency-mode
export async function toggleEmergencyMode(isEmergencyMode: boolean): Promise<{ isEmergencyMode: boolean }> {
  return call<{ isEmergencyMode: boolean }>(() =>
    apiClient.patch('/api/v1/owner/cafe/emergency-mode', null, {
      params: { isEmergencyMode },
    })
  );
}

// PATCH /api/v1/owner/cafe/bookings-pause
export async function toggleBookingsPaused(bookingsPaused: boolean): Promise<{ bookingsPaused: boolean }> {
  return call<{ bookingsPaused: boolean }>(() =>
    apiClient.patch('/api/v1/owner/cafe/bookings-pause', { bookingsPaused })
  );
}

// POST /api/v1/owner/cafe/pause-bookings (alias - sets paused = true)
export async function pauseBookings(): Promise<{ bookingsPaused: boolean }> {
  return call<{ bookingsPaused: boolean }>(() => apiClient.post('/api/v1/owner/cafe/pause-bookings'));
}

// POST /api/v1/owner/cafe/resume-bookings (alias - sets paused = false)
export async function resumeBookings(): Promise<{ bookingsPaused: boolean }> {
  return call<{ bookingsPaused: boolean }>(() => apiClient.post('/api/v1/owner/cafe/resume-bookings'));
}

export interface CafeDetailsUpdateParams {
  name?: string;
  description?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  pincode?: string;
  phoneNumber?: string;
  email?: string;
  amenities?: string[];
  photos?: string[];
  latitude?: number;
  longitude?: number;
}

// PATCH /api/v1/owner/cafes/{cafeId}/details
export async function updateCafeDetails(
  cafeId: string,
  params: CafeDetailsUpdateParams
): Promise<{ cafe: { id: string; name: string; description: string | null; city: string; amenities: string[]; photos: string[]; latitude: number | null; longitude: number | null } }> {
  return call(() => apiClient.patch(`/api/v1/owner/cafes/${cafeId}/details`, params));
}

// PATCH /api/v1/owner/cafes/{cafeId}/hours
export async function updateOperatingHours(
  cafeId: string,
  openingTime: string,
  closingTime: string
): Promise<{ cafe: { id: string; openingTime: string; closingTime: string } }> {
  return call(() =>
    apiClient.patch(`/api/v1/owner/cafes/${cafeId}/hours`, { openingTime, closingTime })
  );
}

// PATCH /api/v1/owner/cafe/booking-controls
export async function updateBookingControls(params: {
  bookableStations?: number;
  appBookableSeats?: number;
  bookingsPaused?: boolean;
  tierAllocations?: Array<{ tierId: string; appBookableSeats: number }>;
}): Promise<{ bookableStations: number; appBookableSeats: number; bookingsPaused: boolean; totalSeats: number; tiers?: any[] }> {
  return call<{ bookableStations: number; appBookableSeats: number; bookingsPaused: boolean; totalSeats: number; tiers?: any[] }>(() =>
    apiClient.patch('/api/v1/owner/cafe/booking-controls', params)
  );
}
