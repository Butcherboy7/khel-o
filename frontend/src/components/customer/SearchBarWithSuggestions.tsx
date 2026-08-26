'use client';

import { useState, useRef, useEffect } from 'react';
import { Search, MapPin, Monitor, Gamepad2, Sparkles, X } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface SearchSuggestion {
  id: string;
  title: string;
  subtitle: string;
  type: 'cafe' | 'city' | 'game' | 'tier';
  cafeId?: string;
  filterValue?: string;
}

const COMMON_GAMES = ['Valorant', 'Counter-Strike 2', 'GTA V', 'EA FC 24', 'Cyberpunk 2077', 'Apex Legends'];
const HARDWARE_TIERS = ['RTX 4090', 'RTX 4080 Super', 'RTX 4070', 'PS5 Console Lounge', 'GTX 1660 Budget'];

interface SearchBarProps {
  value: string;
  onChange: (val: string) => void;
  onSelectCity: (city: string) => void;
  onSelectTag: (tag: string) => void;
}

export function SearchBarWithSuggestions({ value, onChange, onSelectCity, onSelectTag }: SearchBarProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
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

    // Game matches
    COMMON_GAMES.filter((g) => g.toLowerCase().includes(queryLower)).forEach((g) => {
      suggestions.push({
        id: `game-${g}`,
        title: g,
        subtitle: 'Game Title',
        type: 'game',
        filterValue: g,
      });
    });

    // Hardware matches
    HARDWARE_TIERS.filter((t) => t.toLowerCase().includes(queryLower)).forEach((t) => {
      suggestions.push({
        id: `tier-${t}`,
        title: t,
        subtitle: 'Hardware Spec Tier',
        type: 'tier',
        filterValue: t,
      });
    });
  }

  const handleSelectSuggestion = (s: SearchSuggestion) => {
    if (s.type === 'game' || s.type === 'tier') {
      onSelectTag('PC Gaming');
      onChange(s.title);
    } else if (s.type === 'city') {
      onSelectCity(s.title);
    } else if (s.cafeId) {
      router.push(`/cafe/${s.cafeId}`);
    }
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative flex-1">
      <div className="relative flex items-center">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
        <input
          type="text"
          placeholder="Search cafés, areas, games or hardware (e.g. Valorant, RTX 4080)"
          value={value}
          onFocus={() => setIsOpen(true)}
          onChange={(e) => {
            onChange(e.target.value);
            setIsOpen(true);
          }}
          className="h-12 w-full rounded-full border border-border bg-card pl-11 pr-10 text-body text-text-primary placeholder:text-text-secondary/60 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary shadow-card transition-all"
        />
        {value && (
          <button
            onClick={() => {
              onChange('');
              setIsOpen(false);
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary p-1"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Dropdown Suggestions — only rendered when there's something to
          suggest. Search itself is already live (debounced against the
          café list below), so there's nothing for the dropdown to say
          when no game/tier keyword matches: the actual result count and
          empty state are handled by the café grid, not duplicated here. */}
      {isOpen && suggestions.length > 0 && (
        <div className="absolute top-14 left-0 right-0 z-dropdown rounded-3xl bg-card border border-border/80 shadow-overlay p-3 flex flex-col gap-1 max-h-72 overflow-y-auto animate-in fade-in">
          {suggestions.map((s) => (
              <button
                key={s.id}
                onClick={() => handleSelectSuggestion(s)}
                className="flex items-center justify-between p-3 rounded-2xl hover:bg-surface text-left transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    {s.type === 'game' ? (
                      <Gamepad2 className="h-4 w-4" />
                    ) : s.type === 'tier' ? (
                      <Monitor className="h-4 w-4" />
                    ) : (
                      <MapPin className="h-4 w-4" />
                    )}
                  </div>
                  <div>
                    <div className="font-heading text-body font-semibold text-text-primary">{s.title}</div>
                    <div className="text-caption text-text-secondary">{s.subtitle}</div>
                  </div>
                </div>
                <Sparkles className="h-4 w-4 text-accent/60" />
              </button>
          ))}
        </div>
      )}
    </div>
  );
}
