'use client';

import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/Input';
import { INDIAN_STATES } from '@/constants/states';
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
  error?: string;
  label?: string;
}

export function LocationSearchInput({ value, onChange, error, label = 'City / Town' }: LocationSearchInputProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LocationResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [newState, setNewState] = useState('');
  const [addError, setAddError] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isOpen || query.trim().length < 1) {
      setResults([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await searchLocations(query.trim());
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
  }, [query, isOpen]);

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
    if (!newState) {
      setAddError('Please select a state.');
      return;
    }
    setAddError('');
    selectLocation({ id: 0, name: query.trim(), state: newState, district: null, pincode: null });
    setNewState('');
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
    <div className="relative flex flex-col gap-1.5">
      <Input
        label={label}
        placeholder="Search for your city, town, or village..."
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setIsOpen(true);
          setIsAdding(false);
        }}
        onFocus={() => setIsOpen(true)}
        error={error}
      />

      {isOpen && query.trim().length > 0 && (
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

          {!isSearching && !isAdding && results.length === 0 && (
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
              <label className="text-caption font-semibold text-text-primary">
                Select the state for &quot;{query.trim()}&quot;
              </label>
              <select
                value={newState}
                onChange={(e) => setNewState(e.target.value)}
                className="h-10 w-full rounded-xl border border-border bg-card px-3 text-body text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="">Select State</option>
                {INDIAN_STATES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
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
