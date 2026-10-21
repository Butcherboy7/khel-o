import { apiClient, call } from './client';

/** Free in-person challenges at partner cafés. See backend app/api/v1/challenges.py.
 *  Public wording: "challenge", "free sign-up", "spots", "waitlist". */

export type ChallengeStatus = 'draft' | 'open' | 'closed' | 'live' | 'finished';
export type EntryStatus = 'confirmed' | 'waitlist' | 'withdrawn' | 'no_show';
export type Coming = 'yes' | 'no';

export interface Challenge {
  id: string;
  slug: string;
  title: string;
  game: string;
  setupLine: string | null;
  format: string;
  bestOf: number;
  finalBestOf: number;
  startsAt: string;
  endsAt: string;
  checkinOpensAt: string;
  checkinClosesAt: string;
  capacity: number;
  minAge: number;
  status: ChallengeStatus;
  rulesMd: string;
  prizesMd: string;
  coverImageUrl: string | null;
  communityUrl: string | null;
  instagramHandle: string | null;
  cafe: { id: string; name: string; slug: string | null; address: string; city: string; mapsUrl: string | null };
  /** Real counts, never padded. */
  confirmed: number;
  spotsLeft: number;
  waitlist: number;
}

export interface MyEntry {
  id: string;
  status: EntryStatus;
  /** "Confirmed #4" / "Waitlist #2". Null once out. */
  rank: number | null;
  name: string;
  displayName: string | null;
  publicName: string;
  phone: string;
  mainCharacter: string | null;
  coming: Coming | null;
  promotedAt: string | null;
  consentFilming: boolean;
  consentUpdates: boolean;
  joinedAt: string;
}

export interface MyChallenge {
  challenge: Challenge;
  entry: MyEntry | null;
  /** Only on sign-up: false when they were already in. */
  created?: boolean;
}

export interface JoinBody {
  name: string;
  displayName?: string;
  phone: string;
  mainCharacter?: string;
  consentRules: boolean;
  consentAge: boolean;
  consentFilming: boolean;
  consentUpdates: boolean;
  utmSource?: string;
  utmCampaign?: string;
  utmContent?: string;
  formTicket?: string;
  website?: string;
}

export async function getChallenge(slug: string): Promise<Challenge> {
  return call(() => apiClient.get(`/api/v1/challenges/${encodeURIComponent(slug)}`));
}

export async function joinChallenge(slug: string, body: JoinBody): Promise<MyChallenge> {
  return call(() => apiClient.post(`/api/v1/challenges/${encodeURIComponent(slug)}/entries`, body));
}

export async function getMyChallenge(slug: string): Promise<MyChallenge> {
  return call(() => apiClient.get(`/api/v1/challenges/${encodeURIComponent(slug)}/me`));
}

export async function answerComing(slug: string, coming: Coming): Promise<MyChallenge> {
  return call(() => apiClient.post(`/api/v1/challenges/${encodeURIComponent(slug)}/me/coming`, { coming }));
}

export async function withdrawFromChallenge(slug: string): Promise<MyChallenge> {
  return call(() => apiClient.post(`/api/v1/challenges/${encodeURIComponent(slug)}/me/withdraw`));
}

// ── Admin ──────────────────────────────────────────────────────────────────

export interface AdminEntry extends MyEntry {
  position: number;
  userId: string;
  consentRules: boolean;
  consentAge: boolean;
  toldAt: string | null;
  comingAt: string | null;
  withdrawnAt: string | null;
  withdrawnBy: 'player' | 'admin' | 'silent' | null;
  present: boolean;
  checkedInAt: string | null;
  utmSource: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  isTest: boolean;
}

export interface ChallengeStats {
  signedUp: number;
  confirmed: number;
  waitlist: number;
  withdrawn: number;
  noShow: number;
  comingYes: number;
  comingNoAnswer: number;
  movedUpNotTold: number;
  checkedIn: number;
  filmingOk: number;
  updatesOk: number;
  tests: number;
  sources: Record<string, number>;
  /** Taps and views by action name: { challenge_page_view: { count, people } }. */
  events: Record<string, { count: number; people: number }>;
}

export interface AdminChallengeDetail {
  challenge: Challenge;
  entries: AdminEntry[];
  stats: ChallengeStats;
  released?: number;
  movedUp?: number;
}

export interface ChallengeInput {
  slug: string;
  title: string;
  cafeId: string;
  game: string;
  setupLine: string | null;
  format: string;
  bestOf: number;
  finalBestOf: number;
  startsAt: string;
  endsAt: string;
  checkinOpensAt: string;
  checkinClosesAt: string;
  capacity: number;
  minAge: number;
  status: ChallengeStatus;
  rulesMd: string;
  prizesMd: string;
  coverImageUrl: string | null;
  communityUrl: string | null;
  instagramHandle: string | null;
}

export type EntryAction = 'withdraw' | 'no_show' | 'restore' | 'promote' | 'told' | 'test' | 'untest';

export async function adminListChallenges(): Promise<Challenge[]> {
  return call(() => apiClient.get('/api/v1/admin/challenges'));
}

export async function adminCafeOptions(): Promise<{ id: string; name: string; city: string }[]> {
  return call(() => apiClient.get('/api/v1/admin/challenges/cafe-options'));
}

export async function adminCreateChallenge(body: ChallengeInput): Promise<Challenge> {
  return call(() => apiClient.post('/api/v1/admin/challenges', body));
}

export async function adminUpdateChallenge(id: string, body: ChallengeInput): Promise<Challenge> {
  return call(() => apiClient.patch(`/api/v1/admin/challenges/${id}`, body));
}

export async function adminGetChallenge(id: string): Promise<AdminChallengeDetail> {
  return call(() => apiClient.get(`/api/v1/admin/challenges/${id}`));
}

export async function adminEntryAction(id: string, entryId: string, action: EntryAction): Promise<AdminChallengeDetail> {
  return call(() => apiClient.post(`/api/v1/admin/challenges/${id}/entries/${entryId}/${action}`));
}

export async function adminReleaseSilent(id: string): Promise<AdminChallengeDetail> {
  return call(() => apiClient.post(`/api/v1/admin/challenges/${id}/release-silent`));
}

/** Goes through apiClient so the admin's bearer token is attached. */
export async function adminDownloadEntriesCsv(id: string, slug: string): Promise<void> {
  const res = await apiClient.get(`/api/v1/admin/challenges/${id}/entries.csv`, { responseType: 'blob' });
  const href = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = `khelo-${slug}-players.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}
