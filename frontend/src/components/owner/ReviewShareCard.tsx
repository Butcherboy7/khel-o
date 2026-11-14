'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, Download, Share2 } from 'lucide-react';
import { reviewLink, reviewQrUrl } from '@/lib/api/reviews';
import { InfoTip } from '@/components/shared/InfoTip';
import { INFO_TIPS } from '@/lib/ownerGuideCopy';

/**
 * "Get more reviews": the owner's link and printable QR code. Scanning or
 * tapping it opens the café's KHEL-O page right at the review form, so a
 * customer finishing a session can rate the café in a few seconds.
 */
export function ReviewShareCard({ cafeId, cafeSlug, cafeName }: { cafeId: string; cafeSlug?: string | null; cafeName: string }) {
  const [origin, setOrigin] = useState('https://khel-o.com');
  const [copied, setCopied] = useState(false);
  useEffect(() => setOrigin(window.location.origin), []);

  const link = reviewLink(origin, cafeSlug || cafeId);
  const qr = reviewQrUrl(cafeId);

  const copy = async () => {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const share = async () => {
    const text = `Played at ${cafeName}? Leave us a quick rating on KHEL-O:`;
    if (navigator.share) {
      try {
        await navigator.share({ title: `Review ${cafeName}`, text, url: link });
        return;
      } catch {
        // Share sheet dismissed: fall back to copying.
      }
    }
    await copy();
  };

  const download = async () => {
    // Fetched as a blob so the browser saves a file instead of opening it.
    const res = await fetch(qr);
    const href = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = href;
    a.download = `${cafeSlug || 'cafe'}-review-qr.png`;
    a.click();
    URL.revokeObjectURL(href);
  };

  const btn =
    'inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 text-caption font-semibold text-text-primary hover:bg-surface';

  return (
    <section className="grid grid-cols-[auto_1fr] items-start gap-3 rounded-2xl border border-border bg-card p-3 sm:items-center sm:gap-4 sm:p-4">
      {/* eslint-disable-next-line @next/next/no-img-element -- plain PNG from our API */}
      <img
        src={qr}
        alt={`QR code that opens ${cafeName}'s review form`}
        width={96}
        height={96}
        className="h-[84px] w-[84px] rounded-xl border border-border bg-white p-1 sm:h-24 sm:w-24"
      />
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-col gap-0.5">
          <h2 className="flex items-center gap-1.5 font-heading text-body-emphasis font-bold text-text-primary">
            Get more reviews
            <InfoTip text={INFO_TIPS.reviewsQr} label="How the review QR works" />
          </h2>
          <p className="text-caption text-text-secondary">Put it on your counter. Scanning opens your review box.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={share} className={btn}>
            <Share2 className="h-4 w-4" aria-hidden /> Share link
          </button>
          <button type="button" onClick={copy} className={btn}>
            {copied ? <Check className="h-4 w-4 text-success" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
            {copied ? 'Copied' : 'Copy link'}
          </button>
          <button type="button" onClick={download} className={btn}>
            <Download className="h-4 w-4" aria-hidden /> Download QR
          </button>
        </div>
      </div>
    </section>
  );
}
