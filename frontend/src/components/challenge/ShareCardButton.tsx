'use client';

import { useState } from 'react';
import { Share2 } from 'lucide-react';
import { trackAction } from '@/lib/api/analyticsEvents';

/** Shares a story-sized card image (1080×1920) through the phone's share
 *  sheet, so it can go straight to an Instagram story or WhatsApp status.
 *  Where sharing files isn't possible, the image opens to be saved. */
export function ShareCardButton({
  src,
  fileName,
  text,
  label,
  challenge,
  kind,
  className,
}: {
  src: string;
  fileName: string;
  text: string;
  label: string;
  challenge: string;
  kind: string;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);

  const share = async () => {
    trackAction('challenge_share_card', { challenge, kind });
    setBusy(true);
    try {
      const blob = await (await fetch(src)).blob();
      const file = new File([blob], fileName, { type: blob.type || 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text });
        return;
      }
      window.open(src, '_blank', 'noopener');
    } catch (e) {
      // Closing the share sheet is not an error worth showing.
      if ((e as Error)?.name !== 'AbortError') window.open(src, '_blank', 'noopener');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={share}
      disabled={busy}
      className={
        className ??
        'flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-[#3A3E4A] bg-[#16181E] font-semibold text-[#F4F1EC] hover:bg-[#1C1F26] disabled:opacity-60'
      }
    >
      <Share2 className="h-4 w-4" /> {busy ? 'Getting it ready…' : label}
    </button>
  );
}
