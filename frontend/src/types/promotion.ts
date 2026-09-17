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
  /** Derived by the backend from the tier's hourly rate — never stored,
   *  only present on FIXED_PRICE offers. */
  regularPrice: number | null;
  savingsAmount: number | null;
  applicableTierId: string | null;
  applicableTierName: string | null;
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

export type PromotionDetail = Promotion;

export interface PromotionCreateRequest {
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
}

export interface PromotionUpdateRequest {
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
}
