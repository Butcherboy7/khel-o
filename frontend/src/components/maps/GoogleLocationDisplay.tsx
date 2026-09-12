'use client';

import { MapPin } from 'lucide-react';

interface LocationDisplayProps {
  addressLine1: string;
  city: string;
  googleMapsUrl?: string | null;
}

// Deliberately does not load the Google Maps JavaScript API, Places API, or
// any geocoding — this just links out to the URL the café owner pasted from
// Google Maps' own Share button. See docs/superpowers/specs for the
// no-map-rendering decision (billing).
export function GoogleLocationDisplay({ addressLine1, city, googleMapsUrl }: LocationDisplayProps) {
  return (
    <div className="rounded-2xl bg-surface border border-border p-4 flex flex-col gap-3">
      <div className="flex items-start gap-2 text-body text-text-secondary">
        <MapPin className="h-5 w-5 flex-shrink-0 text-text-secondary mt-0.5" />
        <span>{addressLine1}, {city}</span>
      </div>

      {googleMapsUrl && (
        <a
          href={googleMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 self-start rounded-xl border border-border bg-card px-4 py-2.5 text-body font-semibold text-text-primary hover:bg-surface-hover transition-colors"
        >
          <GoogleMapsGlyph />
          <span>Show in Map</span>
        </a>
      )}
    </div>
  );
}

// Google's multicolor pin mark, inlined as SVG — matches the "Show in Map"
// pill from Google Maps' own share cards, no external asset/API call.
function GoogleMapsGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#1a73e8" d="M12 2C7.86 2 4.5 5.36 4.5 9.5c0 5.25 6.44 11.34 7 11.86.28.26.72.26 1 0 .56-.52 7-6.61 7-11.86C19.5 5.36 16.14 2 12 2z" />
      <circle cx="12" cy="9.5" r="3.2" fill="#fff" />
    </svg>
  );
}
