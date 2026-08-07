import { apiClient, call } from './client';
import type { Review, ReviewCreateRequest, PaginatedResponse } from '@/types';

export async function createReview(body: ReviewCreateRequest): Promise<{ review: Review }> {
  return call(() => apiClient.post('/api/v1/reviews', body));
}

export async function listCafeReviews(
  cafeId: string,
  params: { page?: number; limit?: number } = {},
): Promise<PaginatedResponse<Review>> {
  return call(() => apiClient.get(`/api/v1/reviews/cafe/${cafeId}`, { params }));
}
