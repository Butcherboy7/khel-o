'use client';

import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Clock, Search, ImagePlus, X, KeyRound, Copy, Check, ExternalLink, MapPin, Users } from 'lucide-react';
import {
  listBookingSoonCafes,
  addBookingSoonPhoto,
  removeBookingSoonPhoto,
  issueOwnerLogin,
  type BookingSoonCafe,
} from '@/lib/api/admin';
import { PHOTO_CATEGORIES } from '@/constants/photoCategories';
import { Button, Card, CardContent, Badge, Modal, ErrorState, EmptyState, PageSpinner } from '@/components/ui';

type Filter = 'all' | 'no-photos' | 'photos';

// The "Booking soon" cafés we listed from public info: give them real photos so
// players recognise them, and get into the owner account when a café says yes.
export default function AdminBookingSoonPage() {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [loginTarget, setLoginTarget] = useState<BookingSoonCafe | null>(null);
  const [creds, setCreds] = useState<{ cafe: string; email: string; password: string } | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'booking-soon'],
    queryFn: () => listBookingSoonCafes(),
    staleTime: 30_000,
  });

  const loginMut = useMutation({
    mutationFn: (cafe: BookingSoonCafe) => issueOwnerLogin(cafe.id, `Onboarding ${cafe.name}`),
    onSuccess: (res, cafe) => {
      setLoginTarget(null);
      setCreds({ cafe: cafe.name, email: res.email, password: res.temporaryPassword });
    },
  });

  if (isLoading) return <PageSpinner label="Loading Booking soon cafés" />;
  if (isError) {
    return (
      <ErrorState
        title="Couldn't load Booking soon cafés"
        message={(error as Error)?.message || 'Failed to fetch the list.'}
        onRetry={() => refetch()}
      />
    );
  }

  const all = data ?? [];
  const needle = q.trim().toLowerCase();
  const rows = all
    .filter((c) => !needle || [c.name, c.area, c.city].some((v) => (v ?? '').toLowerCase().includes(needle)))
    .filter((c) => (filter === 'all' ? true : filter === 'photos' ? c.photos.length > 0 : c.photos.length === 0));
  const withPhotos = all.filter((c) => c.photos.length > 0).length;

  const chip = (key: Filter, label: string) => (
    <button
      key={key}
      onClick={() => setFilter(key)}
      className={`rounded-full border px-3 py-1 text-caption font-semibold transition-colors ${
        filter === key ? 'border-primary bg-primary/10 text-primary' : 'border-border text-text-secondary hover:bg-surface'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div>
        <h1 className="font-heading text-h1 text-text-primary flex items-center gap-2">
          <Clock className="h-6 w-6 text-primary" />
          Booking soon cafés
        </h1>
        <p className="text-body text-text-secondary mt-0.5">
          {all.length} cafés listed from public info · {withPhotos} with photos. Add photos so players recognise them, and
          get the owner login when a café agrees to come on board.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <label className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name or area"
            className="w-full h-10 pl-9 pr-3 rounded-xl border border-border bg-surface text-caption text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </label>
        <div className="flex gap-2 flex-wrap">
          {chip('all', `All (${all.length})`)}
          {chip('no-photos', `Needs photos (${all.length - withPhotos})`)}
          {chip('photos', `Has photos (${withPhotos})`)}
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="Nothing here" description="No Booking soon café matches this search." />
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((cafe) => (
            <CafeRow key={cafe.id} cafe={cafe} onLogin={() => setLoginTarget(cafe)} />
          ))}
        </div>
      )}

      <Modal isOpen={!!loginTarget} onClose={() => setLoginTarget(null)} title="Get owner login">
        <div className="flex flex-col gap-4">
          <p className="text-caption text-text-secondary">
            This makes a new password for <span className="font-semibold text-text-primary">{loginTarget?.name}</span>&apos;s
            owner account ({loginTarget?.ownerEmail}). Any password made earlier stops working. It&apos;s shown once and
            saved in the audit log as an action, never as text.
          </p>
          {loginMut.isError && (
            <p className="text-xs text-error">{(loginMut.error as Error)?.message ?? 'Failed to create a login.'}</p>
          )}
          <div className="flex items-center gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => setLoginTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              isLoading={loginMut.isPending}
              disabled={loginMut.isPending}
              onClick={() => loginTarget && loginMut.mutate(loginTarget)}
            >
              Create login
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!creds} onClose={() => setCreds(null)} title={`Owner login · ${creds?.cafe ?? ''}`}>
        {creds && <CredsView email={creds.email} password={creds.password} onDone={() => setCreds(null)} />}
      </Modal>
    </div>
  );
}

function CafeRow({ cafe, onLogin }: { cafe: BookingSoonCafe; onLogin: () => void }) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState('exterior');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin', 'booking-soon'] });

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setErr(null);
    try {
      const list = Array.from(files);
      for (let i = 0; i < list.length; i++) {
        setBusy(`Uploading ${i + 1} of ${list.length}…`);
        await addBookingSoonPhoto(cafe.id, list[i], category);
      }
    } catch (e) {
      setErr((e as Error)?.message || 'Upload failed.');
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = '';
      refresh();
    }
  };

  const remove = useMutation({
    mutationFn: (url: string) => removeBookingSoonPhoto(cafe.id, url),
    onSuccess: refresh,
    onError: (e) => setErr((e as Error)?.message || 'Could not remove the photo.'),
  });

  return (
    <Card elevation="resting" className="border border-border/80">
      <CardContent className="p-5 flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-heading text-body-emphasis font-bold text-text-primary">{cafe.name}</h3>
              {cafe.photos.length > 0 ? (
                <Badge variant="success" size="sm">{cafe.photos.length} photos</Badge>
              ) : (
                <Badge variant="warning" size="sm">No photos</Badge>
              )}
              {cafe.waitlistCount > 0 && (
                <Badge variant="primary" size="sm">
                  <Users className="h-3 w-3 mr-1 inline" />
                  {cafe.waitlistCount} waiting
                </Badge>
              )}
              {cafe.ownerHandedOver && <Badge variant="default" size="sm">Owner has the account</Badge>}
            </div>
            <p className="text-caption text-text-secondary">
              {[cafe.area, cafe.city].filter(Boolean).join(', ')} · {cafe.phone}
            </p>
            <div className="flex gap-3 mt-1 text-caption">
              {cafe.slug && (
                <a href={`/cafe/${cafe.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                  <ExternalLink className="h-3 w-3" /> Page
                </a>
              )}
              {cafe.googleMapsUrl && (
                <a href={cafe.googleMapsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                  <MapPin className="h-3 w-3" /> Maps
                </a>
              )}
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={onLogin}
            disabled={cafe.ownerHandedOver}
            title={cafe.ownerHandedOver ? 'The owner has this account; they use Forgot password' : undefined}
            className="gap-1.5 flex-shrink-0"
          >
            <KeyRound className="h-3.5 w-3.5" />
            Get owner login
          </Button>
        </div>

        {cafe.photos.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {cafe.photos.map((p) => (
              <div key={p.url} className="relative flex-shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={`${cafe.name} ${p.category}`} className="h-20 w-28 rounded-lg object-cover border border-border" />
                <button
                  onClick={() => remove.mutate(p.url)}
                  disabled={remove.isPending}
                  aria-label="Remove photo"
                  className="absolute top-1 right-1 rounded-full bg-black/60 p-0.5 text-white hover:bg-black/80"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="h-9 rounded-lg border border-border bg-surface px-2 text-caption text-text-primary"
            aria-label="Photo type"
          >
            {PHOTO_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={(e) => upload(e.target.files)}
          />
          <Button variant="secondary" size="sm" className="gap-1.5" disabled={!!busy} onClick={() => fileRef.current?.click()}>
            <ImagePlus className="h-3.5 w-3.5" />
            {busy ?? 'Add photos'}
          </Button>
          {err && <span className="text-xs text-error">{err}</span>}
        </div>
      </CardContent>
    </Card>
  );
}

function CredsView({ email, password, onDone }: { email: string; password: string; onDone: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };
  const field = (key: string, label: string, value: string) => (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-text-secondary">{label}</span>
      <div className="flex items-center gap-2">
        <code className="flex-1 h-10 px-3 rounded-xl border border-border bg-surface-hover text-caption font-mono text-text-primary flex items-center overflow-x-auto">
          {value}
        </code>
        <Button variant="secondary" size="sm" onClick={() => copy(key, value)} className="gap-1.5 flex-shrink-0">
          {copied === key ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied === key ? 'Copied' : 'Copy'}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <p className="text-caption text-text-secondary">
        Shown once. Close this and it can&apos;t be seen again (make a new one if needed).
      </p>
      {field('email', 'Email', email)}
      {field('password', 'Password', password)}
      <ol className="list-decimal pl-5 text-caption text-text-secondary flex flex-col gap-1">
        <li>Open an incognito window (so your admin login stays) and log in with these.</li>
        <li>Set up the café: pricing and setups, amenities, hours, photos.</li>
        <li>Back in admin, use Go Live on the café when it&apos;s ready.</li>
        <li>Handover: in the owner account, Profile → Change Email to the owner&apos;s real email.</li>
        <li>The owner then uses Forgot password on the login page. This password stops working.</li>
      </ol>
      <Button variant="primary" size="sm" onClick={onDone}>
        Done
      </Button>
    </div>
  );
}
