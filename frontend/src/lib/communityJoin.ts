'use client';

import { trackAction } from '@/lib/api/analyticsEvents';
import { getApiUrl } from '@/lib/api/client';
import { isInAppBrowser } from '@/lib/campaign';
import { useAnalyticsStore } from '@/store/analyticsStore';

/** The community page needs no login, so one phone is identified by a random id kept in the browser. */
const DEVICE_KEY = 'khelo.device';
const JOINED_KEY = 'khelo_community_tapped';
const VOTED_KEY = 'khelo.community.voted';
const SUGGESTED_KEY = 'khelo.community.suggested';
const LEAD_KEY = 'khelo.community.lead';
export const SEEN_POST_KEY = 'khelo.community.seen';

let memoryId: string | null = null;

function newId(): string {
  try {
    return crypto.randomUUID().replace(/-/g, '');
  } catch {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  }
}

export function getDeviceId(): string {
  if (typeof window === 'undefined') return '';
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = newId();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    memoryId = memoryId ?? newId();
    return memoryId;
  }
}

function flag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function setFlag(key: string): void {
  try {
    localStorage.setItem(key, '1');
  } catch {
    /* private window: skip */
  }
}

export const joinedHere = () => flag(JOINED_KEY);
export const votedHere = () => flag(VOTED_KEY);
export const suggestedHere = () => flag(SUGGESTED_KEY);
export const leadLeftHere = () => flag(LEAD_KEY);
export const markVoted = () => setFlag(VOTED_KEY);
export const markSuggested = () => setFlag(SUGGESTED_KEY);
export const markLeadLeft = () => setFlag(LEAD_KEY);

/** Which ad or link brought this person (the campaign slug), if any. */
export function adSource(): string | undefined {
  const t = useAnalyticsStore.getState().currentTouch();
  return t?.c || t?.s || undefined;
}

/** Counts a Join tap. Call it from the click that opens the WhatsApp group: the
 *  request is fire-and-forget (keepalive), so leaving the page never loses it. */
export function recordJoin(where: string): void {
  trackAction('community_join_tap', { where });
  setFlag(JOINED_KEY);
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = localStorage.getItem('accessToken');
    if (token) headers.Authorization = `Bearer ${token}`;
    fetch(`${getApiUrl()}/api/v1/community/join`, {
      method: 'POST',
      headers,
      keepalive: true,
      body: JSON.stringify({ deviceId: getDeviceId(), source: adSource(), inApp: isInAppBrowser(navigator.userAgent) }),
    }).catch(() => undefined);
  } catch {
    /* never block the tap */
  }
}
