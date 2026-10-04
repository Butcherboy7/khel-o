'use client';

import { useEffect, useState } from 'react';
import { BottomSheet, Button, Input } from '@/components/ui';
import { MockPaymentModal } from '@/components/MockPaymentModal';
import { useRazorpay } from '@/hooks/useRazorpay';
import { useAuthStore } from '@/store/authStore';
import { registerForTournament, verifyTournamentPayment, type MyEntry, type TournamentDetail } from '@/lib/api/tournaments';
import { feeLabel, fmtWhen, rupees } from '@/lib/tournament';
import { ApiError } from '@/lib/api/errors';

const TAG_KEY = 'khelo_gamer_tag';

export function RegisterSheet({
  t,
  open,
  onClose,
  onDone,
}: {
  t: TournamentDetail;
  open: boolean;
  onClose: () => void;
  onDone: (entry: MyEntry) => void;
}) {
  const user = useAuthStore((s) => s.user);
  const { displayRazorpay, mockModalState } = useRazorpay();
  const [tag, setTag] = useState('');
  const [phone, setPhone] = useState('');
  const [team, setTeam] = useState('');
  const [mates, setMates] = useState<string[]>(() => Array(Math.max(0, t.teamSize - 1)).fill(''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    try {
      setTag((v) => v || localStorage.getItem(TAG_KEY) || user?.fullName?.split(' ')[0] || '');
    } catch {
      /* storage blocked */
    }
    setPhone((v) => v || user?.phoneNumber || '');
  }, [open, user]);

  const full = t.spotsLeft === 0;
  const paid = t.entryFee > 0 && !full;

  async function pay(entry: MyEntry) {
    const p = entry.payment!;
    displayRazorpay({
      order_id: p.orderId,
      amount: Math.round(p.amount * 100),
      currency: p.currency,
      key: p.keyId ?? undefined,
      name: 'KHEL-O Tournaments',
      description: t.title,
      prefill: { name: user?.fullName, email: user?.email, contact: phone || undefined },
      onDismiss: () => {
        setBusy(false);
        setError('Payment not finished. Your spot is held for 10 minutes. Tap Pay to try again.');
      },
      onFailed: () => setError('The payment failed. Nothing was charged; try again.'),
      handler: async (r) => {
        try {
          const done = await verifyTournamentPayment(t.slug, {
            entryId: entry.id,
            razorpayOrderId: r.razorpay_order_id,
            razorpayPaymentId: r.razorpay_payment_id,
            razorpaySignature: r.razorpay_signature,
          });
          onDone(done);
        } catch (e) {
          setError(e instanceof ApiError ? e.message : 'We could not confirm the payment. If money left your account, it will be confirmed or refunded automatically.');
        } finally {
          setBusy(false);
        }
      },
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      try {
        localStorage.setItem(TAG_KEY, tag.trim());
      } catch {
        /* storage blocked */
      }
      const entry = await registerForTournament(t.slug, {
        gamerTag: tag.trim(),
        phone: phone.trim() || undefined,
        teamName: t.teamSize > 1 ? team.trim() : undefined,
        teammates: t.teamSize > 1 ? mates.map((m) => m.trim()) : [],
      });
      if (entry.status === 'held' && entry.payment) {
        await pay(entry);
        return;
      }
      setBusy(false);
      onDone(entry);
    } catch (err) {
      setBusy(false);
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
    }
  }

  const held = t.myEntry?.status === 'held' && t.myEntry.payment ? t.myEntry : null;

  return (
    <>
      <BottomSheet
        isOpen={open}
        onClose={busy ? () => {} : onClose}
        title={full ? 'Join the waitlist' : 'Register'}
        description={`${t.title} · ${fmtWhen(t.startsAt)}`}
      >
        {held ? (
          <div className="flex flex-col gap-4 pb-2">
            <p className="text-body text-text-secondary">
              Your spot is held. Pay {rupees(held.amount)} to confirm it before the hold runs out.
            </p>
            {error && <p role="alert" className="rounded-xl bg-error/10 p-3 text-caption text-error">{error}</p>}
            <Button fullWidth size="lg" isLoading={busy} onClick={() => { setBusy(true); void pay(held); }}>
              Pay {rupees(held.amount)}
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4 pb-2">
            <Input
              label="Gamer tag"
              hint="Shown on the bracket and the café screen"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              maxLength={40}
              required
              minLength={2}
              autoComplete="nickname"
            />
            {t.teamSize > 1 && (
              <>
                <Input label="Team name" value={team} onChange={(e) => setTeam(e.target.value)} maxLength={60} required />
                {mates.map((m, i) => (
                  <Input
                    key={i}
                    label={`Teammate ${i + 2}`}
                    placeholder="Their gamer tag"
                    value={m}
                    onChange={(e) => setMates((xs) => xs.map((x, j) => (j === i ? e.target.value : x)))}
                    maxLength={40}
                    required
                  />
                ))}
              </>
            )}
            <Input
              label="Phone (optional)"
              hint="Only the organiser sees it, to reach you on the day"
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={20}
              autoComplete="tel"
            />
            <div className="rounded-xl bg-surface p-3 text-caption text-text-secondary">
              {full ? (
                <>The tournament is full. If a spot opens, everyone on the waitlist gets a notification and the first to register takes it.</>
              ) : paid ? (
                <>
                  {feeLabel(t)} covers your play time on the night. Refunded in full only if the organiser cancels. Your spot is held for 10
                  minutes while you pay.
                </>
              ) : (
                <>Free entry. Can&apos;t make it? Cancel from your pass so someone on the waitlist can play.</>
              )}
            </div>
            {error && <p role="alert" className="rounded-xl bg-error/10 p-3 text-caption text-error">{error}</p>}
            <Button type="submit" fullWidth size="lg" isLoading={busy}>
              {full ? 'Join waitlist' : paid ? `Continue to pay ${rupees(t.entryFee)}` : 'Confirm my spot'}
            </Button>
          </form>
        )}
      </BottomSheet>
      <MockPaymentModal
        isOpen={mockModalState?.isOpen || false}
        orderId={mockModalState?.orderId || ''}
        amount={mockModalState?.amount || 0}
        onSuccess={mockModalState?.onSuccess || (() => {})}
        onFailure={mockModalState?.onFailure || (() => {})}
        onClose={mockModalState?.onClose || (() => {})}
      />
    </>
  );
}
