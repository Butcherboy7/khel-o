'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { HardwareTier } from '@/types';

export type CompareRow = { id: string; name: string; value: string; rank: number | null };

const num = (s: unknown): number | null => {
  const m = String(s ?? '').match(/[\d.]+/);
  return m ? Number(m[0]) : null;
};

/** Best first. `high` = a bigger number is better. Rows with no number keep their order, at the end. */
export function rankRows(rows: CompareRow[], high: boolean): CompareRow[] {
  const ranked = rows
    .filter((r) => r.rank != null)
    .sort((a, b) => (high ? (b.rank as number) - (a.rank as number) : (a.rank as number) - (b.rank as number)));
  return [...ranked, ...rows.filter((r) => r.rank == null)];
}

function Panel({ options, value, onChange, rows, high, note }: {
  options: { key: string; label: string }[];
  value: string;
  onChange: (k: string) => void;
  rows: CompareRow[];
  high: boolean;
  note?: string;
}) {
  const sorted = rankRows(rows, high);
  const bestRank = sorted.find((r) => r.rank != null)?.rank ?? null;
  const allSame = sorted.every((r) => r.rank === bestRank);
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border/80 bg-card p-3">
      <label className="flex items-center gap-2 text-caption font-semibold text-text-secondary">
        Compare by
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 min-w-0 rounded-xl border border-border bg-surface px-2 text-caption font-semibold text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
      </label>
      <ul className="flex flex-col divide-y divide-border/60">
        {sorted.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-caption">
            <span className="min-w-0 font-semibold text-text-primary">{r.name}</span>
            <span className="flex flex-shrink-0 items-center gap-1.5 text-text-primary">
              {r.value}
              {!allSame && r.rank != null && r.rank === bestRank && (
                <span className="rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-bold text-success">Best</span>
              )}
            </span>
          </li>
        ))}
      </ul>
      {note && <p className="text-[11px] text-text-tertiary">{note}</p>}
    </div>
  );
}

function Toggle({ open, onClick, openLabel, closedLabel }: { open: boolean; onClick: () => void; openLabel: string; closedLabel: string }) {
  return (
    <button type="button" onClick={onClick} aria-expanded={open} className="flex items-center gap-1.5 self-start text-caption font-semibold text-primary-dark hover:underline">
      {open ? openLabel : closedLabel}
      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
  );
}

const PC_OPTIONS = [
  { key: 'gpu', label: 'Graphics card' },
  { key: 'ram', label: 'Memory (RAM)' },
  { key: 'hz', label: 'Screen speed' },
  { key: 'monitor', label: 'Monitor' },
  { key: 'price', label: 'Price' },
];

/** Only for PCs: pick one thing (graphics card, RAM, screen speed...) and see every PC on it. */
export function PcCompare({ tiers, price }: { tiers: HardwareTier[]; price: (t: HardwareTier) => string }) {
  const [open, setOpen] = useState(false);
  const [by, setBy] = useState('gpu');
  const pcs = tiers.filter((t) => Boolean(t.specs?.gpu));
  if (pcs.length < 2) return null;
  const rows: CompareRow[] = pcs.map((t) => {
    switch (by) {
      case 'ram': return { id: t.id, name: t.name, value: String(t.specs?.ram || '-'), rank: num(t.specs?.ram) };
      case 'hz': return { id: t.id, name: t.name, value: t.refreshRateHz ? `${t.refreshRateHz} Hz` : '-', rank: t.refreshRateHz ?? null };
      case 'monitor': return { id: t.id, name: t.name, value: String(t.specs?.monitor || '-'), rank: null };
      case 'price': return { id: t.id, name: t.name, value: price(t), rank: t.pricePerHour };
      default: return { id: t.id, name: t.name, value: String(t.specs?.gpu || '-'), rank: t.performanceRating ?? null };
    }
  });
  return (
    <div className="flex flex-col gap-2">
      <Toggle open={open} onClick={() => setOpen((v) => !v)} openLabel="Hide PC comparison" closedLabel="Compare PCs" />
      {open && <Panel options={PC_OPTIONS} value={by} onChange={setBy} rows={rows} high={by !== 'price'} />}
    </div>
  );
}

/** Only when a café has two or more consoles we recognise: how they differ, in plain facts. */
export function ConsoleCompare({ tiers }: { tiers: HardwareTier[] }) {
  const [open, setOpen] = useState(false);
  const [by, setBy] = useState('power');
  const consoles = tiers.filter((t) => t.consoleInfo);
  if (consoles.length < 2) return null;
  const games = new Map<string, string>();
  consoles.forEach((t) => t.expectedFps?.forEach((g) => games.set(g.key, g.game)));
  const options = [
    { key: 'power', label: 'Power' },
    { key: 'picture', label: 'Picture quality' },
    ...Array.from(games.entries()).map(([k, g]) => ({ key: `fps:${k}`, label: `${g} speed` })),
  ];
  const rows: CompareRow[] = consoles.map((t) => {
    const c = t.consoleInfo!;
    if (by === 'picture') return { id: t.id, name: t.name, value: c.resolution, rank: c.resolution.startsWith('4K') ? 2160 : num(c.resolution) };
    if (by.startsWith('fps:')) {
      const g = t.expectedFps?.find((x) => x.key === by.slice(4));
      return { id: t.id, name: t.name, value: g ? `~${g.fps} FPS` : 'Not listed', rank: g?.fps ?? null };
    }
    return { id: t.id, name: t.name, value: c.tflops ? `${c.tflops} teraflops` : 'Handheld class', rank: c.tflops ?? 0 };
  });
  const seen = new Set<string>();
  const blurbs = consoles.filter((t) => !seen.has(t.consoleInfo!.key) && seen.add(t.consoleInfo!.key));
  return (
    <div className="flex flex-col gap-2">
      <Toggle open={open} onClick={() => setOpen((v) => !v)} openLabel="Hide console differences" closedLabel="How these consoles differ" />
      {open && (
        <>
          <Panel
            options={options}
            value={by}
            onChange={setBy}
            rows={rows}
            high
            note="Rough figures for each console's usual settings, not measured at this café. Teraflops is raw graphics power: higher is faster."
          />
          <ul className="flex flex-col gap-1.5 text-caption text-text-secondary">
            {blurbs.map((t) => (
              <li key={t.id}><span className="font-semibold text-text-primary">{t.consoleInfo!.label}:</span> {t.consoleInfo!.blurb}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
