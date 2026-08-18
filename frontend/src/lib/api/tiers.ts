import { apiClient, call } from './client';
import type { HardwareTier, TierCreateRequest, TierUpdateRequest } from '@/types';

export async function listCafeTiers(cafeId: string): Promise<{ hardwareTiers: HardwareTier[] }> {
  const res = await call<any>(() => apiClient.get(`/api/v1/cafes/${cafeId}/tiers`));
  return {
    hardwareTiers: res.tiers || res.hardwareTiers || [],
  };
}

export async function getTier(tierId: string): Promise<{ hardwareTier: HardwareTier }> {
  return call(() => apiClient.get(`/api/v1/hardware-tiers/${tierId}`));
}

export async function createTier(cafeId: string, body: TierCreateRequest): Promise<{ hardwareTier: HardwareTier }> {
  return call(() => apiClient.post(`/api/v1/cafes/${cafeId}/tiers`, body));
}

export async function updateTier(cafeId: string, tierId: string, body: TierUpdateRequest): Promise<{ hardwareTier: HardwareTier }> {
  return call(() => apiClient.patch(`/api/v1/cafes/${cafeId}/tiers/${tierId}`, body));
}

export async function deleteTier(cafeId: string, tierId: string): Promise<{ message: string; tierId: string }> {
  return call(() => apiClient.delete(`/api/v1/owner/cafes/${cafeId}/tiers/${tierId}`));
}
