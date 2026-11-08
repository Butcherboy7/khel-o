'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail, Send } from 'lucide-react';
import { getCommunityEmail, sendCommunityEmail } from '@/lib/api/admin';
import { Button, Card, CardContent, ErrorState, PageSpinner } from '@/components/ui';

export default function AdminCommunityEmailPage() {
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['admin', 'community-email'], queryFn: getCommunityEmail });
  const [busy, setBusy] = useState<'test' | 'send' | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [fail, setFail] = useState<string | null>(null);
  const [typed, setTyped] = useState('');

  if (isLoading) return <PageSpinner />;
  if (error || !data) return <ErrorState title="Could not load the email" message={(error as Error)?.message} onRetry={() => refetch()} />;

  const run = async (test: boolean) => {
    setBusy(test ? 'test' : 'send');
    setNote(null);
    setFail(null);
    try {
      const r = await sendCommunityEmail({ test, confirmCount: test ? undefined : data.recipients });
      setNote(
        test
          ? r.delivered
            ? `Test sent to ${r.to}. Check your inbox.`
            : `Test made for ${r.to}. This server does not deliver email (only production does), so read the preview below.`
          : `Sent to ${r.sent} people.`,
      );
      await qc.invalidateQueries({ queryKey: ['admin', 'community-email'] });
    } catch (e) {
      setFail((e as Error)?.message || 'That did not work.');
    } finally {
      setBusy(null);
    }
  };

  const confirmed = typed.trim() === String(data.recipients);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div>
        <h1 className="flex items-center gap-2 font-heading text-h2 font-bold text-text-primary"><Mail className="h-6 w-6" /> Community email</h1>
        <p className="mt-1 text-body text-text-secondary">
          One email to everyone with a KHEL-O account: what the community gets first, and a button into it. Send a test to yourself first. It has a one-tap unsubscribe.
        </p>
      </div>

      <Card elevation="raised">
        <CardContent className="flex flex-col gap-3 p-4">
          <p className="text-body text-text-primary">Subject: <b>{data.subject}</b></p>
          <p className="text-body text-text-primary">Would go to <b>{data.recipients}</b> people (real addresses, once each, not unsubscribed).</p>
          <iframe title="Email preview" srcDoc={data.html} className="h-[520px] w-full rounded-xl border border-border bg-white" />
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={() => run(true)} disabled={busy !== null} variant="secondary" fullWidth className="sm:w-auto">
              {busy === 'test' ? 'Sending test…' : 'Send test to me'}
            </Button>
          </div>
          <div className="rounded-xl border border-border p-3">
            <p className="text-caption text-text-secondary">
              {data.testedRecently ? 'Test done. To send for real, type the number of people above.' : 'Send a test first. The real send unlocks after it.'}
            </p>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                inputMode="numeric"
                value={typed}
                onChange={(e) => setTyped(e.target.value.replace(/\D/g, ''))}
                placeholder={`Type ${data.recipients}`}
                disabled={!data.testedRecently}
                aria-label="Type the number of people to confirm"
                className="h-11 rounded-xl border border-border bg-card px-3 text-body"
              />
              <Button onClick={() => run(false)} disabled={!data.testedRecently || !confirmed || busy !== null} className="gap-1.5">
                <Send className="h-4 w-4" /> {busy === 'send' ? 'Sending…' : `Send to ${data.recipients} people`}
              </Button>
            </div>
          </div>
          {note && <p className="rounded-xl bg-success/10 px-3 py-2 text-body text-success">{note}</p>}
          {fail && <p className="rounded-xl bg-error/10 px-3 py-2 text-body text-error">{fail}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
