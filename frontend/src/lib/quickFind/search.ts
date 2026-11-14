/**
 * Ranks registry items for a query. Deterministic and local: words, everyday
 * synonyms (text.ts concepts), typo tolerance, and a small lift for what this
 * owner uses often. No network, no model.
 */
import { conceptsOf, normalize, tokenMatch, tokens } from './text';
import type { ParsedQuery } from './parse';
import type { QFGroup, QFItem } from './registry';
import { usageBoost, type QuickFindMemory } from './history';

export interface QFResult {
  item: QFItem;
  score: number;
}

export interface QFSection {
  key: 'best' | QFGroup;
  label: string;
  results: QFResult[];
}

export const GROUP_ORDER: { key: QFGroup; label: string }[] = [
  { key: 'action', label: 'Quick actions' },
  { key: 'bookings', label: 'Bookings & events' },
  { key: 'setups', label: 'Gaming setups' },
  { key: 'settings', label: 'Settings' },
  { key: 'pages', label: 'Pages' },
];

interface Indexed {
  title: string[];
  keys: string[];
  desc: string[];
  concepts: Set<string>;
  titleNorm: string;
  keyPhrases: string[];
}

const cache = new WeakMap<QFItem, Indexed>();

function index(item: QFItem): Indexed {
  const hit = cache.get(item);
  if (hit) return hit;
  const title = tokens(item.title);
  const keyPhrases = item.keywords.map(normalize).filter(Boolean);
  const keys = Array.from(new Set(keyPhrases.flatMap((k) => k.split(' '))));
  const desc = tokens(`${item.description} ${item.where}`);
  const concepts = new Set<string>();
  for (const w of [...title, ...keys]) conceptsOf(w).forEach((c) => concepts.add(c));
  const out = { title, keys, desc, concepts, titleNorm: normalize(item.title), keyPhrases };
  cache.set(item, out);
  return out;
}

function best(typed: string, words: string[]): number {
  let b = 0;
  for (const w of words) {
    const s = tokenMatch(typed, w);
    if (s > b) b = s;
    if (b === 1) break;
  }
  return b;
}

/** 0 = no match. Roughly 0..1.5 for real matches. */
export function scoreItem(item: QFItem, q: ParsedQuery): number {
  const terms = q.free.length ? q.free : q.tokens;
  if (!terms.length) return 0;
  const ix = index(item);
  let sum = 0;
  let matched = 0;
  let titleHits = 0;
  for (const t of terms) {
    const inTitle = best(t, ix.title);
    const inKeys = best(t, ix.keys) * 0.82;
    const inDesc = best(t, ix.desc) * 0.45;
    const concept = conceptsOf(t).some((c) => ix.concepts.has(c)) ? 0.62 : 0;
    const s = Math.max(inTitle, inKeys, inDesc, concept);
    if (inTitle >= 0.7) titleHits++;
    if (s > 0) matched++;
    sum += s;
  }
  if (!matched) return 0;
  const coverage = matched / terms.length;
  // Most of what was typed has to fit; one stray word is forgiven in longer queries.
  if (terms.length >= 2 && coverage < 0.5) return 0;
  let score = (sum / terms.length) * (0.35 + 0.65 * coverage * coverage);
  if (titleHits === terms.length) score += 0.12;
  const phrase = terms.join(' ');
  if (phrase.length >= 3) {
    if (ix.titleNorm.startsWith(phrase)) score += 0.25;
    else if (ix.titleNorm.includes(phrase)) score += 0.15;
    else if (ix.keyPhrases.some((k) => k === phrase || k.startsWith(phrase))) score += 0.18;
  }
  return score;
}

/** Ranked, de-duplicated results (one per destination). */
export function rank(items: QFItem[], q: ParsedQuery, mem?: QuickFindMemory): QFResult[] {
  const scored: QFResult[] = [];
  for (const item of items) {
    const base = scoreItem(item, q);
    if (base <= 0) continue;
    const score = base + (item.boost ?? 0) + (mem ? usageBoost(mem, item.id) : 0);
    scored.push({ item, score });
  }
  scored.sort((a, b) => b.score - a.score || a.item.title.length - b.item.title.length);
  const top = scored[0]?.score ?? 0;
  const seen = new Set<string>();
  const out: QFResult[] = [];
  for (const r of scored) {
    // Weak tails are noise; keep what is at least a third as good as the best.
    if (r.score < top * 0.34) break;
    const key = r.item.run ? `run:${r.item.run}` : r.item.href;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/** Best match on its own, then the rest by kind, a few per group. */
export function sections(results: QFResult[], perGroup = 5, total = 18): QFSection[] {
  if (!results.length) return [];
  const [first, ...rest] = results;
  const out: QFSection[] = [{ key: 'best', label: 'Best match', results: [first] }];
  let count = 1;
  for (const g of GROUP_ORDER) {
    const list = rest.filter((r) => r.item.group === g.key).slice(0, perGroup);
    const room = Math.max(0, total - count);
    if (list.length && room) {
      out.push({ key: g.key, label: g.label, results: list.slice(0, room) });
      count += Math.min(list.length, room);
    }
  }
  return out;
}

/** Character ranges of `title` to highlight for the words typed. */
export function highlight(title: string, q: ParsedQuery): [number, number][] {
  const typed = q.tokens.filter((t) => t.length >= 1);
  if (!typed.length) return [];
  const ranges: [number, number][] = [];
  const re = /[A-Za-z0-9₹]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(title))) {
    const word = m[0].toLowerCase();
    let len = 0;
    for (const t of typed) {
      if (word === t) len = Math.max(len, word.length);
      else if (t.length >= 2 && word.startsWith(t) && !/\d/.test(t)) len = Math.max(len, t.length);
      else if (t.length >= 4 && tokenMatch(t, word) >= 0.7) len = Math.max(len, word.length);
    }
    if (len) ranges.push([m.index, m.index + len]);
  }
  return ranges;
}
