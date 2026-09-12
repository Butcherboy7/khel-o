import { apiClient, call } from './client';
import { useAnalyticsStore } from '@/store/analyticsStore';

export interface WaitlistStatus {
  count: number;
  joined: boolean;
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

export async function joinWaitlist(cafeId: string, contact?: string): Promise<WaitlistStatus> {
  return call(() =>
    apiClient.post(`/api/v1/cafes/${cafeId}/waitlist`, {
      sessionId: sessionId(),
      contact,
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
