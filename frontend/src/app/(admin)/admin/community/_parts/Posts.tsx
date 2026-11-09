'use client';

import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Eye, EyeOff, ImagePlus, Pin, PinOff, Pencil } from 'lucide-react';
import {
  createCommunityPost,
  deleteCommunityPost,
  getCommunityPhotos,
  getCommunityPosts,
  updateCommunityPost,
  uploadCommunityImage,
  type AdminCommunityPost,
  type CommunityPostBody,
} from '@/lib/api/admin';
import { Button } from '@/components/ui';
import { cn } from '@/lib/cn';
import { ConfirmButton, ErrorLine, Panel, SmallButton, StateBadge, field, labelText, whenTime } from './ui';

type Form = { headline: string; line: string; imageUrl: string; buttonLabel: string; buttonUrl: string; pinned: boolean; hidden: boolean; showFrom: string; showUntil: string };
const EMPTY: Form = { headline: '', line: '', imageUrl: '', buttonLabel: '', buttonUrl: '', pinned: false, hidden: false, showFrom: '', showUntil: '' };

/** datetime-local (India time) <-> ISO */
const toLocal = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + 330 * 60_000).toISOString().slice(0, 16) : '');
const fromLocal = (v: string) => (v ? `${v}:00+05:30` : null);

const BUTTON_PRESETS: [string, string][] = [
  ['Vote now', '/community#vote'],
  ['See the photos', '/community/recap'],
  ['Book a session', '/browse'],
  ['Next challenge', '/community#next'],
];

export function Posts() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['admin', 'community-posts'], queryFn: getCommunityPosts });
  const [form, setForm] = useState<Form>(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const top = useRef<HTMLDivElement>(null);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['admin'] });
    qc.invalidateQueries({ queryKey: ['community-week'] });
  };

  const body = (f: Form): CommunityPostBody => ({
    headline: f.headline.trim(),
    line: f.line.trim() || undefined,
    imageUrl: f.imageUrl.trim() || undefined,
    buttonLabel: f.buttonLabel.trim() || undefined,
    buttonUrl: f.buttonUrl.trim() || undefined,
    pinned: f.pinned,
    hidden: f.hidden,
    showFrom: fromLocal(f.showFrom),
    showUntil: fromLocal(f.showUntil),
  });
  const save = useMutation({
    mutationFn: async (): Promise<unknown> => (editing ? updateCommunityPost(editing, body(form)) : createCommunityPost(body(form))),
    onSuccess: () => {
      setForm(EMPTY);
      setEditing(null);
      refresh();
    },
  });
  // Quick actions on a row keep everything else about the post the same.
  const quick = useMutation({
    mutationFn: ({ p, change }: { p: AdminCommunityPost; change: Partial<CommunityPostBody> }) =>
      updateCommunityPost(p.id, {
        headline: p.headline, line: p.line ?? undefined, imageUrl: p.imageUrl ?? undefined, buttonLabel: p.buttonLabel ?? undefined,
        buttonUrl: p.buttonUrl ?? undefined, pinned: p.pinned, hidden: p.hidden, showFrom: p.showFrom, showUntil: p.showUntil, ...change,
      }),
    onSuccess: refresh,
  });
  const remove = useMutation({ mutationFn: deleteCommunityPost, onSuccess: refresh });

  const startEdit = (p: AdminCommunityPost) => {
    setEditing(p.id);
    setForm({
      headline: p.headline, line: p.line ?? '', imageUrl: p.imageUrl ?? '', buttonLabel: p.buttonLabel ?? '', buttonUrl: p.buttonUrl ?? '',
      pinned: p.pinned, hidden: p.hidden, showFrom: toLocal(p.showFrom), showUntil: toLocal(p.showUntil),
    });
    top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="flex flex-col gap-4">
      <div ref={top} className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <Panel
          title={editing ? 'Edit post' : 'New post'}
          hint="Shows in the This week tab. The pinned post stays on top; otherwise the newest live post is on top and the next 3 show under it."
          action={editing ? <SmallButton onClick={() => { setEditing(null); setForm(EMPTY); }}>Cancel edit</SmallButton> : undefined}
        >
          <label className={labelText}>Headline
            <input className={field} value={form.headline} maxLength={120} onChange={(e) => setForm({ ...form, headline: e.target.value })} placeholder="e.g. Challenge #02 is Street Fighter 6" />
          </label>
          <label className={labelText}>Text under it (optional)
            <textarea className={cn(field, 'min-h-[72px] py-2')} value={form.line} maxLength={200} onChange={(e) => setForm({ ...form, line: e.target.value })} placeholder="One or two short lines" />
          </label>
          <PhotoPicker value={form.imageUrl} onChange={(imageUrl) => setForm({ ...form, imageUrl })} />
          <div className="grid gap-2 sm:grid-cols-2">
            <label className={labelText}>Button text (optional)
              <input className={field} value={form.buttonLabel} maxLength={40} onChange={(e) => setForm({ ...form, buttonLabel: e.target.value })} placeholder="e.g. Vote now" />
            </label>
            <label className={labelText}>Button link
              <input className={field} value={form.buttonUrl} onChange={(e) => setForm({ ...form, buttonUrl: e.target.value })} placeholder="/community#vote or https://…" />
            </label>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {BUTTON_PRESETS.map(([l, u]) => (
              <button key={u} type="button" onClick={() => setForm({ ...form, buttonLabel: l, buttonUrl: u })} className="rounded-full border border-border px-2.5 py-1 text-[11px] font-bold text-text-secondary hover:border-primary/60">
                {l}
              </button>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className={labelText}>Show from (optional)
              <input type="datetime-local" className={field} value={form.showFrom} onChange={(e) => setForm({ ...form, showFrom: e.target.value })} />
            </label>
            <label className={labelText}>Show until (optional)
              <input type="datetime-local" className={field} value={form.showUntil} onChange={(e) => setForm({ ...form, showUntil: e.target.value })} />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <SmallButton active={form.pinned} onClick={() => setForm({ ...form, pinned: !form.pinned })}><Pin className="h-3.5 w-3.5" aria-hidden /> {form.pinned ? 'Pinned on top' : 'Pin on top'}</SmallButton>
            <SmallButton active={form.hidden} onClick={() => setForm({ ...form, hidden: !form.hidden })}><EyeOff className="h-3.5 w-3.5" aria-hidden /> {form.hidden ? 'Saved as hidden' : 'Save as hidden'}</SmallButton>
          </div>
          <Button onClick={() => save.mutate()} disabled={save.isPending || form.headline.trim().length < 3}>
            {save.isPending ? 'Saving…' : editing ? 'Save changes' : form.hidden ? 'Save hidden' : 'Publish'}
          </Button>
          <ErrorLine error={save.error} />
        </Panel>
        <Panel title="Preview" hint="How it looks on the page, on a phone.">
          <PostPreview f={form} />
        </Panel>
      </div>

      <Panel title="All posts" hint="Live = visitors see it now. The one marked On top is what the This week tab opens with.">
        {!data?.posts.length && <p className="text-body text-text-secondary">No posts yet. Until there is one, the page shows the Tekken #01 recap card.</p>}
        <ul className="flex flex-col divide-y divide-border">
          {data?.posts.map((p) => (
            <li key={p.id} className="flex flex-col gap-2 py-3 md:flex-row md:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                {p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail
                  <img src={p.imageUrl} alt="" className="h-12 w-16 flex-shrink-0 rounded-lg object-cover" />
                ) : (
                  <span className="h-12 w-16 flex-shrink-0 rounded-lg bg-surface" />
                )}
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate font-heading text-body-emphasis font-bold text-text-primary">{p.headline}</span>
                    <StateBadge state={p.state} />
                    {data.onTopId === p.id && <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-white">On top</span>}
                    {p.pinned && <Pin className="h-3.5 w-3.5 text-primary" aria-label="Pinned" />}
                  </p>
                  <p className="text-caption text-text-secondary">
                    Posted {whenTime(p.createdAt)}
                    {p.showFrom ? ` · from ${whenTime(p.showFrom)}` : ''}
                    {p.showUntil ? ` · until ${whenTime(p.showUntil)}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <SmallButton onClick={() => startEdit(p)} title="Edit"><Pencil className="h-3.5 w-3.5" aria-hidden /> Edit</SmallButton>
                <SmallButton onClick={() => quick.mutate({ p, change: { pinned: !p.pinned } })} disabled={quick.isPending}>
                  {p.pinned ? <><PinOff className="h-3.5 w-3.5" aria-hidden /> Unpin</> : <><Pin className="h-3.5 w-3.5" aria-hidden /> Pin on top</>}
                </SmallButton>
                <SmallButton onClick={() => quick.mutate({ p, change: { hidden: !p.hidden } })} disabled={quick.isPending}>
                  {p.hidden ? <><Eye className="h-3.5 w-3.5" aria-hidden /> Show</> : <><EyeOff className="h-3.5 w-3.5" aria-hidden /> Hide</>}
                </SmallButton>
                <ConfirmButton onConfirm={() => remove.mutate(p.id)} armed="Tap again to delete">Delete</ConfirmButton>
              </div>
            </li>
          ))}
        </ul>
        <ErrorLine error={quick.error || remove.error} />
      </Panel>
    </div>
  );
}

function PhotoPicker({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const { data: wall } = useQuery({ queryKey: ['admin', 'community-photos'], queryFn: getCommunityPhotos });
  const [open, setOpen] = useState(false);
  const upload = useMutation({
    mutationFn: (f: File) => uploadCommunityImage(f),
    onSuccess: (url) => onChange(url),
  });
  return (
    <div className="flex flex-col gap-2">
      <span className={labelText}>Photo (optional)</span>
      <div className="flex flex-wrap items-center gap-2">
        {value && (
          // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail
          <img src={value} alt="" className="h-14 w-20 rounded-lg object-cover" />
        )}
        <label className="inline-flex min-h-[36px] cursor-pointer items-center gap-1.5 rounded-full border border-border px-3 text-caption font-bold text-text-primary hover:border-primary/60">
          <ImagePlus className="h-3.5 w-3.5" aria-hidden /> {upload.isPending ? 'Uploading…' : 'Upload from phone'}
          <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => e.target.files?.[0] && upload.mutate(e.target.files[0])} />
        </label>
        <SmallButton onClick={() => setOpen(!open)} active={open}>Pick from the wall</SmallButton>
        {value && <SmallButton onClick={() => onChange('')}>Remove photo</SmallButton>}
      </div>
      {open && (
        <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
          {wall?.map((ph) => (
            <button key={ph.id} type="button" onClick={() => { onChange(ph.url); setOpen(false); }} className={cn('overflow-hidden rounded-lg border-2', value === ph.url ? 'border-primary' : 'border-transparent')}>
              {/* eslint-disable-next-line @next/next/no-img-element -- admin thumbnail */}
              <img src={ph.url} alt={ph.caption ?? ''} className="aspect-square w-full object-cover" />
            </button>
          ))}
        </div>
      )}
      <ErrorLine error={upload.error} />
    </div>
  );
}

function PostPreview({ f }: { f: Form }) {
  return (
    <div className="mx-auto w-full max-w-[360px] overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      {f.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- preview
        <img src={f.imageUrl} alt="" className="h-40 w-full object-cover" />
      )}
      <div className="flex flex-col gap-1 p-4">
        <p className="text-[10.5px] font-extrabold uppercase tracking-wider text-error">{f.pinned ? 'Pinned · ' : ''}Weekly post</p>
        <p className="font-heading text-h3 font-bold leading-tight text-text-primary">{f.headline || 'Your headline'}</p>
        {f.line && <p className="text-body text-text-secondary">{f.line}</p>}
        {f.buttonLabel && (
          <span className="mt-2 inline-flex min-h-[44px] items-center gap-1.5 self-start rounded-full bg-primary px-5 text-caption font-bold text-white">
            {f.buttonLabel} <ArrowRight className="h-4 w-4" aria-hidden />
          </span>
        )}
      </div>
    </div>
  );
}
