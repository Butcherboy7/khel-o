'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  closeCommunityPoll,
  deleteCommunityPoll,
  editCommunityPoll,
  getCommunityOverview,
  getCommunityPolls,
  startCommunityPoll,
} from '@/lib/api/admin';
import { Button } from '@/components/ui';
import { cn } from '@/lib/cn';
import { ConfirmButton, ErrorLine, Panel, StateBadge, field, labelText, when } from './ui';

/** yyyy-mm-dd, N days from today. */
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
/** The end of that day in India: a poll "closing on Sunday" takes votes all Sunday. */
const endOfDayIst = (day: string) => `${day}T23:59:00+05:30`;
const lines = (s: string) => s.split('\n').map((o) => o.trim()).filter(Boolean);

const TEMPLATES: { name: string; question: string; options: string }[] = [
  { name: 'Next challenge game', question: 'Which game for the next challenge?', options: 'Tekken 8\nStreet Fighter 6\nEA FC 26\nValorant' },
  { name: 'Which day', question: 'Which day suits you for the next challenge?', options: 'Saturday\nSunday\nA weekday evening' },
  { name: 'Next café', question: 'Which area should we add a café in next?', options: 'Gachibowli\nKukatpally\nBanjara Hills\nSecunderabad' },
];

export function Poll() {
  const qc = useQueryClient();
  const { data: o } = useQuery({ queryKey: ['admin', 'community'], queryFn: getCommunityOverview });
  const { data: history } = useQuery({ queryKey: ['admin', 'community-polls'], queryFn: getCommunityPolls });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['admin'] });
    qc.invalidateQueries({ queryKey: ['community-week'] });
  };

  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState('');
  const [code, setCode] = useState('');
  const [closesOn, setClosesOn] = useState(() => inDays(7));
  const newPoll = useMutation({
    mutationFn: () => startCommunityPoll({ question, options: lines(options), membersCode: code.trim() || undefined, closesAt: closesOn ? endOfDayIst(closesOn) : undefined }),
    onSuccess: () => {
      setQuestion('');
      setOptions('');
      setCode('');
      refresh();
    },
  });

  const [edit, setEdit] = useState<{ question: string; options: string; closesOn: string; code: string } | null>(null);
  const live = o?.poll ?? null;
  useEffect(() => {
    setEdit(live ? { question: live.question, options: live.options.map((x) => x.label).join('\n'), closesOn: live.closesAt ? live.closesAt.slice(0, 10) : '', code: live.membersCode ?? '' } : null);
  }, [live?.id, live?.question, live?.closesAt, live?.membersCode, live?.options.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const saveEdit = useMutation({
    mutationFn: () =>
      editCommunityPoll({
        question: edit!.question.trim(),
        options: lines(edit!.options),
        ...(edit!.closesOn ? { closesAt: endOfDayIst(edit!.closesOn) } : { clearClose: true }),
        membersCode: edit!.code.trim(),
      }),
    onSuccess: refresh,
  });
  const closeNow = useMutation({ mutationFn: closeCommunityPoll, onSuccess: refresh });
  const remove = useMutation({ mutationFn: deleteCommunityPoll, onSuccess: refresh });

  const top = live ? Math.max(...live.options.map((y) => y.votes)) : 0;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel
          title="Running poll"
          hint="One vote per signed-in person; they can move or remove it until it closes. When it closes (the day you set, or Close now) the most votes wins and shows under Closed votes on the page."
        >
          {live && edit ? (
            <>
              <p className="text-caption font-bold text-text-primary">Live results · {live.total} {live.total === 1 ? 'vote' : 'votes'}{live.closesAt ? ` · closes ${when(live.closesAt)}` : ''}</p>
              <ul className="flex flex-col gap-1.5">
                {live.options.map((x) => {
                  const pc = live.total ? Math.round((x.votes / live.total) * 100) : 0;
                  const leading = x.votes > 0 && x.votes === top;
                  return (
                    <li key={x.label} className="relative overflow-hidden rounded-xl border border-border px-3 py-2 text-body">
                      <span className={cn('absolute inset-y-0 left-0', leading ? 'bg-primary/20' : 'bg-primary/8')} style={{ width: `${pc}%` }} aria-hidden />
                      <span className="relative flex items-center justify-between gap-3">
                        <span className={leading ? 'font-bold text-text-primary' : ''}>{x.label}{leading ? ' · leading' : ''}</span>
                        <b className="tabular-nums">{x.votes} · {pc}%</b>
                      </span>
                    </li>
                  );
                })}
              </ul>
              <div className="flex flex-col gap-2 border-t border-border pt-3">
                <p className="text-caption font-bold text-text-primary">Change it</p>
                <input value={edit.question} onChange={(e) => setEdit({ ...edit, question: e.target.value })} className={field} aria-label="Question" />
                <textarea value={edit.options} onChange={(e) => setEdit({ ...edit, options: e.target.value })} rows={4} className={cn(field, 'py-2')} aria-label="Choices, one per line" />
                <p className="text-[11px] text-text-secondary">One choice per line. Votes stay with the choice on the same line; removing a line removes its votes.</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className={labelText}>Closes on
                    <input type="date" value={edit.closesOn} onChange={(e) => setEdit({ ...edit, closesOn: e.target.value })} className={field} />
                  </label>
                  <label className={labelText}>Members-only code
                    <input value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value })} className={field} />
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => saveEdit.mutate()} disabled={saveEdit.isPending || edit.question.trim().length < 3 || lines(edit.options).length < 2}>{saveEdit.isPending ? 'Saving…' : 'Save changes'}</Button>
                  <Button variant="secondary" onClick={() => closeNow.mutate()} disabled={closeNow.isPending}>{closeNow.isPending ? 'Closing…' : 'Close now and show the winner'}</Button>
                </div>
                {saveEdit.isSuccess && <p className="text-caption text-success">Saved. It is live on the Community page.</p>}
                <ErrorLine error={saveEdit.error || closeNow.error} />
              </div>
            </>
          ) : (
            <p className="text-body text-text-secondary">No poll running. Start one on the right.</p>
          )}
        </Panel>

        <Panel title="Start a new poll" hint="Starting one closes the running poll (its votes and winner are kept).">
          <div className="flex flex-wrap gap-1.5">
            {TEMPLATES.map((t) => (
              <button key={t.name} type="button" onClick={() => { setQuestion(t.question); setOptions(t.options); }} className="rounded-full border border-border px-3 py-1 text-caption font-bold text-text-secondary hover:border-primary/60">
                Fill: {t.name.toLowerCase()}
              </button>
            ))}
          </div>
          <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Question" className={field} />
          <textarea value={options} onChange={(e) => setOptions(e.target.value)} placeholder="One choice per line (2 to 6)" rows={4} className={cn(field, 'py-2')} />
          <div className="grid gap-2 sm:grid-cols-2">
            <label className={labelText}>Closes on
              <input type="date" value={closesOn} onChange={(e) => setClosesOn(e.target.value)} className={field} />
            </label>
            <label className={labelText}>Members-only code (optional)
              <input value={code} onChange={(e) => setCode(e.target.value)} className={field} />
            </label>
          </div>
          <Button onClick={() => newPoll.mutate()} disabled={newPoll.isPending || question.trim().length < 3 || lines(options).length < 2}>
            {newPoll.isPending ? 'Starting…' : 'Start poll'}
          </Button>
          <ErrorLine error={newPoll.error} />
        </Panel>
      </div>

      <Panel title="All polls" hint="Every poll with its winner. Delete only removes test or mistaken polls (and their votes).">
        {!history?.length && <p className="text-body text-text-secondary">No polls yet.</p>}
        <ul className="flex flex-col divide-y divide-border">
          {history?.map((p) => (
            <li key={p.id} className="flex flex-col gap-1.5 py-3 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-1.5">
                  <span className="font-heading text-body-emphasis font-bold text-text-primary">{p.question}</span>
                  <StateBadge state={p.status} />
                </p>
                <p className="text-caption text-text-secondary">
                  Started {when(p.createdAt)} · {p.total} {p.total === 1 ? 'vote' : 'votes'}
                  {p.winner ? ` · ${p.status === 'closed' ? 'winner' : 'leading'}: ${p.winner}` : ''} · {p.options.map((x) => `${x.label} ${x.votes}`).join(', ')}
                </p>
              </div>
              <ConfirmButton onConfirm={() => remove.mutate(p.id)} armed="Delete poll and its votes?">Delete</ConfirmButton>
            </li>
          ))}
        </ul>
        <ErrorLine error={remove.error} />
      </Panel>
    </div>
  );
}
