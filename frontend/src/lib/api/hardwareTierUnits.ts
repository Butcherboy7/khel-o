import { apiClient, call } from './client';

export interface HardwareTierUnit {
  id: string;
  label: string;
  status: 'available' | 'maintenance';
}

export async function listTierUnits(cafeId: string, tierId: string): Promise<{ units: HardwareTierUnit[] }> {
  return call(() => apiClient.get(`/api/v1/cafes/${cafeId}/tiers/${tierId}/units`));
}

export async function updateTierUnitStatus(
  cafeId: string,
  tierId: string,
  unitId: string,
  status: 'available' | 'maintenance',
): Promise<{ unit: HardwareTierUnit }> {
  return call(() => apiClient.patch(`/api/v1/cafes/${cafeId}/tiers/${tierId}/units/${unitId}`, { status }));
}
