export interface Promotion {
  id: string;
  cafeId: string;
  title: string;
  description: string | null;
  discountPercentage: number;
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
  discountPercentage: number;
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
  discountPercentage?: number;
  applicableTierId?: string | null;
  validFrom?: string;
  validUntil?: string;
  daysOfWeek?: number[];
  startHour?: number;
  endHour?: number;
  maxUses?: number | null;
  isActive?: boolean;
}
