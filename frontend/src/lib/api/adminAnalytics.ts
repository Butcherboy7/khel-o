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
