import { apiClient, call } from './client';

/** Community page: this week's poll, members-only code, contributions.
 *  See backend app/api/v1/community.py. "Member" = tapped Join while logged in. */

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

export interface ThisWeek {
  poll: CommunityPoll | null;
  isMember: boolean;
  members: number;
  contributors: string[];
}

export async function getThisWeek(): Promise<ThisWeek> {
  return call(() => apiClient.get('/api/v1/community/this-week'));
}

export async function markJoined(): Promise<{ isMember: boolean }> {
  return call(() => apiClient.post('/api/v1/community/joined'));
}

export async function voteInPoll(pollId: string, optionIndex: number): Promise<{ myVote: number }> {
  return call(() => apiClient.post(`/api/v1/community/polls/${pollId}/vote`, { optionIndex }));
}

export interface ContributionBody {
  kind: 'cafe' | 'photos';
  title: string;
  detail?: string;
  showName: boolean;
}

export async function sendContribution(body: ContributionBody): Promise<{ ok: boolean }> {
  return call(() => apiClient.post('/api/v1/community/contributions', body));
}
