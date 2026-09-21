'use client';

import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/Input';
import { searchLocations, type LocationResult } from '@/lib/api/locations';

export interface SelectedLocation {
  /** 0 means "typed via Other" — not a row in the shared locations table. */
  id: number;
  name: string;
  state: string;
  district: string | null;
  pincode: string | null;
}

interface LocationSearchInputProps {
  value: SelectedLocation | null;
  onChange: (location: SelectedLocation) => void;
  onClear?: () => void;
  state: string;
  error?: string;
  label?: string;
}

// Searches locations scoped to a single, already-chosen state (state
// selection now lives one level up in the onboarding wizard — see
// (owner)/owner/onboarding/page.tsx Step 1 — and is locked before this
// component is ever rendered), so "Add a new place" just reuses `state`
// instead of asking for it again.
export function LocationSearchInput({ value, onChange, onClear, state, error, label = 'City / Town' }: LocationSearchInputProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LocationResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Click-away close, matching the containerRef + mousedown-listener pattern
  // already used by SearchBarWithSuggestions.tsx and ExploreClient.tsx's
  // dropdowns elsewhere in this codebase. Needed because the results
  // dropdown now opens on focus (before any typing, for the popular-cities
  // prefetch) — previously an empty query kept isOpen=true but rendered
  // nothing, so a stray no-close bug was masked by the render guard; now
  // that the guard is gone, clicking away must actually close it.
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen || query.trim().length < 1) {
      setResults([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await searchLocations(query.trim(), state);
        setResults(res);
      } catch {
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, isOpen, state]);

  const selectLocation = (loc: LocationResult) => {
    onChange(loc);
    setQuery('');
    setIsOpen(false);
    setIsAdding(false);
  };

  // "Other" never writes to the shared locations table — a typo or a
  // one-off village name typed here would otherwise pollute every future
  // owner's search results. It only sets this café's own city/state.
  const handleCreate = () => {
    setAddError('');
    selectLocation({ id: 0, name: query.trim(), state, district: null, pincode: null });
  };

  if (value && !isOpen) {
    return (
      <div className="flex flex-col gap-1.5">
        {label && <label className="text-h4 text-text-primary">{label}</label>}
        <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
          <div>
            <p className="text-body text-text-primary">
              {value.name}, {value.state}
            </p>
            {(value.district || value.pincode) && (
              <p className="text-caption text-text-secondary">
                {[value.district, value.pincode].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              onClear?.();
              setIsOpen(true);
              setQuery('');
            }}
            className="text-caption font-semibold text-primary"
          >
            Change
          </button>
        </div>
        {error && <p className="text-caption text-error" role="alert">{error}</p>}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative flex flex-col gap-1.5">
      <Input
        label={label}
        placeholder="Search for your city, town, or village..."
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setIsOpen(true);
          setIsAdding(false);
        }}
        onFocus={async () => {
          setIsOpen(true);
          // Popular-cities prefetch: on first focus, before the owner has
          // typed anything, show this state's locations (ordered by name —
          // Task 2's seed puts state capitals/major metros first only
          // incidentally, this isn't a ranking system) so there's something
          // useful to tap instead of a blank dropdown.
          if (query.trim().length === 0 && results.length === 0) {
            setIsSearching(true);
            try {
              setResults(await searchLocations('', state));
            } catch {
              setResults([]);
            } finally {
              setIsSearching(false);
            }
          }
        }}
        error={error}
      />

      {isOpen && (
        <div className="absolute top-full z-10 mt-1 w-full rounded-xl border border-border bg-card shadow-lg max-h-72 overflow-y-auto">
          {isSearching && (
            <p className="px-4 py-3 text-caption text-text-secondary">Searching...</p>
          )}

          {!isSearching &&
            results.map((loc) => (
              <button
                key={loc.id}
                type="button"
                onClick={() => selectLocation(loc)}
                className="flex w-full flex-col items-start px-4 py-2.5 text-left hover:bg-surface transition-colors"
              >
                <span className="text-body text-text-primary">{loc.name}, {loc.state}</span>
                {(loc.district || loc.pincode) && (
                  <span className="text-caption text-text-secondary">
                    {[loc.district, loc.pincode].filter(Boolean).join(' · ')}
                  </span>
                )}
              </button>
            ))}

          {!isSearching && !isAdding && query.trim().length > 0 && results.length === 0 && (
            <button
              type="button"
              onClick={() => setIsAdding(true)}
              className="flex w-full items-center px-4 py-2.5 text-left text-caption font-semibold text-primary hover:bg-surface transition-colors border-t border-border"
            >
              Other — city not listed
            </button>
          )}

          {isAdding && (
            <div className="flex flex-col gap-2 border-t border-border p-4">
              <p className="text-caption font-semibold text-text-primary">
                Add &quot;{query.trim()}&quot; in {state}?
              </p>
              {addError && <p className="text-caption text-error" role="alert">{addError}</p>}
              <button
                type="button"
                onClick={handleCreate}
                className="mt-1 rounded-xl bg-primary px-4 py-2 text-caption font-semibold text-white"
              >
                Use &quot;{query.trim()}&quot;
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
