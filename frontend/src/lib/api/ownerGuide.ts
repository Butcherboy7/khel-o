import { apiClient, call } from './client';
import type { GuidePage } from '@/lib/ownerGuideCopy';

export interface GuideState {
  sessions: number;
  pages: Partial<Record<GuidePage, { views: number; dismissed: boolean }>>;
}

export type GuideEvent =
  | { type: 'session_start' }
  | { type: 'page_view' | 'dismiss'; page: GuidePage };

export async function getGuideState(): Promise<GuideState> {
  return call(() => apiClient.get('/api/v1/owner/guide'));
}

export async function postGuideEvent(event: GuideEvent): Promise<GuideState> {
  return call(() => apiClient.post('/api/v1/owner/guide/events', event));
}
