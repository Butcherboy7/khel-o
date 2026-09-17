import { apiClient, call } from './client';
import type { Review, ReviewCreateRequest, PaginatedResponse } from '@/types';

export async function createReview(body: ReviewCreateRequest): Promise<{ review: Review }> {
  return call(() => apiClient.post('/api/v1/reviews', body));
}

/** Temporary admin toggle — see PlatformSetting.reviews_require_booking.
 *  When false, the "Write a review" card lets anyone submit without an
 *  eligible completed booking for the café. */
export async function getReviewSettings(): Promise<{ requireBooking: boolean }> {
  return call(() => apiClient.get('/api/v1/reviews/settings'));
}

export async function listCafeReviews(
  cafeId: string,
  params: { page?: number; limit?: number } = {},
): Promise<PaginatedResponse<Review>> {
  return call(() => apiClient.get(`/api/v1/reviews/cafe/${cafeId}`, { params }));
}

export async function replyToReview(reviewId: string, reply: string): Promise<{ review: Review }> {
  return call(() => apiClient.patch(`/api/v1/reviews/${reviewId}/reply`, { reply }));
}
