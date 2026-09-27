'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, Download, QrCode, Share2 } from 'lucide-react';
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
    <section className="grid grid-cols-1 gap-4 rounded-2xl border border-border bg-card p-4 sm:grid-cols-[auto_1fr] sm:items-center sm:p-5">
      {/* eslint-disable-next-line @next/next/no-img-element -- plain PNG from our API */}
      <img
        src={qr}
        alt={`QR code that opens ${cafeName}'s review form`}
        width={132}
        height={132}
        className="mx-auto h-[132px] w-[132px] rounded-xl border border-border bg-white p-1 sm:mx-0"
      />
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="flex items-center gap-2 font-heading text-h3 text-text-primary">
            <QrCode className="h-5 w-5 text-primary" aria-hidden />
            Get more reviews
            <InfoTip text={INFO_TIPS.reviewsQr} label="How the review QR works" />
          </h2>
          <p className="text-caption text-text-secondary">
            Print this QR for your counter or tables, or send the link after a session. It opens your café page right at
            the review box. More good reviews means more players pick you when they search.
          </p>
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
