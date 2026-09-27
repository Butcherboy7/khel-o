import { apiClient, call } from './client';

export interface ExecutiveDashboard {
  totalUsers: number;
  totalCafes: number;
  activeCafes: number;
  newUsersThisPeriod: number;
  newCafesThisPeriod: number;
  bookingsThisPeriod: number;
  gmv: number;
  khelRevenue: number;
  avgBookingValue: number;
  cancellationRate: number;
  repeatBookingRate: number;
  periodDays: number;
}

export async function getExecutiveDashboard(periodDays = 30): Promise<ExecutiveDashboard> {
  return call(() => apiClient.get('/api/v1/admin/analytics/executive', { params: { periodDays } }));
}

export interface CafePerformanceItem {
  cafeId: string;
  cafeName: string;
  city: string;
  bookings: number;
  gmv: number;
  cancellations: number;
  repeatCustomers: number;
  avgBookingValue: number;
  topGame: string | null;
}

export async function getCafePerformance(): Promise<CafePerformanceItem[]> {
  return call(() => apiClient.get('/api/v1/admin/analytics/cafes'));
}

export interface SetupPerformanceItem {
  platform: string;
  bookings: number;
  gmv: number;
  totalSeats: number;
  utilizationHours: number;
}

export async function getSetupPerformance(): Promise<SetupPerformanceItem[]> {
  return call(() => apiClient.get('/api/v1/admin/analytics/setups'));
}

export interface CityGeographyItem {
  city: string;
  cafeCount: number;
  bookings: number;
  gmv: number;
}

export async function getGeography(): Promise<CityGeographyItem[]> {
  return call(() => apiClient.get('/api/v1/admin/analytics/geography'));
}

export interface RevenueBreakdown {
  gmv: number;
  khelRevenue: number;
  ownerSettlements: number;
  revenueByCity: Record<string, number>;
  revenueByPlatform: Record<string, number>;
}

export async function getRevenueBreakdown(): Promise<RevenueBreakdown> {
  return call(() => apiClient.get('/api/v1/admin/analytics/revenue'));
}

export interface MarketplaceHealth {
  totalBookings: number;
  completedCount: number;
  cancelledCount: number;
  noShowCount: number;
  failedCount: number;
  totalSearches: number;
  searchesWithNoResults: number;
}

export async function getMarketplaceHealth(): Promise<MarketplaceHealth> {
  return call(() => apiClient.get('/api/v1/admin/analytics/marketplace-health'));
}

export interface AttributionItem {
  source: string;
  users: number;
  bookings: number;
  gmv: number;
}

export async function getMarketingAttribution(): Promise<AttributionItem[]> {
  return call(() => apiClient.get('/api/v1/admin/analytics/attribution'));
}

export interface FunnelData {
  searches: number;
  venueViews: number;
  bookingsStarted: number;
  bookingsConfirmedOrCompleted: number;
}

export async function getFunnel(): Promise<FunnelData> {
  return call(() => apiClient.get('/api/v1/admin/analytics/funnels'));
}

export type TrafficGranularity = 'day' | 'week' | 'month';

export interface TrafficTotals {
  visitors: number;
  pageViews: number;
  activeUsers: number;
  signups: number;
  bookings: number;
}

export interface TrafficData {
  granularity: TrafficGranularity;
  start: string;
  end: string;
  totals: TrafficTotals;
  previousTotals: TrafficTotals;
  series: (TrafficTotals & { bucket: string })[];
  topPages: { path: string; views: number }[];
}

export async function getTraffic(granularity: TrafficGranularity, periods: number): Promise<TrafficData> {
  return call(() => apiClient.get('/api/v1/admin/analytics/traffic', { params: { granularity, periods } }));
}

export interface CampaignItem {
  id: string;
  name: string;
  source: string;
  medium: string;
  landingPage: string;
}

export async function getCampaigns(): Promise<CampaignItem[]> {
  return call(() => apiClient.get('/api/v1/admin/analytics/campaigns'));
}

export interface CampaignStats {
  campaignId: string;
  visits: number;
  uniqueVisitors: number;
  returningVisitors: number;
  ctaClicks: number;
  instagramClicks: number;
  signups: number;
  bookings: number;
  revenue: number;
}

export async function getCampaignStats(campaignId: string): Promise<CampaignStats> {
  return call(() => apiClient.get(`/api/v1/admin/analytics/campaigns/${campaignId}`));
}

export interface ShareTotals {
  shares: number;
  opens: number;
  signups: number;
  bookings: number;
}

export interface ShareReport {
  start: string;
  end: string;
  totals: ShareTotals;
  byChannel: (ShareTotals & { channel: string })[];
  byCafe: (ShareTotals & { cafeId: string; cafeName: string })[];
}

export async function getShareReport(start: string, end: string): Promise<ShareReport> {
  return call(() => apiClient.get('/api/v1/admin/analytics/shares', { params: { start, end } }));
}

// ---- Ad campaign funnel & area report (growth_report_service) ----

export interface AdCampaignOption {
  source: string;
  campaign: string | null;
  sessions: number;
  first: string;
  last: string;
}

export interface NamedCount {
  name: string;
  sessions: number;
}

export interface AdCampaignReport {
  source: string;
  campaign: string | null;
  from: string;
  to: string;
  funnel: { key: string; label: string; sessions: number; ofLanded: number; ofPrevious: number | null }[];
  totals: {
    visitors: number;
    searched: number;
    viewedCafe: number;
    notifyMe: number;
    bookingStarted: number;
    signedIn: number;
    newAccounts: number;
    booked: number;
    bookings: number;
    gmv: number;
    cameBack: number;
    sharedLocation: number;
    googleSigninFailed: number;
  };
  byAd: { ad: string; sessions: number; viewedCafe: number; acted: number; booked: number }[];
  devices: NamedCount[];
  inAppBrowser: NamedCount[];
  visitorType: NamedCount[];
  areas: NamedCount[];
  cities: NamedCount[];
  daily: { date: string; sessions: number }[];
  cafes: {
    cafeId: string;
    name: string;
    area: string;
    isLeadListing: boolean;
    views: number;
    notifyMe: number;
    bookingStarts: number;
    bookings: number;
  }[];
}

export async function listAdCampaigns(): Promise<{ campaigns: AdCampaignOption[] }> {
  return call(() => apiClient.get('/api/v1/admin/analytics/ad-campaigns'));
}

export async function getAdCampaignReport(params: {
  source: string;
  campaign?: string | null;
  from: string;
  to: string;
}): Promise<AdCampaignReport> {
  return call(() =>
    apiClient.get('/api/v1/admin/analytics/ad-campaigns/report', {
      params: { source: params.source, campaign: params.campaign || undefined, from: params.from, to: params.to },
    })
  );
}

export interface AreaRow {
  area: string;
  playersNearby: number;
  cafeViewers: number;
  notifyMe: number;
  cafes: { live: number; comingSoon: number };
  bookings: number;
  gmv: number;
  uniqueBookers: number;
  avgBookingValue: number | null;
  avgHours: number | null;
  avgPerHour: number | null;
  peakHour: number | null;
  peakDay: string | null;
  lowData: boolean;
}

export interface AreaReport {
  city: string;
  days: number;
  totals: { visitors: number; sharedLocation: number; bookings: number; gmv: number; avgBookingValue: number | null };
  areas: AreaRow[];
  flows: { from: string; to: string; sessions: number }[];
  cities: { city: string; sessions: number }[];
}

export async function getAreaReport(city: string, days: number): Promise<AreaReport> {
  return call(() => apiClient.get('/api/v1/admin/analytics/areas', { params: { city, days } }));
}
