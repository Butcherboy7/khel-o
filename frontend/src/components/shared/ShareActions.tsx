'use client';

import { useState } from 'react';
import { CalendarPlus, Check, Image as ImageIcon, Link2, MapPin } from 'lucide-react';
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon';
import { downloadIcs, type CalendarEvent } from '@/lib/ics';

export type ShareChannel = 'whatsapp' | 'copy_link' | 'map' | 'calendar' | 'story' | 'native';

export function whatsappLink(text: string, url: string): string {
  return `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;
}

/** The big green "Share on WhatsApp" button: the one most people use. */
export function WhatsAppButton({
  text,
  url,
  label = 'Share on WhatsApp',
  onShare,
  className = '',
}: {
  text: string;
  url: string;
  label?: string;
  onShare?: (channel: ShareChannel) => void;
  className?: string;
}) {
  return (
    <a
      href={whatsappLink(text, url)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => onShare?.('whatsapp')}
      className={`flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-[#25D366] text-[17px] font-bold text-[#06240F] transition-colors hover:bg-[#1FBF5B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${className}`}
    >
      <WhatsAppIcon className="h-6 w-6" /> {label}
    </a>
  );
}

/** A row of familiar icons with one or two words each: copy link, map,
 *  calendar and the story picture. Any that are not passed are left out. */
export function ShareIconRow({
  url,
  mapsUrl,
  calendar,
  story,
  onShare,
}: {
  url?: string;
  mapsUrl?: string | null;
  calendar?: CalendarEvent & { fileName?: string };
  story?: { src: string; fileName: string; text: string };
  onShare?: (channel: ShareChannel) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const copy = async () => {
    if (!url) return;
    onShare?.('copy_link');
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt('Copy this link', url);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const saveStory = async () => {
    if (!story) return;
    onShare?.('story');
    setBusy(true);
    try {
      const blob = await (await fetch(story.src)).blob();
      const file = new File([blob], story.fileName, { type: blob.type || 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: story.text });
        return;
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = story.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') window.open(story.src, '_blank', 'noopener');
    } finally {
      setBusy(false);
    }
  };

  const tile =
    'flex min-h-[64px] flex-1 flex-col items-center justify-center gap-1 rounded-2xl border border-[#2A2D36] bg-[#16181E] px-1 text-xs font-semibold text-[#F4F1EC] transition-colors hover:border-[#3A3E4A] disabled:opacity-60';

  return (
    <div className="flex gap-2">
      {url && (
        <button type="button" onClick={copy} className={tile}>
          {copied ? <Check className="h-5 w-5 text-[#7FE0A0]" /> : <Link2 className="h-5 w-5" />}
          {copied ? 'Copied' : 'Copy link'}
        </button>
      )}
      {mapsUrl && (
        <a href={mapsUrl} target="_blank" rel="noopener noreferrer" onClick={() => onShare?.('map')} className={tile}>
          <MapPin className="h-5 w-5 text-[#E8675D]" /> Map
        </a>
      )}
      {calendar && (
        <button
          type="button"
          onClick={() => {
            onShare?.('calendar');
            downloadIcs(calendar, calendar.fileName);
          }}
          className={tile}
        >
          <CalendarPlus className="h-5 w-5" /> Calendar
        </button>
      )}
      {story && (
        <button type="button" onClick={saveStory} disabled={busy} className={tile}>
          <ImageIcon className="h-5 w-5" /> {busy ? 'Wait…' : 'Story pic'}
        </button>
      )}
    </div>
  );
}
