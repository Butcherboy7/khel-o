import { apiClient, call } from './client';

export interface CafeDemand {
  cafeName: string;
  city: string;
  slug: string | null;
  isLive: boolean;
  count: number;
  goal: number;
  last7Days: number;
  firstRequestedAt: string | null;
  /** Requests per week, oldest first; the last entry is this week. */
  weekly: number[];
  playTimes: { key: string; label: string; count: number }[];
}

/** Public, counts-only demand for one café: the owner pitch page. */
export async function getCafeDemand(slug: string): Promise<CafeDemand> {
  return call(() => apiClient.get(`/api/v1/waitlist/demand/${encodeURIComponent(slug)}`));
}
