'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, ChevronDown, ChevronUp, Clapperboard, RotateCcw, Wand2 } from 'lucide-react';
import { adminRehearsal, type AdminChallengeDetail, type Bracket, type RehearsalAction } from '@/lib/api/challenges';
import { Button } from '@/components/ui';

/** What the guide can see to tell whether the host has done their part. */
interface Ctx {
  d: AdminChallengeDetail;
  b: Bracket;
  here: number;
  acted: boolean;
}

interface Scene {
  clock: string;
  title: string;
  story: string;
  act?: { label: string; action: RehearsalAction; n?: number; leave?: number };
  move: React.ReactNode;
  done?: (c: Ctx) => boolean;
}

const champion = (b: Bracket) => b.standings.some((s) => s.place === 1);
const round1Left = (b: Bracket) => b.ready.some((m) => m.round === 0);

/** The worst-case day, in order. Each scene makes one thing happen (the
 *  button) and says what the host does about it. */
const SCENES: Scene[] = [
  {
    clock: '2:30 PM',
    title: 'Check-in opens',
    story: '10 people signed up online. Nobody is here yet. This wipes any earlier rehearsal and sets the clock to now.',
    act: { label: 'Start the rehearsal', action: 'start', n: 10 },
    move: (
      <p>
        Open <b>Bracket on projector</b> on another screen if you can, so you see what players see.
      </p>
    ),
    done: (c) => c.acted && (c.d.rehearsal?.practicePlayers ?? 0) >= 10,
  },
  {
    clock: '2:40 PM',
    title: '7 people from the list arrive',
    story: 'Most show their QR. One of them forgot their phone.',
    act: { label: '7 people arrive', action: 'arrive', n: 7 },
    move: (
      <p>
        Watch <b>Confirmed here</b> go to 7/10. Then check in the one without a phone yourself: find a name that still says{' '}
        <b>Tap when here</b> and tap it.
      </p>
    ),
    done: (c) => c.acted && c.here >= 8,
  },
  {
    clock: '2:55 PM',
    title: 'Surprise: 15 people you didn’t expect',
    story: 'They never signed up. They scan the walk-in QR on the counter. You expected 10, now about 25 are here.',
    act: { label: '15 walk-ins arrive', action: 'walk_in', n: 15 },
    move: (
      <>
        <p>Nothing to tick: the counter QR already checked them in. Nobody is turned away, there’s no limit.</p>
        <p>
          Look at <b>How long it takes</b>. If it goes past 6 PM, ask AdamsDen for a 2nd PS5 for the early rounds and type 2 in{' '}
          <b>Setups you can use</b>. Tell everyone: matches go back to back, stay close.
        </p>
      </>
    ),
    done: (c) => c.acted,
  },
  {
    clock: '3:14 PM',
    title: 'One more runs in at the last second',
    story: 'A new player scans the counter QR one minute before check-in closes.',
    act: { label: 'Last-second walk-in', action: 'walk_in', n: 1 },
    move: (
      <p>
        They’re in. If instead it’s someone from the list, search their name and tap it. Still on time, so they play.
      </p>
    ),
    done: (c) => c.acted,
  },
  {
    clock: '3:15 PM',
    title: 'Close check-in',
    story: '2 people from the list never came.',
    move: (
      <p>
        Press <b>Close check-in</b>, then confirm. The 2 who didn’t come become no-shows. Everyone here stays in.
      </p>
    ),
    done: (c) => Boolean(c.d.challenge.checkinClosedAt),
  },
  {
    clock: '3:16 PM',
    title: 'Make the draw',
    story: 'About 24 players. A bracket has 32 places, so some players get a free pass (a bye) to round 2.',
    move: (
      <p>
        Press <b>Make the draw</b>. Pressing it again does nothing (no accidental reshuffle). Only <b>Redo the draw</b> shuffles again.
      </p>
    ),
    done: (c) => c.b.drawn,
  },
  {
    clock: '3:20 PM',
    title: 'Someone arrives after the draw',
    story: 'They scan the counter QR. They’re checked in, but not in the bracket.',
    act: { label: 'Late walk-in', action: 'walk_in', n: 1 },
    move: (
      <>
        <p>
          In the check-in list they say <b>Not in the bracket</b>. Press <b>Add to bracket</b>: they take a bye and play the player who had
          it, so nobody is reshuffled.
        </p>
        <p className="text-text-secondary">No result yet? Redo the draw also works, but it changes everyone’s matches.</p>
      </>
    ),
    done: (c) => c.acted && c.d.rehearsal?.hereNotInBracket === 0,
  },
  {
    clock: '3:25 PM',
    title: 'Round 1 is played',
    story: 'All round-1 matches finish except one. That one is yours to enter.',
    act: { label: 'Play round 1', action: 'play', leave: 1 },
    move: (
      <p>
        Under <b>Ready to play</b>, tap the round-1 match, tap the winner, type 2 and 1, and press <b>Save</b>.
      </p>
    ),
    done: (c) => c.acted && !round1Left(c.b),
  },
  {
    clock: '3:50 PM',
    title: 'A player is stuck in traffic',
    story: 'The top match can’t start: one player isn’t here.',
    move: (
      <>
        <p>
          Press <b>Skip for now</b> on the top match. It moves to the back and the next match plays first. When they arrive, press{' '}
          <b>Bring back</b>.
        </p>
        <p>They never come? Tap the match and press <b>“… didn’t show: … wins”</b>. That’s a walkover.</p>
      </>
    ),
  },
  {
    clock: '4:00 PM',
    title: 'Oops: you saved the wrong winner',
    story: 'You tapped the wrong name on the last result.',
    move: (
      <p>
        Tap that match again (in the bracket below), pick the other player and Save, or press <b>Clear</b>. This works until their next
        match has a result.
      </p>
    ),
  },
  {
    clock: '4:10 PM',
    title: 'Another walk-in, but matches have started',
    story: 'They scan the counter QR. Round 2 is already being played.',
    act: { label: 'Late walk-in', action: 'walk_in', n: 1 },
    move: (
      <>
        <p>
          Look at the top of step 3: a yellow box <b>Here but not in the bracket</b>. If a bye is still free it has an <b>Add to bracket</b>{' '}
          button. If it says <b>No free place left</b>, they can’t play today.
        </p>
        <p>
          Tell them nicely: “The matches are fixed, but you still get <b>20% off at AdamsDen today</b>. Stay and watch!”
        </p>
      </>
    ),
    done: (c) => c.acted,
  },
  {
    clock: '5:15 PM',
    title: 'Fast forward to the end',
    story: 'Every match up to the semi-finals gets played. The 3rd-place match and the final are left for you.',
    act: { label: 'Play up to the final', action: 'play_to_final' },
    move: (
      <p>
        Enter the <b>3rd place</b> match (best of 3), then the <b>Final</b> (best of 5, for example 3 and 2).
      </p>
    ),
    done: (c) => champion(c.b),
  },
  {
    clock: '5:45 PM',
    title: 'Finish',
    story: 'The final is in. Time to make it official.',
    move: (
      <p>
        Press <b>Finish the challenge</b>. The results go up on the public page and the podium rewards are made.
      </p>
    ),
    done: (c) => c.d.challenge.status === 'finished',
  },
  {
    clock: '5:50 PM',
    title: 'Champion photo and poster',
    story: 'The champion is on stage with the trophy moment.',
    move: (
      <p>
        Press <b>Take photo</b> (opens your phone camera). Then <b>Download post</b> and <b>Download story</b>, and share them in the
        WhatsApp groups and on Instagram.
      </p>
    ),
    done: (c) => Boolean(c.d.challenge.championPhotoUrl),
  },
  {
    clock: '6:00 PM',
    title: 'The final was entered the wrong way round',
    story: 'The players tell you the score was the other way.',
    move: (
      <p>
        Press <b>Reopen to correct a result</b>, type why, fix the final, and press <b>Finish</b> again. Rewards move to the right people.
      </p>
    ),
  },
  {
    clock: 'Done',
    title: 'You’ve handled the worst day',
    story: 'Every surprise from tomorrow, practised once.',
    move: <p>Start again any time from scene 1. This guide only exists on dev; the live site never shows it.</p>,
  },
];

const KEY = (id: string) => `khelo.rehearsal.${id}`;

export function RehearsalGuide({
  id, detail, bracket, here, onDetail,
}: { id: string; detail: AdminChallengeDetail; bracket: Bracket; here: number; onDetail: (d: AdminChallengeDetail) => void }) {
  const [i, setI] = useState(0);
  const [open, setOpen] = useState(true);
  const [acted, setActed] = useState<Record<number, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY(id)) || '{}');
      if (typeof saved.i === 'number') setI(Math.min(saved.i, SCENES.length - 1));
      if (saved.acted) setActed(saved.acted);
      if (saved.open === false) setOpen(false);
    } catch {
      /* start at scene 1 */
    }
  }, [id]);
  useEffect(() => {
    try {
      localStorage.setItem(KEY(id), JSON.stringify({ i, acted, open }));
    } catch {
      /* fine */
    }
  }, [id, i, acted, open]);

  const s = SCENES[i];
  const ctx: Ctx = { d: detail, b: bracket, here, acted: Boolean(acted[i]) };
  const done = s.done ? s.done(ctx) : false;

  const act = async () => {
    if (!s.act) return;
    setBusy(true);
    setNote(null);
    try {
      const d = await adminRehearsal(id, s.act.action, s.act.n ?? 1, s.act.leave ?? 0);
      onDetail(d);
      const did = d.did ?? {};
      setNote(
        did.signedUp !== undefined ? `${did.signedUp} people signed up. Clock set: check-in is open now.`
          : did.arrived ? `Arrived: ${did.arrived.join(', ') || 'nobody left to arrive'}.`
          : did.walkedIn ? `Walked in: ${did.walkedIn.join(', ')}.`
          : did.played !== undefined ? `${did.played} match${did.played === 1 ? '' : 'es'} played.`
          : 'Done.',
      );
      setActed((a) => (s.act?.action === 'start' ? { [i]: true } : { ...a, [i]: true }));
    } catch (e) {
      setNote((e as Error).message || 'That didn’t work. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const go = (to: number) => {
    setI(Math.max(0, Math.min(SCENES.length - 1, to)));
    setNote(null);
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 px-3 pb-3 sm:px-6" data-testid="rehearsal-guide">
      <div className="mx-auto max-w-xl rounded-2xl border-2 border-primary/50 bg-card shadow-2xl">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center gap-2 px-4 py-2.5 text-left"
          aria-expanded={open}
        >
          <Clapperboard className="h-4 w-4 flex-shrink-0 text-primary" />
          <span className="min-w-0 flex-1 truncate text-caption font-semibold text-text-primary">
            Rehearsal · {i + 1}/{SCENES.length} · <span className="text-primary">{s.clock}</span> {s.title}
          </span>
          {done && <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-success" />}
          {open ? <ChevronDown className="h-4 w-4 text-text-secondary" /> : <ChevronUp className="h-4 w-4 text-text-secondary" />}
        </button>
        {open && (
          <div className="max-h-[52vh] overflow-y-auto border-t border-border px-4 pb-3 pt-2">
            <p className="text-caption text-text-secondary">
              <b className="text-text-primary">What happens:</b> {s.story}
            </p>
            {s.act && (
              <Button variant={acted[i] ? 'outline' : 'primary'} size="sm" className="mt-2" isLoading={busy} onClick={act}>
                <Wand2 className="h-4 w-4" /> {acted[i] ? `${s.act.label} again` : s.act.label}
              </Button>
            )}
            {note && <p className="mt-2 rounded-lg bg-surface px-2 py-1.5 text-xs text-text-primary">{note}</p>}
            <div className="mt-2 space-y-1.5 rounded-xl bg-primary/5 p-3 text-caption text-text-primary">
              <p className="text-xs font-bold uppercase tracking-wide text-primary">Your move</p>
              {s.move}
            </div>
            <p className={`mt-2 text-xs font-semibold ${done ? 'text-success' : 'text-text-secondary'}`}>
              {s.done ? (done ? '✓ Done. Go to the next scene.' : 'Waiting for your move…') : 'Try it, then go to the next scene.'}
            </p>
            <div className="mt-2 flex items-center justify-between gap-2">
              <Button variant="ghost" size="sm" onClick={() => go(i - 1)} disabled={i === 0}>
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
              <button type="button" onClick={() => { go(0); setActed({}); }} className="inline-flex items-center gap-1 text-xs font-semibold text-text-secondary hover:text-text-primary">
                <RotateCcw className="h-3.5 w-3.5" /> From the start
              </button>
              <Button variant={done ? 'primary' : 'outline'} size="sm" onClick={() => go(i + 1)} disabled={i === SCENES.length - 1}>
                Next <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
