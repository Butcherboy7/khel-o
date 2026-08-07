import { apiClient, call } from './client';
import type { Promotion, PromotionCreateRequest, PromotionUpdateRequest } from '@/types';

export async function listCafePromotions(cafeId: string): Promise<{ promotions: Promotion[] }> {
  return call(() => apiClient.get(`/api/v1/promotions/cafe/${cafeId}`));
}

export async function getPromotion(promotionId: string): Promise<{ promotion: Promotion }> {
  return call(() => apiClient.get(`/api/v1/promotions/${promotionId}`));
}

export async function createPromotion(body: PromotionCreateRequest): Promise<{ promotion: Promotion }> {
  return call(() => apiClient.post('/api/v1/promotions', body));
}

export async function updatePromotion(promotionId: string, body: PromotionUpdateRequest): Promise<{ promotion: Promotion }> {
  return call(() => apiClient.patch(`/api/v1/promotions/${promotionId}`, body));
}

export async function deletePromotion(promotionId: string): Promise<void> {
  await apiClient.delete(`/api/v1/promotions/${promotionId}`);
}
