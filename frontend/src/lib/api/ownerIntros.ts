import { apiClient, call } from './client';

export type OwnerRelation = 'regular' | 'friend_family' | 'work_there' | 'other';

export interface OwnerIntroInput {
  /** Set when sent from a lead café's page; the general form types a name. */
  cafeId?: string;
  cafeName?: string;
  area?: string;
  ownerName: string;
  ownerPhone: string;
  relation: OwnerRelation;
  note?: string;
  ownerConsent: boolean;
}

/** "Know the owner?" — straight to the outreach team. Sign-in required. */
export async function createOwnerIntro(input: OwnerIntroInput): Promise<{ id: string; duplicate: boolean }> {
  return call(() => apiClient.post('/api/v1/owner-intros', input));
}

export type OwnerIntroStatus = 'new' | 'contacted' | 'onboarded' | 'dead';

export interface AdminOwnerIntro {
  id: string;
  cafeId: string | null;
  cafeName: string;
  area: string | null;
  ownerName: string;
  ownerPhone: string;
  relation: OwnerRelation;
  note: string | null;
  status: OwnerIntroStatus;
  submittedBy: { name: string; email: string };
  createdAt: string | null;
}

export async function listOwnerIntros(): Promise<{ intros: AdminOwnerIntro[] }> {
  return call(() => apiClient.get('/api/v1/admin/leads/owner-intros'));
}

export async function setOwnerIntroStatus(id: string, status: OwnerIntroStatus): Promise<{ id: string; status: OwnerIntroStatus }> {
  return call(() => apiClient.patch(`/api/v1/admin/leads/owner-intros/${id}`, { status }));
}

export interface HelperBadgeSummary {
  totals: { key: string; title: string; xp: number; count: number }[];
  recent: { key: string; title: string; player: { name: string; email: string }; grantedAt: string | null }[];
}

export async function getHelperBadges(): Promise<HelperBadgeSummary> {
  return call(() => apiClient.get('/api/v1/admin/leads/helper-badges'));
}
