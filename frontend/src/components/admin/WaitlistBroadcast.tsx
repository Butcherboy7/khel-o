'use client';

import { useState } from 'react';
import { Send } from 'lucide-react';
import { broadcastToWaitlist, type CafeDemandLead } from '@/lib/api/admin';

/**
 * Email one café's "Notify me" list. A test copy to the admin's own inbox
 * has to go out first for the exact subject + message being sent, and the
 * real send asks for a second tap — this reaches real people's inboxes.
 */
export function WaitlistBroadcast({ lead, onClose }: { lead: CafeDemandLead; onClose: () => void }) {
  const [subject, setSubject] = useState(`${lead.cafeName} on KHEL-O: an update`);
  const [message, setMessage] = useState('');
  const [testedFor, setTestedFor] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<'test' | 'send' | null>(null);
  const [status, setStatus] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const draftKey = `${subject}\n${message}`;
  const tested = testedFor === draftKey;
  const valid = subject.trim().length >= 3 && message.trim().length >= 10;

  const send = async (test: boolean) => {
    setBusy(test ? 'test' : 'send');
    setStatus(null);
    try {
      const res = await broadcastToWaitlist(lead.cafeId, { subject: subject.trim(), message: message.trim(), test });
      if (test) {
        setTestedFor(draftKey);
        setStatus({ tone: 'ok', text: `Test sent to ${res.to}. Check it, then send to the list.` });
      } else {
        setStatus({ tone: 'ok', text: `Sent to ${res.sent} ${res.sent === 1 ? 'person' : 'people'}.` });
        setConfirming(false);
      }
    } catch (err) {
      setStatus({ tone: 'error', text: (err as Error)?.message || 'Sending failed.' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-heading text-body-emphasis text-text-primary">Email this list</h4>
        <button type="button" onClick={onClose} className="text-caption font-semibold text-text-secondary hover:underline">
          Close
        </button>
      </div>
      <p className="text-caption text-text-secondary">
        Goes only to the {lead.emailableCount} subscribed {lead.emailableCount === 1 ? 'inbox' : 'inboxes'} on{' '}
        {lead.cafeName}&apos;s list. Every email carries an unsubscribe link. Phone-only requests aren&apos;t emailed.
      </p>

      <label className="flex flex-col gap-1 text-caption font-semibold text-text-primary">
        Subject
        <input
          value={subject}
          maxLength={120}
          onChange={(e) => setSubject(e.target.value)}
          className="min-h-input rounded-lg border border-border bg-card px-3 text-body font-normal"
        />
      </label>
      <label className="flex flex-col gap-1 text-caption font-semibold text-text-primary">
        Message
        <textarea
          value={message}
          maxLength={3000}
          rows={5}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="e.g. Good news: the owner is setting up their stations this week. Bookings open soon."
          className="rounded-lg border border-border bg-card px-3 py-2 text-body font-normal"
        />
      </label>

      {message.trim() && (
        <div className="flex flex-col gap-1">
          <span className="text-overline text-text-secondary">Preview</span>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="font-heading text-body-emphasis text-text-primary">{subject}</p>
            <p className="mt-2 whitespace-pre-line text-caption text-text-secondary">{message}</p>
            <span className="mt-3 inline-block rounded-lg bg-primary px-3 py-1.5 text-caption font-semibold text-white">
              View {lead.cafeName}
            </span>
            <p className="mt-3 text-[11px] text-text-secondary">
              You&apos;re getting this because you tapped &ldquo;Notify me&rdquo; on KHEL-O. <u>Unsubscribe</u>
            </p>
          </div>
        </div>
      )}

      {status && (
        <p className={`text-caption font-semibold ${status.tone === 'ok' ? 'text-success' : 'text-error'}`}>{status.text}</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => send(true)}
          disabled={!valid || busy !== null}
          className="rounded-lg border border-border bg-card px-3 py-2 text-caption font-semibold text-text-primary hover:bg-surface disabled:opacity-40"
        >
          {busy === 'test' ? 'Sending test…' : 'Send test to me'}
        </button>
        <button
          type="button"
          onClick={() => (confirming ? send(false) : setConfirming(true))}
          disabled={!valid || !tested || busy !== null || lead.emailableCount === 0}
          title={tested ? undefined : 'Send yourself a test of this exact message first'}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-caption font-semibold text-white hover:bg-primary-dark disabled:opacity-40"
        >
          <Send className="h-3.5 w-3.5" aria-hidden />
          {busy === 'send'
            ? 'Sending…'
            : confirming
              ? `Tap again to email ${lead.emailableCount}`
              : `Send to ${lead.emailableCount} ${lead.emailableCount === 1 ? 'person' : 'people'}`}
        </button>
        {!tested && valid && <span className="text-caption text-text-secondary">Send a test first</span>}
      </div>
    </div>
  );
}
