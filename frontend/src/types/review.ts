export interface Review {
  id: string;
  cafeId: string;
  gamerId: string;
  bookingId: string;
  gamerName: string;
  rating: number;
  comment: string | null;
  isVisible: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewCreateRequest {
  bookingId: string;
  rating: number;
  comment?: string;
}
