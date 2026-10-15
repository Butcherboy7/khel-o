'use client';

import { useState, useRef, useEffect } from 'react';
import { Search, MapPin, Monitor, ChevronRight, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { listCafes, cafePath } from '@/lib/api/cafes';
import { queryKeys } from '@/hooks/queries/keys';
import { useDebounce } from '@/hooks/useDebounce';
import type { CafeListItem } from '@/types';

interface SearchSuggestion {
  id: string;
  title: string;
  subtitle: string;
  type: 'city' | 'activity';
  filterValue?: string;
}

/** Cafés shown in the dropdown before the rest are left to the grid below. */
const MAX_CAFE_SUGGESTIONS = 5;
// Extra words people type for an activity whose label doesn't contain them.
const ACTIVITY_SEARCH_ALIASES: Record<string, string> = {
  'pc-gaming': 'pc computer rig',
  console: 'ps5 ps4 playstation xbox switch',
  pool: '8 ball billiards',
};

const words = (text: string) => text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/** Every typed word starts a word of the text ("dg" matches "DG Gaming", not
 *  "Budget"), or the whole query does with spaces dropped, because phone
 *  keyboards turn "Rockstar" into "Rock star". */
function startsWords(text: string, query: string): boolean {
  const qWords = words(query);
  if (qWords.length === 0) return false;
  const tWords = words(text);
  if (qWords.every((q) => tWords.some((t) => t.startsWith(q)))) return true;
  const compact = qWords.join('');
  return tWords.some((_, i) => tWords.slice(i).join('').startsWith(compact));
}

function cafeArea(cafe: CafeListItem): string {
  return [cafe.addressLine2, cafe.city].filter(Boolean).join(', ');
}

interface SearchBarProps {
  value: string;
  onChange: (val: string) => void;
  onSelectCity: (city: string) => void;
  /** Activity key chosen from a suggestion. */
  onSelectTag: (activityKey: string) => void;
  cities: string[];
  /** Activities on offer (from /cafes/activities) — never a hardcoded list. */
  activities?: { key: string; label: string }[];
}

export function SearchBarWithSuggestions({ value, onChange, onSelectCity, onSelectTag, cities, activities = [] }: SearchBarProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const debouncedValue = useDebounce(value.trim(), 250);

  // Real cafés from the same search the grid uses, across every city, so a
  // name always finds its café whatever city or activity is picked.
  const cafeParams = { query: debouncedValue, limit: 20 };
  const { data: cafeResults } = useQuery({
    queryKey: queryKeys.cafes.list(cafeParams),
    queryFn: () => listCafes(cafeParams),
    enabled: debouncedValue.length > 0,
    staleTime: 60_000,
  });
  const cafeSuggestions: CafeListItem[] = value.trim()
    ? (cafeResults?.items ?? [])
        .filter((c) => startsWords(c.name, value) || startsWords(c.addressLine2 ?? '', value))
        // Name matches before area matches.
        .sort((a, b) => Number(startsWords(b.name, value)) - Number(startsWords(a.name, value)))
        .slice(0, MAX_CAFE_SUGGESTIONS)
    : [];
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const suggestions: SearchSuggestion[] = [];

  if (value.trim()) {
    const queryLower = value.toLowerCase();

    // City matches
    cities.filter((c) => startsWords(c, value)).forEach((c) => {
      suggestions.push({
        id: `city-${c}`,
        title: c,
        subtitle: 'City',
        type: 'city',
        filterValue: c,
      });
    });

    // Activity matches (PC, console, snooker, ...) — not everyone is here for a rig
    activities
      .filter((a) => startsWords(`${a.label} ${a.key} ${ACTIVITY_SEARCH_ALIASES[a.key] ?? ''}`, value))
      .forEach((a) => {
        suggestions.push({
          id: `activity-${a.key}`,
          title: a.label,
          subtitle: 'Activity',
          type: 'activity',
          filterValue: a.key,
        });
      });
  }

  const handleSelectSuggestion = (s: SearchSuggestion) => {
    if (s.type === 'city') {
      onSelectCity(s.title);
      onChange('');
    } else if (s.type === 'activity') {
      onSelectTag(s.filterValue ?? s.title);
      onChange('');
    }
    setIsOpen(false);
  };

  const openCafe = (cafe: CafeListItem) => {
    setIsOpen(false);
    router.push(cafePath(cafe));
  };

  return (
    // Not `relative`: it sits inside the home page's search pill, and the
    // suggestions panel positions against that whole pill, not this input.
    <div ref={containerRef} className="flex-1 min-w-0">
      <div className="relative flex items-center">
        <Search className="pointer-events-none absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
        <input
          type="text"
          aria-label="Search cafés, cities, activities or games"
          placeholder="Search games or cafés"
          value={value}
          onFocus={() => setIsOpen(true)}
          onChange={(e) => {
            onChange(e.target.value);
            setIsOpen(true);
          }}
          className="h-11 w-full bg-transparent pl-6 pr-7 text-body text-text-primary placeholder:text-text-secondary/70 focus:outline-none"
        />
        {value && (
          <button
            onClick={() => {
              onChange('');
              setIsOpen(false);
            }}
            aria-label="Clear search"
            className="absolute right-0 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary p-1"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Dropdown — only when there's something to suggest. Search itself
          is already live against the café grid below, which owns the result
          count and the empty state. */}
      {isOpen && (cafeSuggestions.length > 0 || suggestions.length > 0) && (
        <div className="absolute top-[calc(100%+8px)] left-0 right-0 z-overlay rounded-3xl bg-card border border-border/80 shadow-overlay p-2 flex flex-col gap-0.5 max-h-[22rem] overflow-y-auto animate-in fade-in">
          {cafeSuggestions.map((cafe) => {
            const photo = cafe.photos?.[0]?.url;
            return (
              <button
                key={cafe.id}
                onClick={() => openCafe(cafe)}
                className="flex items-center gap-3 p-2 rounded-2xl hover:bg-surface text-left transition-colors"
              >
                <div className="h-11 w-11 flex-shrink-0 overflow-hidden rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                  {photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photo} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <MapPin className="h-4 w-4" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-heading text-body font-semibold text-text-primary truncate">{cafe.name}</div>
                  <div className="text-caption text-text-secondary truncate">{cafeArea(cafe)}</div>
                </div>
                <span
                  className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                    cafe.isLeadListing ? 'bg-surface text-text-secondary' : 'bg-primary/10 text-primary'
                  }`}
                >
                  {cafe.isLeadListing ? 'Booking soon' : 'Book now'}
                </span>
                <ChevronRight className="h-4 w-4 flex-shrink-0 text-text-secondary" />
              </button>
            );
          })}
          {suggestions.map((s) => (
            <button
              key={s.id}
              onClick={() => handleSelectSuggestion(s)}
              className="flex items-center gap-3 p-2 rounded-2xl hover:bg-surface text-left transition-colors"
            >
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                {s.type === 'activity' ? <Monitor className="h-4 w-4" /> : <MapPin className="h-4 w-4" />}
              </div>
              <div>
                <div className="font-heading text-body font-semibold text-text-primary">{s.title}</div>
                <div className="text-caption text-text-secondary">{s.subtitle}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
