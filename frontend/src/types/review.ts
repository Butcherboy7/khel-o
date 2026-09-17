export interface Review {
  id: string;
  cafeId: string;
  gamerId: string;
  bookingId: string;
  gamerName: string;
  rating: number;
  comment: string | null;
  isVisible: boolean;
  ownerReply: string | null;
  ownerRepliedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewCreateRequest {
  // Exactly one of these is required by the backend — bookingId for a
  // normal booking-linked review, cafeId when reviews_require_booking is
  // temporarily off and the reviewer never booked through KHELO.
  bookingId?: string;
  cafeId?: string;
  rating: number;
  comment?: string;
}
