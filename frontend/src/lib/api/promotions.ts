import { apiClient, call } from './client';

export type PromotionType = 'percentage' | 'fixed_amount' | 'fixed_price';

export interface Promotion {
  id: string;
  cafeId: string;
  title: string;
  description: string | null;
  promotionType: PromotionType;
  discountPercentage: number | null;
  fixedDiscountAmount: number | null;
  fixedPriceAmount: number | null;
  minDurationHours: number | null;
  applicableTierId: string | null;
  validFrom: string;
  validUntil: string;
  daysOfWeek: number[];
  startHour: number;
  endHour: number;
  maxUses: number | null;
  currentUses: number;
  isActive: boolean;
  kheloCode: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PromotionCreateInput {
  cafeId: string;
  title: string;
  description?: string;
  promotionType: PromotionType;
  discountPercentage?: number | null;
  fixedDiscountAmount?: number | null;
  fixedPriceAmount?: number | null;
  minDurationHours?: number | null;
  applicableTierId?: string | null;
  validFrom: string;
  validUntil: string;
  daysOfWeek: number[];
  startHour: number;
  endHour: number;
  maxUses?: number | null;
  kheloCode?: string | null;
}

export interface PromotionUpdateInput {
  title?: string;
  description?: string;
  promotionType?: PromotionType;
  discountPercentage?: number | null;
  fixedDiscountAmount?: number | null;
  fixedPriceAmount?: number | null;
  minDurationHours?: number | null;
  applicableTierId?: string | null;
  validFrom?: string;
  validUntil?: string;
  daysOfWeek?: number[];
  startHour?: number;
  endHour?: number;
  maxUses?: number | null;
  isActive?: boolean;
  kheloCode?: string | null;
}

export interface CodeRedemption {
  promotionId: string;
  cafeId: string;
  title: string;
  description: string | null;
  promotionType: PromotionType;
  discountPercentage: number | null;
  fixedDiscountAmount: number | null;
  fixedPriceAmount: number | null;
  minDurationHours: number | null;
  regularPrice: number | null;
  savingsAmount: number | null;
  applicableTierId: string | null;
  validFrom: string;
  validUntil: string;
  daysOfWeek: number[];
  startHour: number;
  endHour: number;
  maxUses: number | null;
  currentUses: number;
  valid: boolean;
  reason: string | null;
}

export async function previewKheloCode(code: string, cafeId?: string): Promise<{ redemption: CodeRedemption }> {
  return call(() =>
    apiClient.get(`/api/v1/promotions/redeem/${encodeURIComponent(code)}`, {
      params: cafeId ? { cafeId } : undefined,
    })
  );
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

/** Only succeeds for a promotion that has never been redeemed
 *  (currentUses === 0) — the backend rejects it otherwise with
 *  PROMOTION_HAS_HISTORY, telling the owner to pause instead. */
export async function deleteOwnerPromotionPermanently(promotionId: string): Promise<{ message: string }> {
  return call(() => apiClient.delete(`/api/v1/promotions/${promotionId}`, { params: { permanent: true } }));
}
