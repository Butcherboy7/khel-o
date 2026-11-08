import { apiClient, call } from './client';
import { adSource, getDeviceId } from '@/lib/communityJoin';

/** Community page: weekly post, polls, members-only code, suggestions.
 *  No login needed: one phone is one id (see lib/communityJoin.ts).
 *  See backend app/api/v1/community.py. "Member" = tapped Join. */

export interface PollOption {
  label: string;
  votes: number;
  percent: number;
}

export interface CommunityPoll {
  id: string;
  question: string;
  options: PollOption[];
  total: number;
  closesAt: string | null;
  closed: boolean;
  myVote: number | null;
  hasCode: boolean;
  codeNote: string | null;
  /** Only present for people who tapped Join. */
  code: string | null;
}

export interface ClosedPoll {
  question: string;
  winner: string;
  votes: number;
}

export interface CommunityPost {
  id: string;
  headline: string;
  line: string | null;
  imageUrl: string | null;
  buttonLabel: string | null;
  buttonUrl: string | null;
  createdAt: string;
}

export interface ThisWeek {
  poll: CommunityPoll | null;
  closedPolls: ClosedPoll[];
  post: CommunityPost | null;
  isMember: boolean;
  members: number;
  contributors: string[];
}

export async function getThisWeek(): Promise<ThisWeek> {
  return call(() => apiClient.get('/api/v1/community/this-week', { params: { deviceId: getDeviceId() } }));
}

export async function markJoined(): Promise<{ isMember: boolean }> {
  return call(() => apiClient.post('/api/v1/community/joined'));
}

export async function voteInPoll(pollId: string, optionIndex: number): Promise<{ myVote: number }> {
  return call(() => apiClient.post(`/api/v1/community/polls/${pollId}/vote`, { optionIndex, deviceId: getDeviceId() }));
}

export interface ContributionBody {
  kind: 'cafe' | 'photos';
  title: string;
  detail?: string;
  showName: boolean;
  name?: string;
  contact?: string;
}

export async function sendContribution(body: ContributionBody): Promise<{ ok: boolean }> {
  return call(() => apiClient.post('/api/v1/community/contributions', { ...body, deviceId: getDeviceId() }));
}

/** An optional email and/or number, left after joining. Promotions only with the ticked box. */
export async function leaveContact(body: { email?: string; phone?: string; marketingOk: boolean }): Promise<{ ok: boolean }> {
  return call(() => apiClient.post('/api/v1/community/lead', { ...body, deviceId: getDeviceId(), source: adSource() }));
}
