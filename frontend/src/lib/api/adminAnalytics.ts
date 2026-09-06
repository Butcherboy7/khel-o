import { apiClient, call } from './client';

export interface ExecutiveDashboard {
  totalUsers: number;
  totalCafes: number;
  activeCafes: number;
  newUsersThisPeriod: number;
  newCafesThisPeriod: number;
  bookingsThisPeriod: number;
  gmv: number;
  khelRevenue: number;
  avgBookingValue: number;
  cancellationRate: number;
  repeatBookingRate: number;
  periodDays: number;
}

export async function getExecutiveDashboard(periodDays = 30): Promise<ExecutiveDashboard> {
  return call(() => apiClient.get('/api/v1/admin/analytics/executive', { params: { periodDays } }));
}

export interface CafePerformanceItem {
  cafeId: string;
  cafeName: string;
  city: string;
  bookings: number;
  gmv: number;
  cancellations: number;
  repeatCustomers: number;
  avgBookingValue: number;
  topGame: string | null;
}

export async function getCafePerformance(): Promise<CafePerformanceItem[]> {
  return call(() => apiClient.get('/api/v1/admin/analytics/cafes'));
}

export interface SetupPerformanceItem {
  platform: string;
  bookings: number;
  gmv: number;
  totalSeats: number;
  utilizationHours: number;
}

export async function getSetupPerformance(): Promise<SetupPerformanceItem[]> {
  return call(() => apiClient.get('/api/v1/admin/analytics/setups'));
}
