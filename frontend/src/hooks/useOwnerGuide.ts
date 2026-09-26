'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getGuideState, postGuideEvent, type GuideEvent } from '@/lib/api/ownerGuide';
import { PULSE_SESSIONS, TIP_VISITS, type GuidePage } from '@/lib/ownerGuideCopy';

const GUIDE_KEY = ['owner', 'guide'] as const;
const SESSION_FLAG = 'khelo-owner-guide-session';

function useGuideState() {
  return useQuery({
    queryKey: GUIDE_KEY,
    queryFn: getGuideState,
    staleTime: Infinity,
    retry: false,
  });
}

function useRecord() {
  const queryClient = useQueryClient();
  return (event: GuideEvent) => {
    postGuideEvent(event)
      .then((state) => queryClient.setQueryData(GUIDE_KEY, state))
      .catch(() => {
        // Guidance is a nicety; a failed write must never surface as an error.
      });
  };
}

/** Counts one app session per browser session. Mount once, in OwnerShell. */
export function useGuideSession() {
  const record = useRecord();
  useEffect(() => {
    try {
      if (sessionStorage.getItem(SESSION_FLAG)) return;
      sessionStorage.setItem(SESSION_FLAG, '1');
    } catch {
      return; // No sessionStorage: skip rather than count every page load.
    }
    record({ type: 'session_start' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/** Whether ⓘ icons should pulse (the owner's first few sessions). */
export function useGuidePulse(): boolean {
  const { data } = useGuideState();
  return !!data && data.sessions <= PULSE_SESSIONS;
}

/**
 * Page tip state for one page. Records the visit and decides once, from the
 * state as it was on arrival, whether to show the tip — so the box doesn't
 * vanish mid-visit when the visit count ticks over.
 */
export function usePageGuide(page: GuidePage) {
  const { data } = useGuideState();
  const record = useRecord();
  const [showTip, setShowTip] = useState(false);
  const decided = useRef(false);

  useEffect(() => {
    if (!data || decided.current) return;
    decided.current = true;
    const seen = data.pages[page];
    setShowTip(!seen?.dismissed && (seen?.views ?? 0) < TIP_VISITS);
    record({ type: 'page_view', page });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, page]);

  return {
    showTip,
    /** Close for this visit only. */
    hideTip: () => setShowTip(false),
    /** Never show this page's tip again. */
    dismissTip: () => {
      setShowTip(false);
      record({ type: 'dismiss', page });
    },
  };
}
