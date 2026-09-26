import { apiClient, call } from './client';
import type {
  CafeListItem,
  CafeDetail,
  PaginatedResponse,
  CafeCreateRequest,
  CafeUpdateRequest,
  CafeListParams,
  ActivityFacet,
} from '@/types';

export async function listCafes(params: CafeListParams): Promise<PaginatedResponse<CafeListItem>> {
  return call(() => apiClient.get('/api/v1/cafes', { params }));
}

/** Activities on offer in a city (all cities when omitted), gaming first. */
export async function listActivities(city?: string): Promise<ActivityFacet[]> {
  return call(() => apiClient.get('/api/v1/cafes/activities', { params: { city } }));
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isCafeUuid = (value: string) => UUID_RE.test(value);

/** Public café page path — the readable slug when the café has one. */
export const cafePath = (cafe: { id: string; slug?: string | null }) => `/cafe/${cafe.slug || cafe.id}`;

/** Accepts either a café id or its slug (what /cafe/<param> URLs carry). */
export async function getCafe(idOrSlug: string): Promise<{ cafe: CafeDetail }> {
  const path = isCafeUuid(idOrSlug) ? idOrSlug : `slug/${encodeURIComponent(idOrSlug)}`;
  return call(() => apiClient.get(`/api/v1/cafes/${path}`));
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
