'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { getCampaign } from '@/lib/api/promotions';
import { codeFromParams, readStoredCampaign, storeCampaign } from '@/lib/campaign';

/**
 * The link-only campaign this visitor arrived with at this café, if any:
 * from the URL (?promoCode=) or remembered from an earlier visit. The server
 * confirms it is real, live and for this café, and returns what it unlocks and
 * the real number of spots claimed. `active` is false for anything else.
 */
export function useCampaign(cafeId: string | undefined) {
  const searchParams = useSearchParams();
  const urlCode = codeFromParams((k) => searchParams.get(k));
  const [code, setCode] = useState<string | null>(urlCode);

  // Storage is read after mount so server and first client render agree.
  useEffect(() => {
    if (urlCode) {
      setCode(urlCode);
      return;
    }
    const stored = readStoredCampaign();
    setCode(stored && (!stored.cafeId || stored.cafeId === cafeId) ? stored.code : null);
  }, [urlCode, cafeId]);

  const query = useQuery({
    queryKey: ['campaign', code, cafeId],
    queryFn: () => getCampaign(code!, cafeId),
    enabled: Boolean(code && cafeId),
    retry: false,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (query.data && code) storeCampaign(code, query.data.campaign.cafeId);
  }, [query.data, code]);

  return {
    code: query.data ? code : null,
    campaign: query.data?.campaign ?? null,
    offers: query.data?.offers ?? [],
    active: Boolean(query.data),
  };
}
