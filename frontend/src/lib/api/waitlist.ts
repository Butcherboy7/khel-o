import { apiClient, call } from './client';
import { useAnalyticsStore } from '@/store/analyticsStore';

export interface UnlockedBadge {
  key: string;
  title: string;
  xp: number;
}

export interface WaitlistStatus {
  count: number;
  joined: boolean;
  goal: number;
  /** Set only on the vote that earned a badge, so the page can celebrate it. */
  badgeUnlocked?: UnlockedBadge | null;
}

/** The same session id the analytics client sends, deliberately reused rather
 *  than minting a second one — the backend keys signed-out waitlist entries on
 *  it, so a separate id would let one person count twice. */
function sessionId(): string {
  return useAnalyticsStore.getState().sessionId;
}

export async function getWaitlistStatus(cafeId: string): Promise<WaitlistStatus> {
  return call(() =>
    apiClient.get(`/api/v1/cafes/${cafeId}/waitlist/count`, {
      params: { sessionId: sessionId() },
    })
  );
}

/** Sign-in required: a vote earns a badge and XP, so it belongs to an account. */
export async function joinWaitlist(cafeId: string): Promise<WaitlistStatus> {
  return call(() =>
    apiClient.post(`/api/v1/cafes/${cafeId}/waitlist`, {
      sessionId: sessionId(),
    })
  );
}

export async function leaveWaitlist(cafeId: string): Promise<WaitlistStatus> {
  return call(() =>
    apiClient.delete(`/api/v1/cafes/${cafeId}/waitlist`, {
      data: { sessionId: sessionId() },
    })
  );
}

export type PlayTime = 'weekday_evenings' | 'weekends' | 'late_nights';

/** The optional one-tap "when would you usually play?" answer. */
export async function setWaitlistPlayTime(cafeId: string, playTime: PlayTime): Promise<{ playTime: PlayTime }> {
  return call(() =>
    apiClient.patch(`/api/v1/cafes/${cafeId}/waitlist/play-time`, {
      sessionId: sessionId(),
      playTime,
    })
  );
}
