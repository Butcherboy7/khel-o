import { apiClient, call } from './client';

export interface Promotion {
  id: string;
  cafeId: string;
  title: string;
  description: string | null;
  discountPercentage: number;
  applicableTierId: string | null;
  validFrom: string;
  validUntil: string;
  daysOfWeek: number[];
  startHour: number;
  endHour: number;
  maxUses: number | null;
  currentUses: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PromotionCreateInput {
  cafeId: string;
  title: string;
  description?: string;
  discountPercentage: number;
  applicableTierId?: string | null;
  validFrom: string;
  validUntil: string;
  daysOfWeek: number[];
  startHour: number;
  endHour: number;
  maxUses?: number | null;
}

export interface PromotionUpdateInput {
  title?: string;
  description?: string;
  discountPercentage?: number;
  validUntil?: string;
  maxUses?: number | null;
  isActive?: boolean;
}

export async function listOwnerPromotions(cafeId: string): Promise<{ promotions: Promotion[] }> {
  return call(() => apiClient.get(`/api/v1/promotions/owner/cafe/${cafeId}`));
}

export async function createPromotion(body: PromotionCreateInput): Promise<{ promotion: Promotion }> {
  return call(() => apiClient.post('/api/v1/promotions', body));
}

export async function updatePromotion(promotionId: string, body: PromotionUpdateInput): Promise<{ promotion: Promotion }> {
  return call(() => apiClient.patch(`/api/v1/promotions/${promotionId}`, body));
}

export async function deactivateOwnerPromotion(promotionId: string): Promise<{ message: string }> {
  return call(() => apiClient.delete(`/api/v1/promotions/${promotionId}`));
}
