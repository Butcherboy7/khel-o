import { apiClient, call } from './client';

export type TournamentStatus = 'draft' | 'published' | 'live' | 'completed' | 'cancelled';
/** What a player sees on the card: status refined by registration state. */
export type TournamentPhase = TournamentStatus | 'open' | 'filling' | 'full' | 'closed';
export type EntryStatus = 'held' | 'confirmed' | 'waitlist' | 'cancelled' | 'removed';

export interface Prize {
  place: string;
  prize: string;
}

export interface TournamentCard {
  id: string;
  slug: string;
  title: string;
  status: TournamentStatus;
  phase: TournamentPhase;
  game: { key: string; name: string; short: string; colour: string; platform: string };
  startsAt: string;
  endsAt: string;
  checkInOpensAt: string;
  registrationClosesAt: string;
  teamSize: number;
  maxTeams: number;
  taken: number;
  spotsLeft: number;
  waitlist: number;
  entryFee: number;
  prizes: Prize[];
  sponsor: { name: string; logoUrl: string | null } | null;
  matchMinutes: number;
  stations: number;
  thirdPlace: boolean;
  format: string;
  cafe: { id: string; name: string; slug: string | null; city: string; address: string; mapsUrl: string | null } | null;
  organiser: { id: string; name: string; kind: 'khelo' | 'cafe' | 'company'; logoUrl: string | null } | null;
}

export interface EntryBrief {
  id: string;
  name: string;
  gamerTag: string;
  teamName: string | null;
  seed: number | null;
  place: number | null;
  points: number;
  checkedIn: boolean;
}

export interface MatchSide {
  entryId: string;
  name: string;
  seed: number | null;
}

export interface BracketMatch {
  id: string;
  round: number;
  position: number;
  name: string;
  a: MatchSide | null;
  b: MatchSide | null;
  scoreA: number | null;
  scoreB: number | null;
  winner: string | null;
  status: 'waiting' | 'ready' | 'called' | 'done';
  walkover: boolean;
  bye: boolean;
  station: number | null;
  calledAt: string | null;
}

export interface Bracket {
  rounds: { round: number; name: string; matches: BracketMatch[] }[];
  thirdPlace: BracketMatch | null;
  nowPlaying: BracketMatch[];
  upNext: BracketMatch[];
}

export interface MyEntry {
  id: string;
  status: EntryStatus;
  gamerTag: string;
  teamName: string | null;
  teammates: string[];
  phone: string | null;
  code: string | null;
  checkedIn: boolean;
  amount: number;
  paid: boolean;
  holdExpiresAt: string | null;
  place: number | null;
  points: number;
  refundDue: boolean;
  seed: number | null;
  entryNumber: number | null;
  nextMatch: { opponent: string; status: 'ready' | 'called'; station: number | null; round: string } | null;
  payment: { orderId: string; amount: number; currency: string; keyId: string | null } | null;
}

export interface TournamentDetail extends TournamentCard {
  about: string | null;
  rules: string | null;
  houseRules: string;
  players: EntryBrief[];
  bracket: Bracket;
  results: EntryBrief[];
  myEntry: MyEntry | null;
  registrationOpen: boolean;
}

export interface GameOption {
  key: string;
  name: string;
  short: string;
  team_sizes: number[];
  team_size: number;
  match_minutes: number;
  platform: string;
  colour: string;
  rules: string;
}

export interface LeaderRow {
  rank: number;
  userId: string;
  name: string;
  points: number;
  played: number;
  wins: number;
  podiums: number;
}

export interface CapacityEstimate {
  teams: number;
  minutes: number;
  rounds: number;
  fitsIn3h: number;
  fitsIn4h: number;
}

// ── Player ───────────────────────────────────────────────────────

export function listTournaments(params: { game?: string; city?: string; past?: boolean } = {}): Promise<TournamentCard[]> {
  return call(() => apiClient.get('/api/v1/tournaments', { params }));
}

export function getTournament(slug: string): Promise<TournamentDetail> {
  return call(() => apiClient.get(`/api/v1/tournaments/${encodeURIComponent(slug)}`));
}

export function listGames(): Promise<{ games: GameOption[]; houseRules: string }> {
  return call(() => apiClient.get('/api/v1/tournaments/games'));
}

export function getCapacity(teams: number, stations: number, matchMinutes: number, thirdPlace = false): Promise<CapacityEstimate> {
  return call(() => apiClient.get('/api/v1/tournaments/capacity', { params: { teams, stations, matchMinutes, thirdPlace } }));
}

export function getLeaderboard(city?: string): Promise<LeaderRow[]> {
  return call(() => apiClient.get('/api/v1/tournaments/leaderboard', { params: city ? { city } : {} }));
}

export interface RegisterInput {
  gamerTag: string;
  phone?: string;
  teamName?: string;
  teammates?: string[];
}

export function registerForTournament(slug: string, input: RegisterInput): Promise<MyEntry> {
  return call(() => apiClient.post(`/api/v1/tournaments/${encodeURIComponent(slug)}/register`, input));
}

export function verifyTournamentPayment(
  slug: string,
  body: { entryId: string; razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string },
): Promise<MyEntry> {
  return call(() => apiClient.post(`/api/v1/tournaments/${encodeURIComponent(slug)}/verify-payment`, body));
}

export function cancelMyEntry(slug: string): Promise<{ cancelled: boolean }> {
  return call(() => apiClient.post(`/api/v1/tournaments/${encodeURIComponent(slug)}/cancel-entry`));
}

export function getMyPass(slug: string): Promise<{ tournament: TournamentCard; entry: MyEntry; bracket: Bracket }> {
  return call(() => apiClient.get(`/api/v1/tournaments/${encodeURIComponent(slug)}/pass`));
}

export function listMyTournaments(): Promise<{ tournament: TournamentCard; entry: MyEntry }[]> {
  return call(() => apiClient.get('/api/v1/tournaments/me/entries'));
}

// ── Host console ─────────────────────────────────────────────────

export interface HostOrganiser {
  id: string;
  kind: 'khelo' | 'cafe' | 'company';
  name: string;
  slug: string;
  logoUrl: string | null;
  cafeId: string | null;
  venues: { id: string; name: string; city: string }[];
}

export interface HostTier {
  id: string;
  name: string;
  stations: number;
  platform: string | null;
}

export interface HostEntry extends EntryBrief {
  status: EntryStatus;
  phone: string | null;
  code: string;
  source: 'online' | 'walk_in';
  teammates: string[];
  amount: number;
  paid: boolean;
  refundDue: boolean;
  checkedInAt: string | null;
  createdAt: string;
}

export interface TournamentEditable {
  title: string;
  game_key: string;
  team_size: number;
  third_place: boolean;
  max_teams: number;
  entry_fee: number;
  starts_at: string;
  check_in_minutes: number;
  registration_closes_at: string;
  match_minutes: number;
  stations: number;
  prizes: Prize[];
  sponsor_name: string | null;
  sponsor_logo_url: string | null;
  about: string | null;
  rules: string | null;
  cafe_id: string;
  hardware_tier_id: string | null;
}

export interface HostTournament extends TournamentDetail {
  entries: HostEntry[];
  money: { collected: number; atCounter: number; refundDue: number };
  checkedIn: number;
  editable: TournamentEditable;
  estimate: CapacityEstimate;
  hardwareTierId: string | null;
}

export interface HostListItem extends TournamentCard {
  collected: number;
  checkedIn: number;
}

export interface TournamentWrite {
  organiserId?: string;
  cafeId?: string;
  hardwareTierId?: string | null;
  title?: string;
  gameKey?: string;
  gameName?: string;
  teamSize?: number;
  thirdPlace?: boolean;
  maxTeams?: number;
  entryFee?: number;
  startsAt?: string;
  checkInMinutes?: number;
  registrationClosesAt?: string;
  matchMinutes?: number;
  stations?: number;
  prizes?: Prize[];
  sponsorName?: string | null;
  sponsorLogoUrl?: string | null;
  about?: string | null;
  rules?: string | null;
}

const host = (id: string) => `/api/v1/host/tournaments/${id}`;

export function getHostMe(): Promise<{ organisers: HostOrganiser[]; isAdmin: boolean }> {
  return call(() => apiClient.get('/api/v1/host/me'));
}

export function getHostTiers(cafeId: string): Promise<HostTier[]> {
  return call(() => apiClient.get(`/api/v1/host/cafes/${cafeId}/tiers`));
}

export function listHostTournaments(): Promise<HostListItem[]> {
  return call(() => apiClient.get('/api/v1/host/tournaments'));
}

export function getHostTournament(id: string): Promise<HostTournament> {
  return call(() => apiClient.get(host(id)));
}

export function createTournament(body: TournamentWrite): Promise<HostTournament> {
  return call(() => apiClient.post('/api/v1/host/tournaments', body));
}

export function updateTournament(id: string, body: TournamentWrite): Promise<HostTournament> {
  return call(() => apiClient.patch(host(id), body));
}

export function publishTournament(id: string): Promise<HostTournament> {
  return call(() => apiClient.post(`${host(id)}/publish`));
}

export function closeRegistration(id: string): Promise<HostTournament> {
  return call(() => apiClient.post(`${host(id)}/close-registration`));
}

export function cancelTournament(id: string, reason: string): Promise<HostTournament> {
  return call(() => apiClient.post(`${host(id)}/cancel`, { reason }));
}

export function checkInEntry(id: string, body: { code?: string; entryId?: string; undo?: boolean }): Promise<{ entryId: string; name: string; checkedIn: boolean }> {
  return call(() => apiClient.post(`${host(id)}/check-in`, body));
}

export function addWalkIn(id: string, body: { gamerTag: string; phone?: string; teamName?: string; paidAtCounter: boolean }): Promise<HostTournament> {
  return call(() => apiClient.post(`${host(id)}/walk-ins`, body));
}

export function removeEntry(id: string, entryId: string): Promise<HostTournament> {
  return call(() => apiClient.post(`${host(id)}/entries/${entryId}/remove`));
}

export function makeBracket(id: string, seeding: 'random' | 'check_in' = 'random'): Promise<HostTournament> {
  return call(() => apiClient.post(`${host(id)}/bracket`, { seeding }));
}

export function callMatch(id: string, matchId: string, station: number | null): Promise<HostTournament> {
  return call(() => apiClient.post(`${host(id)}/matches/${matchId}/call`, { station }));
}

export function reportScore(
  id: string,
  matchId: string,
  body: { scoreA?: number; scoreB?: number; walkoverWinner?: 'a' | 'b' },
): Promise<HostTournament> {
  return call(() => apiClient.post(`${host(id)}/matches/${matchId}/score`, body));
}

// ── Admin: organisers ────────────────────────────────────────────

export interface OrganiserMemberRow {
  userId: string;
  name: string;
  email: string;
  role: 'owner' | 'staff';
}

export interface AdminOrganiser extends Omit<HostOrganiser, 'venues'> {
  members: OrganiserMemberRow[];
}

export function listOrganisers(): Promise<AdminOrganiser[]> {
  return call(() => apiClient.get('/api/v1/host/organisers'));
}

export function createOrganiser(body: { name: string; kind: 'company' | 'khelo'; logoUrl?: string; memberEmail?: string }): Promise<AdminOrganiser> {
  return call(() => apiClient.post('/api/v1/host/organisers', body));
}

export function addOrganiserMember(organiserId: string, email: string, role: 'owner' | 'staff'): Promise<OrganiserMemberRow[]> {
  return call(() => apiClient.post(`/api/v1/host/organisers/${organiserId}/members`, { email, role }));
}

export function removeOrganiserMember(organiserId: string, userId: string): Promise<OrganiserMemberRow[]> {
  return call(() => apiClient.delete(`/api/v1/host/organisers/${organiserId}/members/${userId}`));
}
