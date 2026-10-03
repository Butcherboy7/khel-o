import { apiClient, call } from './client';

export type CampaignChannel =
  | 'instagram_reel'
  | 'instagram_story'
  | 'instagram_bio'
  | 'whatsapp'
  | 'qr_poster'
  | 'other';
export type CampaignStatus = 'live' | 'ended' | 'archived';

export interface CampaignSummary {
  visitors: number;
  viewedCafe: number;
  bookingStarted: number;
  booked: number;
  bookings: number;
  gmv: number;
  costPerBooking: number | null;
}

export interface MarketingCampaign {
  id: string;
  slug: string;
  name: string;
  channel: CampaignChannel;
  paid: boolean;
  landingPath: string;
  utmSource: string;
  utmMedium: string;
  spendInr: number | null;
  status: CampaignStatus;
  startedOn: string;
  reportFrom: string;
  reportTo: string;
  shortPath: string;
  summary?: CampaignSummary;
}

export interface CampaignCreateInput {
  name: string;
  slug: string;
  channel: CampaignChannel;
  paid: boolean;
  landingPath: string;
  spendInr?: number | null;
  startedOn?: string;
}

export async function listMarketingCampaigns(): Promise<{ campaigns: MarketingCampaign[] }> {
  return call(() => apiClient.get('/api/v1/admin/marketing-campaigns'));
}

export async function createMarketingCampaign(input: CampaignCreateInput): Promise<{ campaign: MarketingCampaign }> {
  return call(() => apiClient.post('/api/v1/admin/marketing-campaigns', input));
}

export async function updateMarketingCampaign(
  id: string,
  patch: { name?: string; spendInr?: number; clearSpend?: boolean; status?: CampaignStatus },
): Promise<{ campaign: MarketingCampaign }> {
  return call(() => apiClient.patch(`/api/v1/admin/marketing-campaigns/${id}`, patch));
}

export const CHANNEL_LABELS: Record<CampaignChannel, string> = {
  instagram_reel: 'Instagram reel',
  instagram_story: 'Instagram story',
  instagram_bio: 'Instagram bio',
  whatsapp: 'WhatsApp',
  qr_poster: 'QR poster',
  other: 'Somewhere else',
};
