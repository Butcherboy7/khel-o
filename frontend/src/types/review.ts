export interface Review {
  id: string;
  cafeId: string;
  gamerId: string;
  bookingId: string;
  gamerName: string;
  // Only populated by admin moderation listings (GET /admin/reviews) where
  // reviews span every café; café-scoped endpoints leave it undefined since
  // the café is already implied there.
  cafeName?: string | null;
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
