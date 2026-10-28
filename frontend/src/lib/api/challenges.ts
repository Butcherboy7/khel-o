import { apiClient, call } from './client';
import { putToPresignedUrl } from './settings';
import type { User } from '@/types';

/** Free in-person challenges at partner cafés. See backend app/api/v1/challenges.py.
 *  Public wording: "challenge", "free sign-up", "spots", "waitlist". */

export type ChallengeStatus = 'draft' | 'open' | 'closed' | 'live' | 'finished' | 'cancelled';
/** games: games won (Tekken). goals: one game, a level score settled on penalties (EA SPORTS FC). */
export type ResultType = 'games' | 'goals';
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
  resultType: ResultType;
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
  checkinClosedAt: string | null;
  drawnAt: string | null;
  championPhotoUrl: string | null;
  /** The café's own offer for everyone who comes on the day, if any. */
  visitorOffer?: string | null;
  /** Optional first-screen lines in the audience's language; English defaults when empty. */
  heroLine?: string | null;
  heroSub?: string | null;
  /** The headline reward, shown boldly next to "free to enter". */
  prizeLine?: string | null;
  /** One honest line under it (e.g. extra offers on the day). */
  prizeNote?: string | null;
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
  /** Only on the player's own page. */
  present?: boolean;
  /** PNG data URL of their check-in QR (only while they're in). */
  checkinQr?: string;
  /** 1, 2 or 3 once decided. */
  place?: number | null;
}

/** A reward this player earned. `cafes[].href` opens the café with it applied. */
export interface MyReward {
  kind: string;
  label: string;
  title: string;
  detail: string;
  startsAt: string;
  endsAt: string;
  notStarted: boolean;
  ended: boolean;
  usedUp: boolean;
  used: number;
  cafes: { name: string; href: string }[];
}

export interface MyChallenge {
  challenge: Challenge;
  entry: MyEntry | null;
  rewards?: MyReward[];
  /** Only on sign-up: false when they were already in. */
  created?: boolean;
}

// ── The day: bracket, check-in ────────────────────────────────────────────

export interface BracketSide {
  entryId: string;
  name: string;
  mainCharacter: string | null;
}

export interface BracketMatch {
  id: string;
  round: number;
  position: number;
  isThirdPlace: boolean;
  /** "Semi-final", "Final", "3rd place". */
  name: string;
  bestOf: number;
  a: BracketSide | null;
  b: BracketSide | null;
  winner: 'a' | 'b' | null;
  scoreA: number | null;
  scoreB: number | null;
  /** A level EA SPORTS FC score settled on penalties. */
  tiebreak: 'penalties' | null;
  tiebreakA: number | null;
  tiebreakB: number | null;
  bye: boolean;
}

export interface Bracket {
  challenge: Challenge;
  drawn: boolean;
  rounds: { round: number; name: string; matches: BracketMatch[] }[];
  thirdPlace: BracketMatch | null;
  upNext: BracketMatch | null;
  /** Every match that can be played now, in playing order (upNext is the first). */
  ready: BracketMatch[];
  standings: (BracketSide & { place: number })[];
}

export async function getBracket(slug: string): Promise<Bracket> {
  return call(() => apiClient.get(`/api/v1/challenges/${encodeURIComponent(slug)}/bracket`));
}

export interface PublicPlayer {
  name: string;
  status: EntryStatus;
  rank: number | null;
  mainCharacter: string | null;
}

export async function getPublicPlayer(slug: string, entryId: string): Promise<PublicPlayer> {
  return call(() => apiClient.get(`/api/v1/challenges/${encodeURIComponent(slug)}/players/${encodeURIComponent(entryId)}`));
}

export interface DoorResult {
  entryId: string;
  name: string;
  publicName: string;
  status: EntryStatus;
  rank: number | null;
  present: boolean;
  alreadyIn: boolean;
}

export async function doorCheckin(slug: string, token: string, present = true): Promise<DoorResult> {
  return call(() =>
    apiClient.post(`/api/v1/challenges/${encodeURIComponent(slug)}/checkin/${encodeURIComponent(token)}`, { present }),
  );
}

export interface JoinBody {
  name: string;
  displayName?: string;
  phone: string;
  mainCharacter?: string;
  consentRules: boolean;
  consentAge?: boolean;
  consentFilming: boolean;
  consentUpdates: boolean;
  utmSource?: string;
  utmCampaign?: string;
  utmContent?: string;
  formTicket?: string;
  website?: string;
}

export interface MyActiveChallenge {
  slug: string;
  title: string;
  game: string;
  status: ChallengeStatus;
  startsAt: string;
  cafeName: string;
  entryStatus: 'confirmed' | 'waitlist';
  rank: number | null;
  /** Their answer to "Coming on the day?"; null until they answer. */
  coming: Coming | null;
}

/** One of the player's own sign-ups, coming up or past (My challenges). */
export interface MyChallengeSummary {
  slug: string;
  title: string;
  game: string;
  status: ChallengeStatus;
  startsAt: string;
  cafeName: string;
  entryStatus: 'confirmed' | 'waitlist' | 'withdrawn' | 'no_show';
  rank: number | null;
  coming: Coming | null;
  /** Final place once the challenge is finished. */
  place: number | null;
  upcoming: boolean;
}

export async function getMyChallenges(): Promise<MyChallengeSummary[]> {
  return call(() => apiClient.get('/api/v1/challenges/mine'));
}

/** Challenges the signed-in player is in that haven't ended (home screen card). */
export async function getMyActiveChallenges(): Promise<MyActiveChallenge[]> {
  return call(() => apiClient.get('/api/v1/challenges/mine/active'));
}

export async function getChallenge(slug: string): Promise<Challenge> {
  return call(() => apiClient.get(`/api/v1/challenges/${encodeURIComponent(slug)}`));
}

export async function joinChallenge(slug: string, body: JoinBody): Promise<MyChallenge> {
  return call(() => apiClient.post(`/api/v1/challenges/${encodeURIComponent(slug)}/entries`, body));
}

export interface QuickJoinBody extends JoinBody {
  email: string;
}

/** Sign up with just a name, number and email: the account is made behind the scenes. */
export async function quickJoinChallenge(
  slug: string,
  body: QuickJoinBody,
): Promise<MyChallenge & { accessToken: string; refreshToken: string; user: User }> {
  return call(() => apiClient.post(`/api/v1/challenges/${encodeURIComponent(slug)}/quick-join`, body));
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
  consentAge?: boolean;
  toldAt: string | null;
  comingAt: string | null;
  withdrawnAt: string | null;
  withdrawnBy: 'player' | 'admin' | 'silent' | 'checkin' | null;
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
  /** Practice players are for rehearsals on dev only. */
  practiceAllowed: boolean;
  practicePlayers: number;
  added?: number;
  removed?: number;
  released?: number;
  movedUp?: number;
  noShows?: number;
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
  resultType: ResultType;
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

export type EntryAction =
  | 'withdraw' | 'no_show' | 'restore' | 'promote' | 'told' | 'test' | 'untest' | 'checkin' | 'uncheckin';

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

export async function adminFillPractice(id: string): Promise<AdminChallengeDetail> {
  return call(() => apiClient.post(`/api/v1/admin/challenges/${id}/practice-players`));
}

export async function adminClearPractice(id: string): Promise<AdminChallengeDetail> {
  return call(() => apiClient.delete(`/api/v1/admin/challenges/${id}/practice-players`));
}

export async function adminCloseCheckin(id: string): Promise<AdminChallengeDetail> {
  return call(() => apiClient.post(`/api/v1/admin/challenges/${id}/close-checkin`));
}

export async function adminDraw(id: string): Promise<Bracket> {
  return call(() => apiClient.post(`/api/v1/admin/challenges/${id}/draw`));
}

export async function adminGetBracket(id: string): Promise<Bracket> {
  return call(() => apiClient.get(`/api/v1/admin/challenges/${id}/bracket`));
}

export async function adminRecordResult(
  id: string,
  matchId: string,
  body: {
    winner: 'a' | 'b'; scoreA?: number | null; scoreB?: number | null;
    tiebreak?: 'penalties' | null; tiebreakA?: number | null; tiebreakB?: number | null;
  },
): Promise<Bracket> {
  return call(() => apiClient.post(`/api/v1/admin/challenges/${id}/matches/${matchId}/result`, body));
}

export async function adminClearResult(id: string, matchId: string): Promise<Bracket> {
  return call(() => apiClient.post(`/api/v1/admin/challenges/${id}/matches/${matchId}/clear`));
}

/** What Finish settled: rewards made or replaced, podium badges, and anything needing a look at the books. */
export interface Settlement {
  made: string[];
  replaced: string[];
  badges: number;
  badgesMoved: number;
  needsFinancialReview: string[];
}

export async function adminFinish(id: string): Promise<Bracket & { settlement: Settlement | null }> {
  return call(() => apiClient.post(`/api/v1/admin/challenges/${id}/finish`));
}

/** Back to live to correct a result. Rewards, bookings and badges stay as they are until the next Finish. */
export async function adminReopen(id: string, reason: string): Promise<Bracket> {
  return call(() => apiClient.post(`/api/v1/admin/challenges/${id}/reopen`, { reason }));
}

// ── Rewards ────────────────────────────────────────────────────────────────

export interface RewardsConfig {
  prizeHours: number[];
  prizePrice: number;
  prizeDays: number;
  prizeKheloFunded: boolean;
  winnerPercent: number;
  winnerDays: number;
  winnerKheloFunded: boolean;
  /** Off for a test run, so other cafés' owners don't see the offer. */
  winnerPartnersOn: boolean;
  waitlistPercent: number;
  waitlistDays: number;
  waitlistKheloFunded: boolean;
}

export interface RewardUse {
  bookingReference: string;
  cafe: string;
  player: string;
  sessionDate: string;
  startTime: string;
  hours: number;
  status: string;
  discount: number;
  paid: number;
  createdAt: string;
}

export interface RewardRow {
  id: string;
  kind: string;
  label: string;
  name: string;
  code: string;
  isActive: boolean;
  /** Replaced after a corrected result: kept, with its bookings, for the records. */
  superseded: boolean;
  /** The reward this one replaced, when that one had already been redeemed. */
  replacesRewardId: string | null;
  /** Set on a KHEL-O-funded replacement: why it needs a look at the books. */
  financialReviewNote: string | null;
  startsAt: string;
  endsAt: string;
  kheloFunded: boolean;
  forPeople: string[];
  peopleCount: number;
  paidUses: number;
  unpaidOrCancelled: number;
  discountTotal: number;
  paidTotal: number;
  addBack: { cafe: string; amount: number }[];
  uses: RewardUse[];
}

export interface RewardsData {
  config: RewardsConfig;
  standingsReady: boolean;
  waitlistPeople: number;
  partnerCafes: string[];
  rewards: RewardRow[];
  /** Podium places held by our own test or practice entries: no reward for them. */
  testPlaces: number[];
  posterUrl: string;
  /** PNG data URL of the winners' "scan to see your rewards" QR. */
  posterQr: string;
}

export async function adminGetRewards(id: string): Promise<RewardsData> {
  return call(() => apiClient.get(`/api/v1/admin/challenges/${id}/rewards`));
}

export async function adminSaveRewardsConfig(id: string, body: RewardsConfig): Promise<RewardsData> {
  return call(() => apiClient.patch(`/api/v1/admin/challenges/${id}/rewards-config`, body));
}

export async function adminMakeRewards(id: string, kind: 'prizes' | 'waitlist'): Promise<RewardsData> {
  return call(() => apiClient.post(`/api/v1/admin/challenges/${id}/rewards/make/${kind}`));
}

export async function adminRewardActive(id: string, campaignId: string, on: boolean): Promise<RewardsData> {
  return call(() => apiClient.post(`/api/v1/admin/challenges/${id}/rewards/${campaignId}/active/${on ? 'on' : 'off'}`));
}

// ── Champion photo ─────────────────────────────────────────────────────────

export async function adminChampionPresign(id: string, contentType: string): Promise<{ uploadUrl: string; publicUrl: string }> {
  return call(() => apiClient.post(`/api/v1/admin/challenges/${id}/champion-photo/presign`, { contentType }));
}

export async function adminSetChampionPhoto(id: string, url: string | null): Promise<Challenge> {
  return call(() => apiClient.put(`/api/v1/admin/challenges/${id}/champion-photo`, { url }));
}

/** Presign, PUT straight to storage, then set it as the champion photo. */
export async function adminUploadChampionPhoto(id: string, file: File): Promise<Challenge> {
  const { uploadUrl, publicUrl } = await adminChampionPresign(id, file.type);
  await putToPresignedUrl(uploadUrl, file);
  return adminSetChampionPhoto(id, publicUrl);
}

export interface HostedPlayer {
  name: string;
  status: 'confirmed' | 'waitlist';
  rank: number | null;
  present: boolean;
}
export type HostedChallenge = Challenge & { players: HostedPlayer[] };

/** Café owner: the challenges at their cafés (read-only, no phone numbers). */
export async function getHostingChallenges(): Promise<HostedChallenge[]> {
  return call(() => apiClient.get('/api/v1/challenges/hosting'));
}
