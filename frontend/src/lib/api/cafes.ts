import { apiClient, call } from './client';
import type {
  CafeListItem,
  CafeDetail,
  PaginatedResponse,
  CafeCreateRequest,
  CafeUpdateRequest,
  CafeListParams,
} from '@/types';

export async function listCafes(params: CafeListParams): Promise<PaginatedResponse<CafeListItem>> {
  return call(() => apiClient.get('/api/v1/cafes', { params }));
}

export async function getCafe(cafeId: string): Promise<{ cafe: CafeDetail }> {
  return call(() => apiClient.get(`/api/v1/cafes/${cafeId}`));
}

export async function createCafe(body: CafeCreateRequest): Promise<{ cafe: CafeDetail }> {
  return call(() => apiClient.post('/api/v1/cafes', body));
}

export async function updateCafe(cafeId: string, body: CafeUpdateRequest): Promise<{ cafe: CafeDetail }> {
  return call(() => apiClient.patch(`/api/v1/cafes/${cafeId}`, body));
}

export interface CafeAvailabilityResponse {
  appBookableSeats: number;
  remainingSeats?: number;
  bookedSlots: Array<{ startTime: string; endTime: string }>;
}

export async function getCafeAvailability(cafeId: string, tierId: string, date: string): Promise<CafeAvailabilityResponse> {
  return call(() => apiClient.get(`/api/v1/cafes/${cafeId}/availability`, {
    params: { tier_id: tierId, date }
  }));
}
