'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Eye, EyeOff, ExternalLink, ImagePlus, Loader2, X } from 'lucide-react';
import {
  adminAddReel, adminDeleteReel, adminEditReel, adminListReels, adminOrderReels, looksLikeReelLink, uploadReelCover,
  type AdminInstagramReel,
} from '@/lib/api/instagram';
import { InstagramReels } from '@/components/customer/InstagramReels';
import { ConfirmButton, ErrorLine, Panel, SmallButton, field, labelText } from '../community/_parts/ui';
import { cn } from '@/lib/cn';

const TAGS = ['GTA 6', 'Update', 'Vlog', 'Challenge', 'Café', 'Drop'];

/** Pick an image, upload it, hand back its link. Shows a 9:16 preview. */
function CoverPicker({ value, onChange, small }: { value: string | null; onChange: (url: string | null) => void; small?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const pick = async (f: File | undefined) => {
    if (!f) return;
    setError(null);
    setBusy(true);
    try {
      onChange(await uploadReelCover(f));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };
  return (
    <div className="flex flex-col gap-1">
      <div className={cn('relative aspect-[9/16] overflow-hidden rounded-xl border border-dashed border-border bg-surface', small ? 'w-[64px]' : 'w-[120px]')}>
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="Reel cover" className="h-full w-full object-cover" />
        ) : (
          <button type="button" onClick={() => input.current?.click()} className="flex h-full w-full flex-col items-center justify-center gap-1 px-1 text-center text-[11px] font-semibold text-text-secondary hover:text-primary">
            {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <ImagePlus className="h-5 w-5" aria-hidden />}
            {!small && (busy ? 'Uploading' : 'Add cover')}
          </button>
        )}
        {value && !busy && (
          <button type="button" onClick={() => onChange(null)} aria-label="Remove cover" className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white">
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
      </div>
      {value && !small && (
        <button type="button" onClick={() => input.current?.click()} className="self-start text-[11px] font-bold text-primary hover:underline">Change cover</button>
      )}
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      <ErrorLine error={error} />
    </div>
  );
}

function AddReel({ onAdded }: { onAdded: () => void }) {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [tag, setTag] = useState('');
  const [cover, setCover] = useState<string | null>(null);
  const add = useMutation({
    mutationFn: () => adminAddReel({ url: url.trim(), title: title.trim(), tag: tag.trim() || undefined, coverUrl: cover }),
    onSuccess: () => { setUrl(''); setTitle(''); setTag(''); setCover(null); onAdded(); },
  });
  const linkOk = looksLikeReelLink(url);
  const ready = linkOk && title.trim().length >= 2;
  return (
    <Panel
      title="Add a reel"
      hint="Paste the reel's link from Instagram (Share, then Copy link). Add a short title and the reel's cover. Instagram does not let us pull the cover ourselves, so take a screenshot of the reel and upload it."
    >
      <form
        className="flex flex-col gap-4 sm:flex-row sm:items-start"
        onSubmit={(e) => { e.preventDefault(); if (ready) add.mutate(); }}
      >
        <CoverPicker value={cover} onChange={setCover} />
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <label className={labelText}>
            Reel link
            <input className={field} inputMode="url" placeholder="https://www.instagram.com/reel/..." value={url} onChange={(e) => setUrl(e.target.value)} />
            {url.trim() && !linkOk && <span className="text-error">That is not a reel or post link from instagram.com.</span>}
          </label>
          <label className={labelText}>
            Title people see
            <input className={field} maxLength={80} placeholder="Day 12: we built the GTA 6 drop" value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <div className={labelText}>
            Tag (optional)
            <div className="flex flex-wrap gap-1.5">
              {TAGS.map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={tag === t}
                  onClick={() => setTag(tag === t ? '' : t)}
                  className={cn('min-h-[36px] rounded-full border px-3 text-caption font-bold', tag === t ? 'border-primary bg-primary text-white' : 'border-border bg-card text-text-primary')}
                >
                  {t}
                </button>
              ))}
              <input className={cn(field, 'min-h-[36px] w-32 rounded-full py-0 text-caption')} maxLength={24} placeholder="Or type one" value={TAGS.includes(tag) ? '' : tag} onChange={(e) => setTag(e.target.value)} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={!ready || add.isPending} className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-primary px-5 text-body font-bold text-white disabled:opacity-50">
              {add.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Put it on Explore and Community
            </button>
          </div>
          <ErrorLine error={add.error} />
        </div>
      </form>
    </Panel>
  );
}

function ReelRow({ r, i, count, onMove, onChanged }: { r: AdminInstagramReel; i: number; count: number; onMove: (from: number, to: number) => void; onChanged: () => void }) {
  const [title, setTitle] = useState(r.title);
  const [tag, setTag] = useState(r.tag ?? '');
  useEffect(() => { setTitle(r.title); setTag(r.tag ?? ''); }, [r.title, r.tag]);
  const edit = useMutation({ mutationFn: (body: Parameters<typeof adminEditReel>[1]) => adminEditReel(r.id, body), onSuccess: onChanged });
  const remove = useMutation({ mutationFn: () => adminDeleteReel(r.id), onSuccess: onChanged });
  const dirty = title.trim() !== r.title || tag.trim() !== (r.tag ?? '');
  return (
    <li className={cn('flex gap-3 py-3', r.hidden && 'opacity-60')}>
      <CoverPicker small value={r.coverUrl} onChange={(coverUrl) => edit.mutate({ coverUrl })} />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input aria-label="Title" className={cn(field, 'min-h-[40px] flex-1')} maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} />
          <input aria-label="Tag" className={cn(field, 'min-h-[40px] sm:w-36')} maxLength={24} placeholder="Tag" value={tag} onChange={(e) => setTag(e.target.value)} />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {dirty && (
            <button type="button" onClick={() => edit.mutate({ title: title.trim(), tag: tag.trim() })} className="inline-flex min-h-[36px] items-center rounded-full bg-primary px-3 text-caption font-bold text-white">Save</button>
          )}
          <SmallButton title="Move left (earlier)" disabled={i === 0} onClick={() => onMove(i, i - 1)}><ArrowUp className="h-4 w-4" aria-hidden /></SmallButton>
          <SmallButton title="Move right (later)" disabled={i === count - 1} onClick={() => onMove(i, i + 1)}><ArrowDown className="h-4 w-4" aria-hidden /></SmallButton>
          <SmallButton title={r.hidden ? 'Show it again' : 'Hide it'} active={r.hidden} onClick={() => edit.mutate({ hidden: !r.hidden })}>
            {r.hidden ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
          </SmallButton>
          <a href={r.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[36px] items-center gap-1 rounded-full border border-border px-3 text-caption font-bold text-text-secondary hover:text-primary">
            Open <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
          <ConfirmButton onConfirm={() => remove.mutate()} armed="Tap again to delete">Delete</ConfirmButton>
          {r.hidden && <span className="text-caption font-semibold text-text-secondary">Hidden from people</span>}
        </div>
        <ErrorLine error={edit.error || remove.error} />
      </div>
    </li>
  );
}

export default function AdminInstagramPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'instagram-reels'], queryFn: adminListReels });
  const [rows, setRows] = useState<AdminInstagramReel[]>([]);
  useEffect(() => setRows(data ?? []), [data]);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['admin', 'instagram-reels'] });
    qc.invalidateQueries({ queryKey: ['instagram-reels'] });
  };
  const order = useMutation({ mutationFn: adminOrderReels, onSuccess: refresh });
  const move = (from: number, to: number) => {
    if (to < 0 || to >= rows.length) return;
    const next = [...rows];
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it);
    setRows(next);
    order.mutate(next.map((r) => r.id));
  };
  const live = rows.filter((r) => !r.hidden).length;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <header>
        <h1 className="font-heading text-h1 font-bold text-text-primary">Instagram</h1>
        <p className="mt-1 max-w-prose text-body text-text-secondary">
          Every reel you add here shows on the Explore page and the Community page as &ldquo;This is us on Instagram&rdquo;, newest first, with a Follow button. Tapping a reel opens it on Instagram.
        </p>
      </header>

      <AddReel onAdded={refresh} />

      <Panel title="How people see it" hint="Live preview of the Explore and Community block. Hidden reels are left out.">
        <div className="overflow-hidden rounded-2xl bg-background p-4">
          <InstagramReels where="explore" />
        </div>
      </Panel>

      <Panel title={`Your reels (${live} showing${rows.length > live ? `, ${rows.length - live} hidden` : ''})`} hint="The first reel shows first. Reels from the last 7 days get a NEW badge and the Instagram ring.">
        {isLoading ? (
          <p className="text-body text-text-secondary">Loading...</p>
        ) : rows.length === 0 ? (
          <p className="text-body text-text-secondary">No reels yet. Until you add one, people see just the Follow card.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {rows.map((r, i) => <ReelRow key={r.id} r={r} i={i} count={rows.length} onMove={move} onChanged={refresh} />)}
          </ul>
        )}
        <ErrorLine error={order.error} />
      </Panel>
    </div>
  );
}
