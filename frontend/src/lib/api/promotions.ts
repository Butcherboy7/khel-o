import { apiClient, call } from './client';

export type PromotionType = 'percentage' | 'fixed_amount' | 'fixed_price';
/** 'any' | 'solo' (own console) | 'coop' (friends sharing one). */
export type PromotionPlayMode = 'any' | 'solo' | 'coop';

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
  /** PERCENTAGE/FIXED_AMOUNT only: shortest booking (minutes) this offer applies to. */
  minBookingMinutes: number | null;
  applicableTierId: string | null;
  playMode?: PromotionPlayMode;
  validFrom: string;
  validUntil: string;
  daysOfWeek: number[];
  startHour: number;
  endHour: number;
  maxUses: number | null;
  currentUses: number;
  /** Unpaid bookings in their payment window currently holding a spot. */
  heldUses?: number;
  /** Owner view, set by the server: campaign the offer belongs to, the setup, and the
   *  regular vs offer price at its headline length (offerMinutes). */
  campaignName?: string | null;
  tierName?: string | null;
  regularPrice?: number | null;
  offerPrice?: number | null;
  offerMinutes?: number | null;
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
  minBookingMinutes?: number | null;
  applicableTierId?: string | null;
  playMode?: PromotionPlayMode;
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
  minBookingMinutes?: number | null;
  applicableTierId?: string | null;
  playMode?: PromotionPlayMode;
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
  minBookingMinutes: number | null;
  regularPrice: number | null;
  savingsAmount: number | null;
  applicableTierId: string | null;
  playMode?: 'any' | 'solo' | 'coop';
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

export interface CampaignInfo {
  name: string;
  code: string;
  /** null when the campaign spans several cafés. */
  cafeId: string | null;
  /** Public campaigns: offers are ordinary offers at every café; the code is only a short link. */
  isPublic?: boolean;
  /** Real cap on paid bookings shared by every offer in the campaign; null = uncapped. */
  maxUses: number | null;
  /** Paid bookings so far. Never an invented number. */
  claimed: number;
  remaining: number | null;
  full: boolean;
  endsAt: string;
}

/** A link-only "Founders' price": what the link unlocks, and how many spots are really taken. */
export async function getCampaign(
  code: string,
  cafeId?: string,
): Promise<{ campaign: CampaignInfo; offers: import('@/types').Promotion[] }> {
  return call(() =>
    apiClient.get(`/api/v1/promotions/campaign/${encodeURIComponent(code)}`, {
      params: cafeId ? { cafeId } : undefined,
    }),
  );
}

/** One landing-page line: the real regular price and the price after the offer. */
export interface CampaignOfferRow {
  id: string;
  title: string;
  activity: string;
  playMode: PromotionPlayMode;
  /** 1 or 2 for solo/co-op offers, null when the offer is for any group size. */
  players: number | null;
  minutes: number;
  /** true: the price is for exactly this length; false: a rate that scales ("per hour"). */
  exactLength: boolean;
  label: string;
  when: string | null;
  regularPrice: number;
  price: number;
  saved: number;
}

export interface CampaignCafe {
  id: string;
  name: string;
  slug: string | null;
  city: string;
  photo: string | null;
  offers: CampaignOfferRow[];
}

export interface CampaignPage {
  campaign: CampaignInfo;
  cafes: CampaignCafe[];
}

export async function getCampaignPage(code: string): Promise<CampaignPage> {
  return call(() => apiClient.get(`/api/v1/promotions/campaign/${encodeURIComponent(code)}`));
}

export interface CampaignClaim {
  badge: { key: string; name: string; grantedAt: string };
  newlyEarned: boolean;
  /** How often this person shared a campaign link and how many different people opened those links. */
  shares: { shared: number; opened: number };
}

/** Signed-in only. Idempotent: asking again returns the badge already held. */
export async function claimCampaignBadge(code: string): Promise<CampaignClaim> {
  return call(() => apiClient.post(`/api/v1/promotions/campaign/${encodeURIComponent(code)}/claim`));
}
