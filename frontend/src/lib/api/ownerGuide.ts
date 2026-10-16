import { apiClient, call } from './client';
import type { GuidePage } from '@/lib/ownerGuideCopy';

export interface GuideState {
  sessions: number;
  pages: Partial<Record<GuidePage, { views: number; dismissed: boolean }>>;
  /** The app tour: null until the owner finishes ("done") or skips it. */
  tour?: 'done' | 'skipped' | null;
}

export type GuideEvent =
  | { type: 'session_start' }
  | { type: 'page_view' | 'dismiss'; page: GuidePage }
  | { type: 'tour_done' | 'tour_skipped' };

export async function getGuideState(): Promise<GuideState> {
  return call(() => apiClient.get('/api/v1/owner/guide'));
}

export async function postGuideEvent(event: GuideEvent): Promise<GuideState> {
  return call(() => apiClient.post('/api/v1/owner/guide/events', event));
}
