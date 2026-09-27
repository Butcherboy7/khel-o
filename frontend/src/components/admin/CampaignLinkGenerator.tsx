'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronDown, Copy, Download, Link2 } from 'lucide-react';
import { cafePath, listCafes } from '@/lib/api/cafes';
import { cn } from '@/lib/cn';

const SITE = 'https://khel-o.com';

/** Where the link will be posted. Picks sensible source/medium, still editable. */
const PLACEMENTS = [
  { key: 'meta_ad', label: 'Meta / Instagram ad', source: 'meta', medium: 'paid_social', hint: 'Paste as the website link when you boost or in Ads Manager.' },
  { key: 'reel', label: 'Reel', source: 'instagram', medium: 'reel', hint: 'Organic reel: put it in the caption or pinned comment.' },
  { key: 'story', label: 'Story', source: 'instagram', medium: 'story', hint: 'Use as the link sticker on this story.' },
  { key: 'bio', label: 'Bio', source: 'instagram', medium: 'bio', hint: 'Profile link. Keep one bio link per month so it stays comparable.' },
  { key: 'whatsapp', label: 'WhatsApp', source: 'whatsapp', medium: 'message', hint: 'For a group or broadcast message.' },
  { key: 'qr', label: 'QR', source: 'offline', medium: 'qr', hint: 'Print it. Name the spot in "Post / ad", e.g. dg-counter.' },
  { key: 'nfc', label: 'NFC', source: 'offline', medium: 'nfc', hint: 'Write this URL to the tag with any NFC writer app.' },
  { key: 'other', label: 'Other', source: '', medium: '', hint: 'Anything else: fill source and medium yourself.' },
] as const;

type PlacementKey = (typeof PLACEMENTS)[number]['key'];

const slug = (v: string) =>
  v.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60);

/**
 * One generator for every tracked link we post: ads, reels, stories, bio,
 * WhatsApp, QR, NFC. Output is a plain khel-o.com URL with utm_* tags, which
 * the site already reads on any page it lands on.
 */
export function CampaignLinkGenerator({ collapsible = false }: { collapsible?: boolean }) {
  const [open, setOpen] = useState(!collapsible);
  const [placement, setPlacement] = useState<PlacementKey>('meta_ad');
  const preset = PLACEMENTS.find((p) => p.key === placement)!;
  const [source, setSource] = useState<string>(preset.source);
  const [medium, setMedium] = useState<string>(preset.medium);
  const [campaign, setCampaign] = useState('');
  const [content, setContent] = useState('');
  const [destKind, setDestKind] = useState<'home' | 'cafe' | 'path'>('home');
  const [cafeKey, setCafeKey] = useState('');
  const [path, setPath] = useState('/');
  const [copied, setCopied] = useState(false);

  const { data: cafes } = useQuery({
    queryKey: ['admin', 'link-generator', 'cafes'],
    queryFn: () => listCafes({ limit: 100 }),
    enabled: destKind === 'cafe',
    staleTime: 5 * 60_000,
  });

  const pick = (key: PlacementKey) => {
    const p = PLACEMENTS.find((x) => x.key === key)!;
    setPlacement(key);
    setSource(p.source);
    setMedium(p.medium);
  };

  const destination =
    destKind === 'cafe' ? cafeKey : destKind === 'path' ? (path.startsWith('/') ? path : `/${path}`) : '/';

  const url = useMemo(() => {
    if (!source.trim() || (destKind === 'cafe' && !cafeKey)) return '';
    const u = new URL(destination || '/', SITE);
    u.searchParams.set('utm_source', slug(source));
    if (medium.trim()) u.searchParams.set('utm_medium', slug(medium));
    if (campaign.trim()) u.searchParams.set('utm_campaign', slug(campaign));
    if (content.trim()) u.searchParams.set('utm_content', slug(content));
    return u.toString();
  }, [source, medium, campaign, content, destination, destKind, cafeKey]);

  const showQr = placement === 'qr' || placement === 'nfc' || placement === 'other';
  const qr = (size: number, format: 'png' | 'svg' = 'png') =>
    `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=12&format=${format}&data=${encodeURIComponent(url)}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* the URL stays selectable below */
    }
  };

  const field = 'min-h-input w-full rounded-lg border border-border bg-card px-3 text-body text-text-primary';
  const label = 'flex flex-col gap-1 text-caption font-semibold text-text-primary';

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4">
      <button
        type="button"
        onClick={() => collapsible && setOpen((o) => !o)}
        aria-expanded={open}
        className={cn('flex items-center gap-3 text-left', !collapsible && 'cursor-default')}
      >
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <Link2 className="h-5 w-5 text-primary" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-heading text-h3 text-text-primary">Make a trackable link</span>
          <span className="block text-caption text-text-secondary">
            For an ad, reel, story, bio, WhatsApp, QR poster or NFC tag, so you can see what each one brings in.
          </span>
        </span>
        {collapsible && (
          <ChevronDown className={cn('h-5 w-5 flex-shrink-0 text-text-secondary transition-transform', open && 'rotate-180')} aria-hidden />
        )}
      </button>
      {open && (
      <>

      <div role="radiogroup" aria-label="Where will you post it?" className="flex flex-wrap gap-1.5">
        {PLACEMENTS.map((p) => (
          <button
            key={p.key}
            type="button"
            role="radio"
            aria-checked={placement === p.key}
            onClick={() => pick(p.key)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-caption font-semibold transition-colors',
              placement === p.key
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-text-secondary hover:text-text-primary'
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      <p className="-mt-2 text-caption text-text-secondary">{preset.hint}</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>
          Campaign
          <input className={cn(field, 'font-normal')} value={campaign} onChange={(e) => setCampaign(e.target.value)} placeholder="e.g. oct-boost" />
        </label>
        <label className={label}>
          Post / ad
          <input className={cn(field, 'font-normal')} value={content} onChange={(e) => setContent(e.target.value)} placeholder="e.g. reel-ps5-coop" />
        </label>
        <label className={label}>
          Source
          <input className={cn(field, 'font-normal')} value={source} onChange={(e) => setSource(e.target.value)} placeholder="e.g. instagram" />
        </label>
        <label className={label}>
          Medium
          <input className={cn(field, 'font-normal')} value={medium} onChange={(e) => setMedium(e.target.value)} placeholder="e.g. story" />
        </label>
        <label className={label}>
          Opens
          <select className={cn(field, 'font-normal')} value={destKind} onChange={(e) => setDestKind(e.target.value as typeof destKind)}>
            <option value="home">Homepage</option>
            <option value="cafe">A café page</option>
            <option value="path">Other page (path)</option>
          </select>
        </label>
        {destKind === 'cafe' && (
          <label className={label}>
            Café
            <select className={cn(field, 'font-normal')} value={cafeKey} onChange={(e) => setCafeKey(e.target.value)}>
              <option value="">{cafes ? 'Pick a café' : 'Loading…'}</option>
              {(cafes?.items ?? []).map((c) => (
                <option key={c.id} value={cafePath(c)}>
                  {c.name}
                  {c.city ? ` · ${c.city}` : ''}
                </option>
              ))}
            </select>
          </label>
        )}
        {destKind === 'path' && (
          <label className={label}>
            Path
            <input className={cn(field, 'font-normal')} value={path} onChange={(e) => setPath(e.target.value)} placeholder="/cafes/hyderabad/snooker" />
          </label>
        )}
      </div>

      {url ? (
        <div className="flex flex-col gap-3 rounded-xl bg-surface p-3">
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 select-all break-all text-[12px] text-text-primary">{url}</code>
            <button
              type="button"
              onClick={copy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-caption font-semibold text-text-primary"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          {showQr && (
            <div className="flex flex-wrap items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr(180)} alt="QR code for this link" width={180} height={180} className="rounded-lg bg-white" />
              <div className="flex flex-col gap-2 text-caption">
                <a href={qr(1000)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-primary">
                  <Download className="h-3.5 w-3.5" /> PNG for print
                </a>
                <a href={qr(1000, 'svg')} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-primary">
                  <Download className="h-3.5 w-3.5" /> SVG (any size)
                </a>
                <span className="text-text-secondary">Scan it once with your phone before printing.</span>
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="text-caption text-text-secondary">Add a source{destKind === 'cafe' ? ' and pick a café' : ''} to get the link.</p>
      )}
      <p className="text-caption text-text-secondary">
        Visits show up under Ad campaigns by source and campaign, and each post/ad gets its own row. Testing a link
        yourself? Open <code>khel-o.com/?internal=1</code> on that phone first so your visits aren&apos;t counted.
      </p>
      </>
      )}
    </section>
  );
}
