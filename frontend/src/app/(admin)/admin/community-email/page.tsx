'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail } from 'lucide-react';
import {
  getEmailSchedule, getEmailSchedulePreview, testScheduledEmail, updateScheduledEmail,
  type EmailCampaign,
} from '@/lib/api/admin';
import { Badge, Button, Card, CardContent, ErrorState, PageSpinner } from '@/components/ui';

const LABEL: Record<string, string> = {
  c1: 'Email 1: the confession',
  c2: 'Email 2: roast KHEL-O',
  c3: 'Email 3: are we the problem?',
  c4: 'Email 4: one question',
  c5: 'Email 5: your Tekken rival',
  c6: "Email 6: you've been promoted",
};

const STATUS: Record<EmailCampaign['status'], { text: string; tone: 'success' | 'warning' | 'error' | 'default' | 'primary' }> = {
  scheduled: { text: 'Scheduled', tone: 'primary' },
  sending: { text: 'Sending now', tone: 'warning' },
  sent: { text: 'Sent', tone: 'success' },
  paused: { text: 'Paused', tone: 'warning' },
  cancelled: { text: 'Cancelled', tone: 'default' },
  missed: { text: 'Missed (over a day late)', tone: 'error' },
};

const ist = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
  }) + ' IST';

function CampaignCard({ c, onChanged }: { c: EmailCampaign; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [fail, setFail] = useState<string | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const locked = c.status === 'sent' || c.status === 'sending';
  const st = STATUS[c.status];

  const act = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setNote(null);
    setFail(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setFail((e as Error)?.message || 'That did not work.');
    } finally {
      setBusy(null);
    }
  };

  const togglePreview = () =>
    act('preview', async () => {
      if (!open && html === null) setHtml((await getEmailSchedulePreview(c.variant)).html);
      setOpen((v) => !v);
    });

  return (
    <Card elevation="raised">
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-heading text-h3 font-bold text-text-primary">{LABEL[c.variant] ?? `Email ${c.variant.toUpperCase()}`}</h2>
          <Badge variant={st.tone}>{st.text}</Badge>
        </div>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-body text-text-primary sm:grid-cols-2">
          <div><dt className="text-caption text-text-secondary">Subject</dt><dd className="font-semibold">{c.subject}</dd></div>
          <div><dt className="text-caption text-text-secondary">Goes out</dt><dd className="font-semibold">{ist(c.scheduledFor)}</dd></div>
          <div><dt className="text-caption text-text-secondary">Would reach</dt><dd className="font-semibold">{c.audience} people</dd></div>
          <div>
            <dt className="text-caption text-text-secondary">Test</dt>
            <dd className="font-semibold">{c.testedAt ? `Done ${ist(c.testedAt)}` : 'Not tested yet. It will not send until you test it.'}</dd>
          </div>
          {(c.sentCount > 0 || c.failedCount > 0) && (
            <div><dt className="text-caption text-text-secondary">Result</dt><dd className="font-semibold">{c.sentCount} sent, {c.failedCount} failed</dd></div>
          )}
        </dl>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button variant="secondary" onClick={togglePreview} disabled={busy !== null} fullWidth className="sm:w-auto">
            {open ? 'Hide preview' : 'Preview'}
          </Button>
          <Button
            variant="secondary"
            fullWidth
            className="sm:w-auto"
            disabled={busy !== null || locked}
            onClick={() => act('test', async () => {
              const r = await testScheduledEmail(c.variant);
              setNote(
                !r.sent ? 'The test could not be sent.'
                  : r.delivered ? `Test sent to ${r.to}. Check your inbox and the Promotions tab.`
                    : `Test made for ${r.to}, but this server does not deliver email (only production does).`,
              );
            })}
          >
            {busy === 'test' ? 'Sending test…' : 'Send test to me'}
          </Button>
          {c.status === 'scheduled' && (
            <Button variant="secondary" fullWidth className="sm:w-auto" disabled={busy !== null} onClick={() => act('pause', async () => { await updateScheduledEmail(c.variant, { action: 'pause' }); })}>
              Pause
            </Button>
          )}
          {(c.status === 'paused' || c.status === 'cancelled' || c.status === 'missed') && (
            <Button fullWidth className="sm:w-auto" disabled={busy !== null} onClick={() => act('resume', async () => { await updateScheduledEmail(c.variant, { action: 'resume' }); })}>
              Put back on schedule
            </Button>
          )}
          {(c.status === 'scheduled' || c.status === 'paused') && (
            <Button variant="ghost" fullWidth className="sm:w-auto" disabled={busy !== null} onClick={() => act('cancel', async () => { await updateScheduledEmail(c.variant, { action: 'cancel' }); })}>
              Cancel
            </Button>
          )}
        </div>

        {open && html !== null && (
          <iframe title={`Preview of email ${c.variant}`} srcDoc={html} className="h-[560px] w-full rounded-xl border border-border bg-white" />
        )}
        {note && <p className="rounded-xl bg-success/10 px-3 py-2 text-body text-success">{note}</p>}
        {fail && <p className="rounded-xl bg-error/10 px-3 py-2 text-body text-error">{fail}</p>}
      </CardContent>
    </Card>
  );
}

export default function AdminCommunityEmailPage() {
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['admin', 'email-schedule'], queryFn: getEmailSchedule, refetchInterval: 30000 });

  if (isLoading) return <PageSpinner />;
  if (error || !data) return <ErrorState title="Could not load the emails" message={(error as Error)?.message} onRetry={() => refetch()} />;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div>
        <h1 className="flex items-center gap-2 font-heading text-h2 font-bold text-text-primary"><Mail className="h-6 w-6" /> Community emails</h1>
        <p className="mt-1 text-body text-text-secondary">
          Six emails from Abdullah, Founder, two days apart. Each goes out by itself at its time (shown in IST) once you have sent yourself a test. Real accounts and people who ticked the promotions box only, once each. Everyone gets a one-tap unsubscribe.
        </p>
      </div>
      {data.map((c) => (
        <CampaignCard key={`${c.id}-${c.status}-${c.testedAt}-${c.scheduledFor}`} c={c} onChanged={() => qc.invalidateQueries({ queryKey: ['admin', 'email-schedule'] })} />
      ))}
    </div>
  );
}
