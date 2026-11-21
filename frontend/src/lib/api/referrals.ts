import { apiClient, call } from '@/lib/api/client';

/** What the programme gives right now. Never includes the community code (that lives in WhatsApp). */
export interface ReferralOffer {
  on: boolean;
  welcome: number;
  community: number;
  reward: number;
  maxPerBooking: number;
  minSession: number;
  creditDays: number;
  referrerCap: number;
}

export interface MyReferrals {
  code: string;
  opened: number;
  joined: number;
  played: number;
  rewarded: number;
  credits: { amount: number; expiresAt: string }[];
  available: number;
  invitedBy: boolean;
  offer: ReferralOffer;
}

export type ClaimStatus = 'joined' | 'already' | 'own' | 'not_found' | 'not_new' | 'off';

export const getReferralOffer = (): Promise<ReferralOffer> => call(() => apiClient.get('/api/v1/referrals/offer'));
export const getMyReferrals = (): Promise<MyReferrals> => call(() => apiClient.get('/api/v1/referrals/me'));
export const claimReferral = (code: string): Promise<{ status: ClaimStatus }> =>
  call(() => apiClient.post('/api/v1/referrals/claim', { code }));

// ---- admin ----

export interface ReferralSettings {
  referralsOn: boolean;
  welcomeCredit: number;
  communityCredit: number;
  referralReward: number;
  communityCode: string | null;
  maxPerBooking: number;
  minSession: number;
  creditDays: number;
  referrerCap: number;
}

export interface AdminReferrals {
  settings: ReferralSettings;
  referrals: { joined: number; rewarded: number; capped: number; void: number };
  credits: Record<string, { count: number; amount: number }>;
  spent: { bookings: number; amount: number; withCommunityCode: number; withFriendReward: number };
  recent: {
    id: string;
    status: 'joined' | 'rewarded' | 'capped' | 'void';
    createdAt: string;
    rewardedAt: string | null;
    referrer: string;
    referrerEmail: string;
    friend: string;
    friendEmail: string;
    voidReason: string | null;
  }[];
  top: { name: string; email: string; friends: number }[];
}

export const getAdminReferrals = (): Promise<AdminReferrals> => call(() => apiClient.get('/api/v1/admin/referrals'));
export const saveReferralSettings = (
  body: Partial<Pick<ReferralSettings, 'referralsOn' | 'welcomeCredit' | 'communityCredit' | 'referralReward'>> & { communityCode?: string },
): Promise<ReferralSettings> => call(() => apiClient.put('/api/v1/admin/referrals/settings', body));
export const voidReferral = (id: string, reason: string) =>
  call(() => apiClient.post(`/api/v1/admin/referrals/${id}/void`, { reason }));
