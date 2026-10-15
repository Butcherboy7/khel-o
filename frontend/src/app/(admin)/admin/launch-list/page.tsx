'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Rocket, Search, MessageCircle, MessageSquareText, Phone, Download, Copy, Check } from 'lucide-react';
import { getAdminLaunchList, downloadLaunchListCsv, type ReachBy, type LaunchSignupRow } from '@/lib/api/launchList';
import { Button, Card, CardContent, EmptyState, ErrorState, PageSpinner } from '@/components/ui';

const LAUNCH_KEY = 'gta6';
const DEFAULT_MESSAGE =
  'Hi {name}, it’s KHEL-O 👋 GTA 6 launch-week slots are open. Book your PS5 slot at a café near you: https://khel-o.com/gta6';
const MESSAGE_KEY = 'khelo.launchList.message';

const REACH_LABEL: Record<ReachBy, { label: string; icon: typeof Phone }> = {
  whatsapp: { label: 'WhatsApp', icon: MessageCircle },
  text: { label: 'Text', icon: MessageSquareText },
  call: { label: 'Call', icon: Phone },
};

/** One tap opens the chat, the SMS app or the dialler with the number filled in. */
function contactHref(row: LaunchSignupRow, message: string): string {
  const digits = row.phone.replace(/\D/g, '');
  const text = encodeURIComponent(message.replace(/\{name\}/g, row.name.split(' ')[0]));
  if (row.contactMethod === 'whatsapp') return `https://wa.me/${digits}?text=${text}`;
  if (row.contactMethod === 'text') return `sms:${row.phone}?body=${text}`;
  return `tel:${row.phone}`;
}

export default function AdminLaunchListPage() {
  const [q, setQ] = useState('');
  const [method, setMethod] = useState<ReachBy | 'all'>('all');
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(MESSAGE_KEY);
      if (saved) setMessage(saved);
    } catch {
      /* private mode: the default message is fine */
    }
  }, []);
  const saveMessage = (v: string) => {
    setMessage(v);
    try {
      localStorage.setItem(MESSAGE_KEY, v);
    } catch {
      /* ignore */
    }
  };

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'launch-list', LAUNCH_KEY],
    queryFn: () => getAdminLaunchList(LAUNCH_KEY),
    staleTime: 30_000,
  });

  if (isLoading) return <PageSpinner label="Loading the GTA 6 list" />;
  if (isError || !data) {
    return (
      <ErrorState
        title="Couldn't load the launch list"
        message={(error as Error)?.message || 'Failed to fetch the list.'}
        onRetry={() => refetch()}
      />
    );
  }

  const needle = q.trim().toLowerCase();
  const rows = data.items
    .filter((r) => method === 'all' || r.contactMethod === method)
    .filter((r) => !needle || [r.name, r.phone, r.email ?? ''].some((v) => v.toLowerCase().includes(needle)));

  const chip = (key: ReachBy | 'all', label: string) => (
    <button
      key={key}
      onClick={() => setMethod(key)}
      className={`rounded-full border px-3 py-1 text-caption font-semibold transition-colors ${
        method === key ? 'border-primary bg-primary/10 text-primary' : 'border-border text-text-secondary hover:bg-surface'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-heading text-h1 text-text-primary flex items-center gap-2">
            <Rocket className="h-6 w-6 text-primary" />
            {data.title} launch list
          </h1>
          <p className="text-body text-text-secondary mt-0.5">
            {data.total} {data.total === 1 ? 'person' : 'people'} want a slot for launch on{' '}
            {new Date(data.launchDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}. Contact each one the
            way they picked. Public page: <span className="font-semibold text-text-primary">khel-o.com/gta6</span>
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          isLoading={downloading}
          onClick={async () => {
            setDownloading(true);
            try {
              await downloadLaunchListCsv(LAUNCH_KEY);
            } finally {
              setDownloading(false);
            }
          }}
        >
          <Download className="h-4 w-4" /> Download CSV
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {(Object.keys(REACH_LABEL) as ReachBy[]).map((m) => {
          const { label, icon: Icon } = REACH_LABEL[m];
          return (
            <Card key={m}>
              <CardContent className="flex items-center justify-between p-4">
                <span className="flex items-center gap-2 text-caption font-semibold text-text-secondary">
                  <Icon className="h-4 w-4 text-primary" /> {label}
                </span>
                <span className="font-heading text-h2 text-text-primary tabular-nums">{data.byMethod[m] ?? 0}</span>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardContent className="flex flex-col gap-2 p-4">
          <label htmlFor="launch-message" className="text-caption font-semibold text-text-primary">
            Message for WhatsApp and texts
          </label>
          <textarea
            id="launch-message"
            value={message}
            onChange={(e) => saveMessage(e.target.value)}
            rows={3}
            className="w-full rounded-xl border border-border bg-surface p-3 text-caption text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <div className="flex items-center justify-between gap-2 text-xs text-text-secondary">
            <span>{'{name}'} becomes their first name. Saved on this device.</span>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(message).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                });
              }}
              className="flex items-center gap-1 font-semibold text-primary"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <label className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, number or email"
            className="w-full h-10 pl-9 pr-3 rounded-xl border border-border bg-surface text-caption text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </label>
        <div className="flex gap-2 flex-wrap">
          {chip('all', `All (${data.total})`)}
          {chip('whatsapp', `WhatsApp (${data.byMethod.whatsapp ?? 0})`)}
          {chip('text', `Text (${data.byMethod.text ?? 0})`)}
          {chip('call', `Call (${data.byMethod.call ?? 0})`)}
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title={data.total === 0 ? 'Nobody yet' : 'Nothing matches'}
          description={data.total === 0 ? 'Sign-ups from khel-o.com/gta6 land here.' : 'Try another search or filter.'}
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-left text-caption">
            <thead className="border-b border-border text-text-secondary">
              <tr>
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Number</th>
                <th className="px-4 py-3 font-semibold">Reach by</th>
                <th className="px-4 py-3 font-semibold">Joined</th>
                <th className="px-4 py-3 font-semibold">From</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const { label, icon: Icon } = REACH_LABEL[r.contactMethod];
                return (
                  <tr key={r.id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-3 font-semibold text-text-primary">
                      {r.name}
                      {r.email && <div className="text-xs font-normal text-text-secondary">{r.email}</div>}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-text-primary">{r.phone}</td>
                    <td className="px-4 py-3 text-text-secondary">{label}</td>
                    <td className="px-4 py-3 text-text-secondary tabular-nums">
                      {new Date(r.joinedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{r.utmContent || r.utmSource || '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <a
                        href={contactHref(r, message)}
                        target={r.contactMethod === 'whatsapp' ? '_blank' : undefined}
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 font-bold text-white hover:bg-primary-dark"
                      >
                        <Icon className="h-3.5 w-3.5" /> {label}
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
