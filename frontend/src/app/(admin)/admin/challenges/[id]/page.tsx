'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Download, ExternalLink, MessageCircle, Pencil, Projector, Search, UserMinus, UserX, ArrowUp, RotateCcw, FlaskConical, Check, BellRing,
  Swords, Gift,
} from 'lucide-react';
import {
  adminClearPractice, adminDownloadEntriesCsv, adminEntryAction, adminFillPractice, adminGetChallenge, adminReleaseSilent,
  type AdminChallengeDetail, type AdminEntry, type Challenge, type EntryAction,
} from '@/lib/api/challenges';
import { challengeDay, challengeTime, challengeTimeRange, whatsappLink } from '@/lib/challenge';
import { Button, Card, CardContent, ErrorState, Modal, PageSpinner } from '@/components/ui';
import { HostTour, HostTutorialButton, useHostTour } from '@/components/challenge/admin/HostTour';
import { CHALLENGE_PAGE_STEPS } from '@/components/challenge/admin/hostTourSteps';

type Tab = 'confirmed' | 'waitlist' | 'out' | 'all';
type MessageKind = 'confirmed' | 'waitlist' | 'movedUp' | 'coming';

const DEFAULT_MESSAGES: Record<MessageKind, string> = {
  confirmed:
    'Hi {name}! You’re in for {title} at {cafe} ({rank}). {day}, check-in {checkin} with the QR on your KHELO page, start {start}. Your page: {link}\nJoin the KHELO community for updates (optional): {community}\nCan’t make it? Tap “Can’t make it” on your page so someone else gets your spot.',
  waitlist:
    'Hi {name}! You’re #{number} on the waitlist for {title} at {cafe}. You can still come on {day}: if someone doesn’t show, the next waitlist player there plays. Your page: {link}',
  movedUp:
    'Good news {name}! A spot opened up and it’s yours: {title}, {day}, check-in {checkin} at {cafe}. Please tap “Yes, I’m coming” on your page: {link}',
  coming: 'Hi {name}! Are you coming to {title} on {day}? Tap Yes or No on your KHELO page: {link}',
};
const MESSAGE_LABEL: Record<MessageKind, string> = {
  confirmed: 'Confirmed players',
  waitlist: 'Waitlist players',
  movedUp: 'Moved up from the waitlist',
  coming: '“Are you coming?” reminder',
};

function fill(template: string, e: AdminEntry, c: Challenge): string {
  const link = `${window.location.origin}/challenge/${c.slug}/me`;
  return template
    .replace(/\{name\}/g, e.name.split(' ')[0])
    .replace(/\{title\}/g, c.title)
    .replace(/\{cafe\}/g, c.cafe.name)
    .replace(/\{day\}/g, challengeDay(c.startsAt))
    .replace(/\{start\}/g, challengeTime(c.startsAt))
    .replace(/\{checkin\}/g, `${challengeTime(c.checkinOpensAt)}–${challengeTime(c.checkinClosesAt)}`)
    .replace(/\{rank\}/g, e.status === 'confirmed' ? `spot #${e.rank}` : `waitlist #${e.rank}`)
    .replace(/\{number\}/g, String(e.rank ?? ''))
    .replace(/\{link\}/g, link)
    .replace(/\{community\}/g, c.communityUrl ?? '');
}

const ACTION_COPY: Partial<Record<EntryAction, { title: string; body: string; cta: string }>> = {
  withdraw: { title: 'Take them out?', body: 'Their spot goes to the next person on the waitlist.', cta: 'Take out' },
  no_show: { title: 'Mark as no-show?', body: 'Their spot goes to the next person on the waitlist.', cta: 'Mark no-show' },
};

export default function AdminChallengeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const key = ['admin', 'challenge', id];
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: key,
    queryFn: () => adminGetChallenge(id),
    refetchInterval: 20_000,
  });
  const [tab, setTab] = useState<Tab>('confirmed');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ entry: AdminEntry; action: EntryAction } | null>(null);
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [messages, setMessages] = useState(DEFAULT_MESSAGES);
  const storageKey = `khelo.challenge.messages.${id}`;

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) setMessages({ ...DEFAULT_MESSAGES, ...JSON.parse(saved) });
    } catch {
      /* the defaults are fine */
    }
  }, [storageKey]);
  const saveMessage = (kind: MessageKind, v: string) => {
    const next = { ...messages, [kind]: v };
    setMessages(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const update = (d: AdminChallengeDetail) => qc.setQueryData(key, d);

  const run = async (entry: AdminEntry, action: EntryAction) => {
    setBusy(`${entry.id}:${action}`);
    try {
      update(await adminEntryAction(id, entry.id, action));
    } catch (e) {
      setFlash((e as Error).message);
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  };

  const release = async () => {
    setBusy('release');
    try {
      const d = await adminReleaseSilent(id);
      update(d);
      setFlash(`Released ${d.released ?? 0}; moved up ${d.movedUp ?? 0}. Message the people who moved up.`);
    } catch (e) {
      setFlash((e as Error).message);
    } finally {
      setBusy(null);
      setReleaseOpen(false);
    }
  };

  const rows = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    return data.entries.filter((e) => {
      const inTab =
        tab === 'all' ||
        (tab === 'out' ? e.status === 'withdrawn' || e.status === 'no_show' : e.status === tab);
      const hit = !needle || [e.name, e.displayName ?? '', e.phone, e.mainCharacter ?? ''].some((v) => v.toLowerCase().includes(needle));
      return inTab && hit;
    });
  }, [data, tab, q]);

  const tour = useHostTour('challenge', Boolean(data));

  const practice = async (fill: boolean) => {
    setBusy(fill ? 'practice:fill' : 'practice:clear');
    setFlash(null);
    try {
      const d = await (fill ? adminFillPractice(id) : adminClearPractice(id));
      update(d);
      qc.invalidateQueries({ queryKey: ['admin', 'challenge', id, 'bracket'] });
      setFlash(
        fill
          ? `Added ${d.added ?? 0} practice players. Open Challenge day to check them in and run it.`
          : `Removed ${d.removed ?? 0} practice players, their matches and rewards. Sign-ups are open again.`,
      );
    } catch (e) {
      setFlash((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (isLoading) return <PageSpinner label="Loading the challenge" />;
  if (isError || !data) return <ErrorState message={(error as Error)?.message} onRetry={() => refetch()} />;

  const { challenge: c, stats } = data;
  const ev = (name: string) => stats.events[name]?.people ?? 0;
  const silent = stats.comingNoAnswer;
  const tabs: { id: Tab; label: string; n: number }[] = [
    { id: 'confirmed', label: 'Confirmed', n: data.entries.filter((e) => e.status === 'confirmed').length },
    { id: 'waitlist', label: 'Waitlist', n: data.entries.filter((e) => e.status === 'waitlist').length },
    { id: 'out', label: 'Out', n: data.entries.filter((e) => e.status === 'withdrawn' || e.status === 'no_show').length },
    { id: 'all', label: 'All', n: data.entries.length },
  ];

  const waMessage = (e: AdminEntry) => {
    const kind: MessageKind =
      e.status === 'confirmed' ? (e.promotedAt && !e.toldAt ? 'movedUp' : e.coming ? 'confirmed' : 'coming') : 'waitlist';
    return whatsappLink(e.phone, fill(messages[kind], e, c));
  };

  return (
    <div className="flex flex-col gap-5 pb-12">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Link href="/admin/challenges" className="text-caption font-semibold text-text-secondary hover:text-text-primary">← Challenges</Link>
          <h1 className="mt-1 font-heading text-h1 text-text-primary">{c.title}</h1>
          <p className="mt-0.5 text-body text-text-secondary">
            <span className="font-semibold capitalize text-text-primary">{c.status}</span> · {c.cafe.name} · {challengeDay(c.startsAt)},{' '}
            {challengeTimeRange(c.startsAt, c.endsAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <HostTutorialButton onClick={tour.start} />
          <Link href={`/admin/challenges/${c.id}/day`} data-host-tour="day-link" className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-3 text-caption font-semibold text-white hover:bg-primary/90">
            <Swords className="h-4 w-4" /> Challenge day
          </Link>
          <Link href={`/admin/challenges/${c.id}/rewards`} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-caption font-semibold text-text-primary hover:bg-surface">
            <Gift className="h-4 w-4" /> Rewards
          </Link>
          <a href={`/challenge/${c.slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-caption font-semibold text-text-primary hover:bg-surface">
            <ExternalLink className="h-4 w-4" /> Public page
          </a>
          <a href={`/challenge/${c.slug}/rules?projector=1`} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-caption font-semibold text-text-primary hover:bg-surface">
            <Projector className="h-4 w-4" /> Rules on projector
          </a>
          <Link href={`/admin/challenges/${c.id}/edit`} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-caption font-semibold text-text-primary hover:bg-surface">
            <Pencil className="h-4 w-4" /> Edit
          </Link>
          <Button variant="secondary" size="sm" onClick={() => adminDownloadEntriesCsv(c.id, c.slug)}>
            <Download className="h-4 w-4" /> CSV
          </Button>
        </div>
      </div>

      {flash && (
        <button type="button" onClick={() => setFlash(null)} className="rounded-xl bg-primary/10 px-3 py-2 text-left text-caption text-text-primary">
          {flash} <span className="text-text-secondary">(tap to hide)</span>
        </button>
      )}

      {data.practiceAllowed && (
        <Card className="border-dashed border-primary/40" data-host-tour="practice">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="flex items-center gap-2 font-semibold text-text-primary">
                <FlaskConical className="h-4 w-4 text-primary" /> Practice run (dev only)
              </p>
              <p className="text-caption text-text-secondary">
                {data.practicePlayers > 0
                  ? `${data.practicePlayers} practice players are in. Run the day, then clear them to start again.`
                  : 'Fill the spots with made-up players (plus 2 on the waitlist) to rehearse the whole day.'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" size="sm" isLoading={busy === 'practice:fill'} onClick={() => practice(true)}>
                Fill with practice players
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={data.practicePlayers === 0}
                isLoading={busy === 'practice:clear'}
                onClick={() => practice(false)}
              >
                Clear practice players
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* The numbers that matter, real people only (test sign-ups left out) */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Confirmed" value={`${stats.confirmed}/${c.capacity}`} hint={`${stats.filmingOk} OK to film`} />
        <Stat label="Waitlist" value={stats.waitlist} />
        <Stat label="Said “coming”" value={stats.comingYes} hint={`${silent} not answered yet`} />
        <Stat label="Moved up, not told" value={stats.movedUpNotTold} warn={stats.movedUpNotTold > 0} />
        <Stat label="Page visitors" value={ev('challenge_page_view')} />
        <Stat label="Tapped sign up" value={ev('challenge_signup_started')} />
        <Stat label="Community taps" value={ev('challenge_community_click')} />
        <Stat label="Dropped out" value={stats.withdrawn + stats.noShow} />
      </div>
      {Object.keys(stats.sources).length > 0 && (
        <p className="text-caption text-text-secondary">
          Sign-ups by source:{' '}
          {Object.entries(stats.sources)
            .sort((a, b) => b[1] - a[1])
            .map(([s, n]) => `${s} ${n}`)
            .join(' · ')}
          {stats.tests > 0 ? ` · (${stats.tests} test sign-ups not counted)` : ''}
        </p>
      )}

      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold text-text-primary">Release people who didn&apos;t answer</p>
            <p className="text-caption text-text-secondary">
              {silent} confirmed {silent === 1 ? 'person hasn’t' : 'people haven’t'} said if they&apos;re coming. Releasing gives their spots to the waitlist, in order.
            </p>
          </div>
          <Button variant="outline" size="sm" disabled={silent === 0} onClick={() => setReleaseOpen(true)}>
            <BellRing className="h-4 w-4" /> Release {silent}
          </Button>
        </CardContent>
      </Card>

      <details className="rounded-2xl border border-border bg-card">
        <summary className="cursor-pointer px-4 py-3 text-caption font-semibold text-text-primary">WhatsApp messages (edit the wording)</summary>
        <div className="flex flex-col gap-3 px-4 pb-4">
          <p className="text-xs text-text-secondary">
            {'{name} {title} {cafe} {day} {start} {checkin} {rank} {number} {link} {community}'} are filled in per person. The green button
            picks the right message for each person.
          </p>
          {(Object.keys(DEFAULT_MESSAGES) as MessageKind[]).map((k) => (
            <label key={k} className="flex flex-col gap-1">
              <span className="text-caption font-semibold text-text-primary">{MESSAGE_LABEL[k]}</span>
              <textarea
                value={messages[k]}
                onChange={(e) => saveMessage(k, e.target.value)}
                rows={3}
                className="w-full rounded-xl border border-border bg-surface p-3 text-caption text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </label>
          ))}
        </div>
      </details>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center" data-host-tour="people">
        <div className="flex gap-1.5 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`h-9 whitespace-nowrap rounded-full px-3.5 text-caption font-semibold ${tab === t.id ? 'bg-text-primary text-white' : 'bg-surface text-text-secondary hover:text-text-primary'}`}
            >
              {t.label} <span className="tabular-nums opacity-70">{t.n}</span>
            </button>
          ))}
        </div>
        <label className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, tag, phone"
            className="h-10 w-full rounded-xl border border-border bg-surface pl-9 pr-3 text-caption text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </label>
      </div>

      <div className="flex flex-col gap-2">
        {rows.length === 0 && <p className="py-8 text-center text-caption text-text-secondary">Nobody here yet.</p>}
        {rows.map((e) => (
          <Card key={e.id} className={e.isTest ? 'opacity-60' : ''}>
            <CardContent className="flex flex-col gap-3 p-3 md:flex-row md:items-center">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <span className={`mt-0.5 flex h-9 min-w-[2.75rem] items-center justify-center rounded-lg px-1.5 text-caption font-bold tabular-nums ${statusTone(e)}`}>
                  {e.status === 'confirmed' ? `#${e.rank}` : e.status === 'waitlist' ? `W${e.rank}` : e.status === 'no_show' ? 'NS' : 'Out'}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-text-primary">
                    {e.name}
                    {e.displayName && <span className="font-normal text-text-secondary"> · {e.displayName}</span>}
                    {e.isTest && <span className="ml-1 rounded bg-surface px-1.5 text-xs text-text-secondary">test</span>}
                  </p>
                  <p className="text-caption text-text-secondary">
                    <a href={`tel:${e.phone}`} className="font-medium text-text-primary">{e.phone}</a>
                    {e.mainCharacter ? ` · main ${e.mainCharacter}` : ''} · {e.utmSource ?? 'direct'}
                  </p>
                  <p className="mt-1 flex flex-wrap gap-1.5 text-xs">
                    <Chip tone={e.coming === 'yes' ? 'good' : e.coming === 'no' ? 'bad' : 'muted'}>
                      {e.coming === 'yes' ? 'Coming' : e.coming === 'no' ? 'Not coming' : 'No answer'}
                    </Chip>
                    {e.promotedAt && <Chip tone={e.toldAt ? 'muted' : 'warn'}>{e.toldAt ? 'Moved up · told' : 'Moved up · tell them'}</Chip>}
                    <Chip tone={e.consentFilming ? 'muted' : 'warn'}>{e.consentFilming ? 'OK to film' : 'No filming'}</Chip>
                    {e.consentUpdates && <Chip tone="muted">Wants updates</Chip>}
                    {e.withdrawnBy && <Chip tone="muted">Out: {e.withdrawnBy === 'player' ? 'their choice' : e.withdrawnBy === 'silent' ? 'no answer' : e.withdrawnBy === 'checkin' ? 'not at check-in' : 'admin'}</Chip>}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <a
                  href={waMessage(e)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#25D366] px-3 text-caption font-semibold text-[#0B2E17]"
                >
                  <MessageCircle className="h-4 w-4" /> WhatsApp
                </a>
                {e.promotedAt && !e.toldAt && (
                  <Act icon={Check} label="Told" busy={busy === `${e.id}:told`} onClick={() => run(e, 'told')} />
                )}
                {e.status === 'waitlist' && <Act icon={ArrowUp} label="Move up" busy={busy === `${e.id}:promote`} onClick={() => run(e, 'promote')} />}
                {(e.status === 'confirmed' || e.status === 'waitlist') && (
                  <>
                    <Act icon={UserMinus} label="Out" onClick={() => setConfirm({ entry: e, action: 'withdraw' })} />
                    {e.status === 'confirmed' && <Act icon={UserX} label="No-show" onClick={() => setConfirm({ entry: e, action: 'no_show' })} />}
                  </>
                )}
                {(e.status === 'withdrawn' || e.status === 'no_show') && (
                  <Act icon={RotateCcw} label="Put back" busy={busy === `${e.id}:restore`} onClick={() => run(e, 'restore')} />
                )}
                <Act
                  icon={FlaskConical}
                  label={e.isTest ? 'Not test' : 'Test'}
                  busy={busy === `${e.id}:${e.isTest ? 'untest' : 'test'}`}
                  onClick={() => run(e, e.isTest ? 'untest' : 'test')}
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Modal isOpen={!!confirm} onClose={() => setConfirm(null)} title={confirm ? ACTION_COPY[confirm.action]?.title : ''} size="sm">
        {confirm && (
          <div className="flex flex-col gap-3">
            <p className="text-body text-text-secondary">
              <span className="font-semibold text-text-primary">{confirm.entry.name}</span>. {ACTION_COPY[confirm.action]?.body}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button>
              <Button variant="primary" isLoading={!!busy} onClick={() => run(confirm.entry, confirm.action)}>
                {ACTION_COPY[confirm.action]?.cta}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <HostTour
        steps={data.practiceAllowed ? CHALLENGE_PAGE_STEPS : CHALLENGE_PAGE_STEPS.filter((s) => s.target !== 'practice')}
        open={tour.open}
        onClose={tour.close}
      />

      <Modal isOpen={releaseOpen} onClose={() => setReleaseOpen(false)} title={`Release ${silent} people?`} size="sm">
        <div className="flex flex-col gap-3">
          <p className="text-body text-text-secondary">
            Confirmed people who haven&apos;t tapped Yes or No lose their spot. The waitlist moves up in order. Then message the people who
            moved up (they show “Moved up · tell them”).
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setReleaseOpen(false)}>Cancel</Button>
            <Button variant="primary" isLoading={busy === 'release'} onClick={release}>Release {silent}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function statusTone(e: AdminEntry): string {
  if (e.status === 'confirmed') return 'bg-success/15 text-success';
  if (e.status === 'waitlist') return 'bg-warning/15 text-warning';
  return 'bg-surface text-text-secondary';
}

function Stat({ label, value, hint, warn }: { label: string; value: number | string; hint?: string; warn?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-caption font-semibold text-text-secondary">{label}</p>
        <p className={`mt-1 font-heading text-h1 tabular-nums ${warn ? 'text-primary' : 'text-text-primary'}`}>{value}</p>
        {hint && <p className="text-xs text-text-secondary">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function Chip({ tone, children }: { tone: 'good' | 'bad' | 'warn' | 'muted'; children: React.ReactNode }) {
  const cls = {
    good: 'bg-success/15 text-success',
    bad: 'bg-error/10 text-error',
    warn: 'bg-warning/15 text-warning',
    muted: 'bg-surface text-text-secondary',
  }[tone];
  return <span className={`rounded-full px-2 py-0.5 font-medium ${cls}`}>{children}</span>;
}

function Act({ icon: Icon, label, onClick, busy }: { icon: typeof Check; label: string; onClick: () => void; busy?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-caption font-semibold text-text-primary hover:bg-surface disabled:opacity-50"
    >
      <Icon className="h-4 w-4" /> {busy ? '…' : label}
    </button>
  );
}
