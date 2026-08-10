'use client';

import { GoogleMap, useJsApiLoader, MarkerF } from '@react-google-maps/api';
import { MapPin, ExternalLink } from 'lucide-react';

const mapContainerStyle = {
  width: '100%',
  height: '100%',
  borderRadius: '1rem',
};

const defaultCenter = {
  lat: 12.9716,
  lng: 77.5946,
};

interface LocationDisplayProps {
  lat?: number | null;
  lng?: number | null;
  venueName: string;
}

export function GoogleLocationDisplay({ lat, lng, venueName }: LocationDisplayProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

  const isAlreadyLoaded = typeof window !== 'undefined' && typeof window.google?.maps?.Map === 'function';

  const { isLoaded: isJsLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: apiKey,
  });

  const isLoaded = isJsLoaded || isAlreadyLoaded;

  const center = {
    lat: lat || defaultCenter.lat,
    lng: lng || defaultCenter.lng,
  };

  // If no Google Maps API key is configured in env, render clean interactive location card fallback
  if (!apiKey) {
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venueName)}&query_place_id=loc:${center.lat},${center.lng}`;
    return (
      <div className="relative h-44 w-full rounded-2xl bg-gradient-to-br from-surface to-card border border-border p-4 flex flex-col items-center justify-center text-center gap-2.5 shadow-card group">
        <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
          <MapPin className="h-5 w-5" />
        </div>
        <div>
          <h4 className="font-heading text-body font-bold text-text-primary">{venueName}</h4>
          <p className="text-caption text-text-secondary">Coordinates: {center.lat.toFixed(4)}, {center.lng.toFixed(4)}</p>
        </div>
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-caption font-bold text-primary hover:underline bg-primary/10 px-3 py-1.5 rounded-full transition-colors"
        >
          <span>View on Google Maps</span>
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="h-44 w-full rounded-2xl bg-surface border border-border p-4 flex flex-col items-center justify-center text-center text-caption text-text-secondary gap-2">
        <MapPin className="h-5 w-5 text-error" />
        <span>Failed to load map view.</span>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="h-44 w-full rounded-2xl bg-surface border border-border flex items-center justify-center text-caption text-text-secondary animate-pulse">
        Loading interactive map...
      </div>
    );
  }

  return (
    <div className="relative h-44 w-full rounded-2xl overflow-hidden border border-border shadow-card">
      <GoogleMap
        mapContainerStyle={mapContainerStyle}
        center={center}
        zoom={15}
        options={{
          disableDefaultUI: true,
          zoomControl: true,
        }}
      >
        <MarkerF position={center} title={venueName} />
      </GoogleMap>
    </div>
  );
}
