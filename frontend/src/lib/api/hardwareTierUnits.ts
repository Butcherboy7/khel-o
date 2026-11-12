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

/** "PC 7 is broken": only the owner's own name is kept; customers just see one fewer machine. */
export async function markMachineBroken(cafeId: string, tierId: string, label: string): Promise<{ unit: HardwareTierUnit }> {
  return call(() => apiClient.post(`/api/v1/cafes/${cafeId}/tiers/${tierId}/broken`, { label }));
}

export async function markMachineFixed(cafeId: string, tierId: string, unitId: string): Promise<{ fixed: string }> {
  return call(() => apiClient.delete(`/api/v1/cafes/${cafeId}/tiers/${tierId}/broken/${unitId}`));
}
