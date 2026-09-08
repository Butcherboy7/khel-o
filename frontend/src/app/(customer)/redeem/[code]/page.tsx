'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2, Tag } from 'lucide-react';
import { previewKheloCode } from '@/lib/api/promotions';
import { Button, ErrorState } from '@/components/ui';

/**
 * Deep-link target for a KHELO promo QR — the QR encodes
 * `{SITE_URL}/redeem/{code}` (see owner offers page), not raw discount
 * logic, so scanning it just opens KHELO here. This page resolves the code
 * to its café and forwards straight into that café's booking wizard with
 * `promoCode` prefilled; the wizard itself gates payment behind login (see
 * bookings/new), so an unauthenticated scan still lands the code correctly —
 * it's simply applied once the user signs in and reaches checkout.
 */
export default function RedeemCodePage() {
  const params = useParams();
  const router = useRouter();
  const code = typeof params.code === 'string' ? params.code : Array.isArray(params.code) ? params.code[0] : '';

  const [status, setStatus] = useState<'loading' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!code) {
      setStatus('error');
      setErrorMessage('No KHELO code provided.');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { redemption } = await previewKheloCode(code);
        if (cancelled) return;
        if (!redemption.valid) {
          setStatus('error');
          setErrorMessage(redemption.reason || 'This code is no longer valid.');
          return;
        }
        router.replace(`/bookings/new?cafeId=${redemption.cafeId}&promoCode=${encodeURIComponent(code)}`);
      } catch (err: any) {
        if (cancelled) return;
        setStatus('error');
        setErrorMessage(err?.message || 'Invalid or unrecognized KHELO code.');
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  if (status === 'error') {
    return (
      <div className="max-w-md mx-auto py-16 px-4">
        <ErrorState
          title="Code Not Applied"
          message={errorMessage}
        />
        <div className="flex justify-center mt-4">
          <Button variant="primary" onClick={() => router.push('/')}>
            Browse Cafés
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
      <Tag className="h-8 w-8 text-primary" />
      <Loader2 className="h-6 w-6 animate-spin text-text-secondary" />
      <p className="text-caption text-text-secondary">Applying your KHELO code…</p>
    </div>
  );
}
