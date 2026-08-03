'use client';

import { GoogleMap, useJsApiLoader, MarkerF } from '@react-google-maps/api';
import { MapPin } from 'lucide-react';

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

  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-display-script',
    googleMapsApiKey: apiKey,
  });

  const center = {
    lat: lat || defaultCenter.lat,
    lng: lng || defaultCenter.lng,
  };

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
