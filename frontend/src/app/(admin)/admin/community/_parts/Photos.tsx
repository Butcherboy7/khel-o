'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Eye, EyeOff, ImagePlus, Star } from 'lucide-react';
import {
  addCommunityPhoto,
  deleteCommunityPhoto,
  editCommunityPhoto,
  getCommunityPhotos,
  orderCommunityPhotos,
  uploadCommunityPhoto,
  type CommunityPhotoRow,
} from '@/lib/api/admin';
import { cn } from '@/lib/cn';
import { ConfirmButton, ErrorLine, Panel, SmallButton, field } from './ui';

export function Photos() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'community-photos'], queryFn: getCommunityPhotos });
  const [rows, setRows] = useState<CommunityPhotoRow[]>([]);
  const [link, setLink] = useState('');
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const [uploadError, setUploadError] = useState<unknown>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  useEffect(() => setRows(data ?? []), [data]);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['admin', 'community-photos'] });
    qc.invalidateQueries({ queryKey: ['community-week'] });
  };

  const order = useMutation({ mutationFn: (ids: string[]) => orderCommunityPhotos(ids), onSuccess: refresh });
  const edit = useMutation({ mutationFn: (v: { id: string; body: { caption?: string; hidden?: boolean; isHero?: boolean } }) => editCommunityPhoto(v.id, v.body), onSuccess: refresh });
  const remove = useMutation({ mutationFn: deleteCommunityPhoto, onSuccess: refresh });
  const addLink = useMutation({ mutationFn: () => addCommunityPhoto(link.trim()), onSuccess: () => { setLink(''); refresh(); } });

  const move = (from: number, to: number) => {
    if (to < 0 || to >= rows.length || from === to) return;
    const next = [...rows];
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it);
    setRows(next);
    order.mutate(next.map((r) => r.id));
  };

  const uploadMany = async (files: FileList) => {
    setUploadError(null);
    const list = Array.from(files);
    setUploading({ done: 0, total: list.length });
    for (let n = 0; n < list.length; n++) {
      try {
        await uploadCommunityPhoto(list[n]);
      } catch (e) {
        setUploadError(e);
      }
      setUploading({ done: n + 1, total: list.length });
    }
    setUploading(null);
    refresh();
  };

  const shown = rows.filter((r) => !r.hidden).length;
  return (
    <div className="flex flex-col gap-4">
      <Panel
        title="Add photos"
        hint="JPG, PNG or WebP. You can pick several at once. New photos go to the end of the wall."
      >
        <div className="flex flex-wrap items-center gap-2">
          <label className={cn('inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl bg-primary px-4 font-bold text-white', uploading && 'opacity-70')}>
            <ImagePlus className="h-4 w-4" aria-hidden />
            {uploading ? `Uploading ${uploading.done} of ${uploading.total}…` : 'Upload photos'}
            <input type="file" multiple accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={!!uploading} onChange={(e) => e.target.files?.length && uploadMany(e.target.files)} />
          </label>
          <span className="text-caption text-text-secondary">or add by link</span>
          <input className={cn(field, 'max-w-sm flex-1')} value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://… or /community/xyz.webp" />
          <SmallButton onClick={() => addLink.mutate()} disabled={link.trim().length < 2 || addLink.isPending}>Add</SmallButton>
        </div>
        <ErrorLine error={uploadError || addLink.error} />
      </Panel>

      <Panel
        title={`The wall · ${shown} showing${rows.length > shown ? `, ${rows.length - shown} hidden` : ''}`}
        hint="Drag to reorder (or use the arrows). The star marks the big photo at the top of the page. Captions save when you leave the box."
      >
        {isLoading && <div className="h-40 animate-pulse rounded-2xl bg-surface" />}
        {!isLoading && rows.length === 0 && <p className="text-body text-text-secondary">No photos yet. Upload some above.</p>}
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {rows.map((ph, i) => (
            <li
              key={ph.id}
              draggable
              onDragStart={() => setDragId(ph.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                const from = rows.findIndex((r) => r.id === dragId);
                if (from >= 0) move(from, i);
                setDragId(null);
              }}
              className={cn('flex flex-col overflow-hidden rounded-2xl border bg-card', ph.isHero ? 'border-primary' : 'border-border', dragId === ph.id && 'opacity-50', ph.hidden && 'opacity-60')}
            >
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element -- admin thumbnail */}
                <img src={ph.url} alt={ph.caption ?? ''} className="aspect-[4/3] w-full cursor-grab object-cover" />
                <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-bold tabular-nums text-white">{i + 1}</span>
                {ph.isHero && <span className="absolute right-2 top-2 rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-white">Top photo</span>}
                {ph.hidden && <span className="absolute bottom-2 left-2 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-bold text-white">Hidden</span>}
              </div>
              <div className="flex flex-col gap-2 p-2">
                <input
                  className={cn(field, 'min-h-[38px] text-caption')}
                  defaultValue={ph.caption ?? ''}
                  maxLength={120}
                  placeholder="Caption"
                  aria-label="Caption"
                  onBlur={(e) => e.target.value !== (ph.caption ?? '') && edit.mutate({ id: ph.id, body: { caption: e.target.value } })}
                />
                <div className="flex flex-wrap items-center gap-1">
                  <SmallButton onClick={() => move(i, i - 1)} disabled={i === 0} title="Move left"><ArrowLeft className="h-3.5 w-3.5" aria-hidden /></SmallButton>
                  <SmallButton onClick={() => move(i, i + 1)} disabled={i === rows.length - 1} title="Move right"><ArrowRight className="h-3.5 w-3.5" aria-hidden /></SmallButton>
                  <SmallButton onClick={() => edit.mutate({ id: ph.id, body: { isHero: true } })} active={ph.isHero} disabled={ph.isHero} title="Make it the top photo"><Star className="h-3.5 w-3.5" aria-hidden /></SmallButton>
                  <SmallButton onClick={() => edit.mutate({ id: ph.id, body: { hidden: !ph.hidden } })} title={ph.hidden ? 'Show on the page' : 'Hide from the page'}>
                    {ph.hidden ? <Eye className="h-3.5 w-3.5" aria-hidden /> : <EyeOff className="h-3.5 w-3.5" aria-hidden />}
                  </SmallButton>
                  <ConfirmButton onConfirm={() => remove.mutate(ph.id)} armed="Delete?" className="ml-auto">Delete</ConfirmButton>
                </div>
              </div>
            </li>
          ))}
        </ul>
        <ErrorLine error={order.error || edit.error || remove.error} />
      </Panel>
    </div>
  );
}
