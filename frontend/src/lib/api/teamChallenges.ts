import { apiClient, call } from './client';
import type { User } from '@/types';

/** Team challenges (Valorant 3v3 first). See backend app/api/v1/challenge_teams.py. */

export const RANKS = ['Unrated', 'Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Ascendant', 'Immortal', 'Radiant'] as const;
export const PLAY_STYLES: { id: string; label: string }[] = [
  { id: 'entry', label: 'I go in first' },
  { id: 'support', label: 'I support my team' },
  { id: 'anchor', label: 'I play safe and hold angles' },
  { id: 'any', label: 'Anything is fine' },
];

export interface TeamInfo {
  size: number;
  maxSubs: number;
  priceTeam: number;
  priceSolo: number;
  maxTeams: number | null;
  minTeams: number;
  holdMinutes: number;
  registrationClosesAt: string | null;
  signupsOpen: boolean;
  teams: number;
  spotsLeft: number | null;
  holding: number;
  waitlistTeams: number;
  solosWaiting: number;
}

export interface PlayerForm {
  fullName: string;
  phone: string;
  riotId: string;
  rank: string;
  instagram: string;
  college: string;
  playStyle?: string;
}

export interface Taps {
  community: boolean;
  instaKhelo: boolean;
  instaVenue: boolean;
}

export interface EntryBody {
  kind: 'team' | 'solo';
  teamName?: string;
  player: PlayerForm;
  sub?: { fullName: string; riotId: string; phone: string } | null;
  taps: Taps;
  agreed: boolean;
}

export interface Order {
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
  holdUntil: string;
  kind: 'team' | 'solo';
}

export interface Member {
  id: string;
  role: 'captain' | 'player' | 'sub' | 'solo';
  status: string;
  fullName: string;
  riotId: string;
  rank: string | null;
  joined: boolean;
  checkedIn: boolean;
  phone?: string;
  email?: string | null;
  instagram?: string | null;
  college?: string | null;
  playStyle?: string | null;
  addedBy?: string | null;
  tappedCommunity?: boolean;
  tappedInstaKhelo?: boolean;
  tappedInstaVenue?: boolean;
  isTest?: boolean;
}

export interface MyTeamEntry {
  player: (Member & { qr: string | null; checkinUrl: string | null }) | null;
  team: {
    id: string;
    name: string;
    kind: 'team' | 'solo_group';
    status: 'confirmed' | 'waitlist' | 'withdrawn' | string;
    number: number;
    offered: boolean;
    players: number;
    size: number;
    subs: number;
    maxSubs: number;
    inviteUrl: string | null;
    members: Member[];
    present: boolean;
  } | null;
  matches: { round: string; startsAt: string | null; lobby: string | null; bestOf: number; against: string | null; won: boolean | null }[];
  pending: { kind: 'team' | 'solo'; holdUntil: string } | null;
  payment?: { amount: number; status: 'paid' | 'refunded'; paymentId: string | null; paidAt: string | null; refundedAt: string | null };
}

export interface InviteInfo {
  teamName: string;
  captain: string | null;
  players: number;
  size: number;
  subs: number;
  maxSubs: number;
  full: boolean;
  mainFull: boolean;
  alreadyIn: boolean;
  alreadyInThisTeam: boolean;
  phonePrefill: string;
  namePrefill: string;
}

const base = (slug: string) => `/api/v1/challenges/${encodeURIComponent(slug)}/team`;

export function makeAccount(slug: string, body: { name: string; email: string; phone: string; utmSource?: string | null; utmCampaign?: string | null; formTicket?: string; website?: string }) {
  return call<{ accessToken: string; refreshToken: string; user: User }>(() => apiClient.post(`${base(slug)}/account`, body));
}

export function startPayment(slug: string, body: EntryBody) {
  return call<Order>(() => apiClient.post(`${base(slug)}/pay`, body));
}

export function startOfferPayment(slug: string) {
  return call<Order>(() => apiClient.post(`${base(slug)}/pay-offer`));
}

export function verifyPayment(slug: string, body: { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string }) {
  return call<MyTeamEntry>(() => apiClient.post(`${base(slug)}/verify`, body));
}

export function joinWaitlist(slug: string, body: EntryBody) {
  return call<MyTeamEntry>(() => apiClient.post(`${base(slug)}/waitlist`, body));
}

export function getMyTeamEntry(slug: string) {
  return call<MyTeamEntry>(() => apiClient.get(`${base(slug)}/me`));
}

export function getInvite(slug: string, code: string) {
  return call<InviteInfo>(() => apiClient.get(`${base(slug)}/invite/${encodeURIComponent(code)}`));
}

export type InvitePeek = Pick<InviteInfo, 'teamName' | 'captain' | 'players' | 'size' | 'full' | 'mainFull'>;

/** The team behind an invite link, before the visitor has logged in. */
export function peekInvite(slug: string, code: string) {
  return call<InvitePeek>(() => apiClient.get(`${base(slug)}/invite/${encodeURIComponent(code)}/peek`));
}

export function joinWithInvite(slug: string, code: string, body: { player: PlayerForm; asSub: boolean; taps: Taps; agreed: boolean }) {
  return call<MyTeamEntry>(() => apiClient.post(`${base(slug)}/invite/${encodeURIComponent(code)}`, body));
}

export function captainAddsTeammate(slug: string, body: { player: Partial<PlayerForm>; asSub: boolean }) {
  return call<MyTeamEntry>(() => apiClient.post(`${base(slug)}/me/teammates`, body));
}

export function tapLink(slug: string, which: 'community' | 'instaKhelo' | 'instaVenue') {
  return call<void>(() => apiClient.post(`${base(slug)}/me/tap`, { which })).catch(() => undefined);
}

export interface DeskPlayerResult extends Member {
  already: boolean;
  teamName: string | null;
}

export function deskCheckin(slug: string, token: string, present = true) {
  return call<DeskPlayerResult>(() => apiClient.post(`/api/v1/challenges/${encodeURIComponent(slug)}/players/${token}/checkin`, { present }));
}

// ── Admin ────────────────────────────────────────────────────────────────

export interface DeskTeam {
  id: string;
  name: string;
  kind: 'team' | 'solo_group';
  status: string;
  number: number;
  size: number;
  players: number;
  subs: number;
  present: boolean;
  offered: boolean;
  inviteCode: string | null;
  isTest: boolean;
  paid: boolean;
  refunded: boolean;
  amount: number | null;
  paidAt: string | null;
  paymentId?: string | null;
  members: Member[];
  checkedIn: number;
  captain: { name: string; phone: string; email?: string | null } | null;
  lastRemindedAt: string | null;
}

export interface TeamDesk {
  challenge: { id: string; slug: string; title: string; status: string; drawnAt: string | null; startsAt: string; cafe: string; drawSeed: number | null };
  stats: { maxTeams: number | null; teams: number; teamsWithTest: number; holding: number; spotsLeft: number | null; waitlistTeams: number; solosWaiting: number; solosWaitlist: number; players: number };
  config: { size: number; maxSubs: number; priceTeam: number; priceSolo: number; maxTeams: number | null; minTeams: number };
  teams: DeskTeam[];
  waitlist: DeskTeam[];
  removed: DeskTeam[];
  solos: (Member & { paid: boolean; refunded: boolean })[];
  money: { paid: number; refunded: number; payments: number };
  /** Dev only: practice teams can be added. */
  practiceAllowed: boolean;
  practicePlayers: number;
  /** Read from the bracket once the final has a result. */
  rewards: { ready: false } | { ready: true; top: { id: string; name: string } | null; second: { id: string; name: string } | null; semis: { id: string; name: string }[] };
}

const admin = (id: string) => `/api/v1/admin/challenges/${id}/teams`;

export const adminTeams = {
  links: (id: string) => call<{ links: { link: string; opened: number; tapped: number; paid: number }[] }>(() => apiClient.get(`/api/v1/admin/challenges/${id}/links`)),
  desk: (id: string) => call<TeamDesk>(() => apiClient.get(admin(id))),
  makeTeam: (id: string, playerIds: string[], name?: string) => call<TeamDesk>(() => apiClient.post(`${admin(id)}/solo-team`, { playerIds, name: name || null })),
  placeSolo: (id: string, playerId: string, entryId: string) => call<TeamDesk>(() => apiClient.post(`${admin(id)}/place-solo`, { playerId, entryId })),
  offer: (id: string, entryId: string, on = true) => call<TeamDesk>(() => apiClient.post(`${admin(id)}/${entryId}/offer`, { on })),
  refundSolo: (id: string, playerId: string, reason: string) => call<TeamDesk>(() => apiClient.post(`${admin(id)}/players/${playerId}/refund`, { reason })),
  refundTeam: (id: string, entryId: string, reason: string) => call<TeamDesk>(() => apiClient.post(`${admin(id)}/${entryId}/refund`, { reason })),
  cancelAll: (id: string, reason: string) => call<TeamDesk & { cancelResult: { refunded: number; failed: number } }>(() => apiClient.post(`${admin(id)}/cancel-all`, { reason, confirm: 'CANCEL' })),
  checkin: (id: string, playerId: string, present: boolean) => call<TeamDesk>(() => apiClient.post(`${admin(id)}/players/${playerId}/checkin`, { present })),
  draw: (id: string, redo = false, earlyOk = false) => call<{ teams: number }>(() => apiClient.post(`${admin(id)}/draw`, { redo, earlyOk })),
  clearResult: (id: string, matchId: string) => call<void>(() => apiClient.post(`${admin(id)}/matches/${matchId}/clear`)),
  matchTime: (id: string, matchId: string, startsAt: string | null, lobby: 'A' | 'B' | null) => call<void>(() => apiClient.post(`${admin(id)}/matches/${matchId}/time`, { startsAt, lobby })),
  result: (id: string, matchId: string, winner: 'a' | 'b', games: { a: number | null; b: number | null }[]) =>
    call<void>(() => apiClient.post(`${admin(id)}/matches/${matchId}/result`, { winner, games })),
  remindCaptains: (id: string) => call<TeamDesk & { remindResult: { sent: number; skipped: number } }>(() => apiClient.post(`${admin(id)}/remind-captains`)),
  fillPractice: (id: string) => call<TeamDesk & { made: { teams: number; short: number; solos: number } }>(() => apiClient.post(`${admin(id)}/practice`)),
  clearPractice: (id: string) => call<TeamDesk & { removed: number }>(() => apiClient.delete(`${admin(id)}/practice`)),
  remindOne: (id: string, entryId: string) => call<TeamDesk & { remindResult: { sent: number; skipped: number } }>(() => apiClient.post(`${admin(id)}/${entryId}/remind`)),
  csvUrl: (id: string) => `${admin(id)}.csv`,
};

/** The teams sheet as a file (signed-in request, so not a plain link). */
export async function downloadTeamsCsv(id: string, slug: string): Promise<void> {
  const res = await apiClient.get(`${admin(id)}.csv`, { responseType: 'blob' });
  const href = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = `khelo-${slug}-teams.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 60000);
}
