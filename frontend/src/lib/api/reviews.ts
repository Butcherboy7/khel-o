import { apiClient, call } from './client';
import { getPublicEnv } from '@/lib/runtimeEnv';
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

/** The reviewer edits their own review (shows an "Edited" tag after). */
export async function editReview(reviewId: string, body: { rating?: number; comment?: string }): Promise<{ review: Review }> {
  return call(() => apiClient.patch(`/api/v1/reviews/${reviewId}`, body));
}

/** Public page a customer lands on to rate the café (the QR's target). */
export function reviewLink(origin: string, cafeSlugOrId: string): string {
  return `${origin}/cafe/${cafeSlugOrId}?utm_source=qr&utm_medium=review&utm_campaign=review-${cafeSlugOrId}#write-review`;
}

/** PNG QR code that opens the café's review form. */
export function reviewQrUrl(cafeId: string): string {
  return `${getPublicEnv('NEXT_PUBLIC_API_URL', 'http://localhost:8000')}/api/v1/reviews/cafe/${cafeId}/qr.png`;
}

export async function replyToReview(reviewId: string, reply: string): Promise<{ review: Review }> {
  return call(() => apiClient.patch(`/api/v1/reviews/${reviewId}/reply`, { reply }));
}
