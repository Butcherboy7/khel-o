import { apiClient, call } from './client';
import type { Platform } from '@/constants/platforms';

export interface TierNeedingConfirmation {
  id: string;
  name: string;
  specs: Record<string, string>;
  guessedPlatform: Platform;
  guessedModel: string;
}

export async function getTiersNeedingConfirmation(): Promise<{ needsConfirmation: boolean; tiers: TierNeedingConfirmation[] }> {
  return call(() => apiClient.get('/api/v1/owner/tiers/needs-confirmation'));
}

export async function confirmTierPlatform(tierId: string, platform: Platform, model: string): Promise<void> {
  await call(() => apiClient.patch(`/api/v1/owner/tiers/${tierId}/confirm-platform`, { platform, model }));
}
