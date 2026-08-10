import { apiClient, call } from './client';

export interface QRValidationBooking {
  id: string;
  bookingReference: string;
  gamerName: string;
  gamerEmail?: string | null;
  gamerPhone?: string | null;
  tierName: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  durationHours: number;
  seatsCount: number;
  totalAmount: number;
  status: string;
}

export interface QRValidationResponse {
  valid: boolean;
  alreadyCheckedIn: boolean;
  checkedInByName?: string | null;
  checkedInAt?: string | null;
  message?: string;
  booking?: QRValidationBooking;
}

export interface TierOccupancy {
  tierId: string;
  tierName: string;
  totalSeats: number;
  appBookableSeats: number;
  occupiedSeats: number;
  occupancyPercent: number;
  pricePerHour: number;
}

export interface OccupancyResponse {
  tiers: TierOccupancy[];
}

export async function validateQRCode(qrData: string): Promise<QRValidationResponse> {
  return call(() => apiClient.post('/api/v1/owner/bookings/validate-qr', { qrData }));
}

export async function getOwnerOccupancy(): Promise<OccupancyResponse> {
  return call(() => apiClient.get('/api/v1/owner/occupancy'));
}
