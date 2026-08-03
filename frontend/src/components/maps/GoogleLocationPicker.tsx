'use client';

import { GoogleMap, useJsApiLoader, MarkerF } from '@react-google-maps/api';
import { useCallback, useState } from 'react';
import { MapPin } from 'lucide-react';

const mapContainerStyle = {
  width: '100%',
  height: '100%',
  borderRadius: '1rem',
};

const defaultCenter = {
  lat: 12.9716, // Bengaluru
  lng: 77.5946,
};

interface LocationPickerProps {
  initialLat?: number;
  initialLng?: number;
  onLocationSelect: (location: { lat: number; lng: number; address?: string }) => void;
}

export function GoogleLocationPicker({
  initialLat,
  initialLng,
  onLocationSelect,
}: LocationPickerProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: apiKey,
  });

  const [position, setPosition] = useState<{ lat: number; lng: number }>({
    lat: initialLat || defaultCenter.lat,
    lng: initialLng || defaultCenter.lng,
  });

  const handleMapClick = useCallback(
    (e: google.maps.MapMouseEvent) => {
      if (e.latLng) {
        const newLat = e.latLng.lat();
        const newLng = e.latLng.lng();
        const newPos = { lat: newLat, lng: newLng };
        setPosition(newPos);
        onLocationSelect(newPos);
      }
    },
    [onLocationSelect]
  );

  const handleMarkerDragEnd = useCallback(
    (e: google.maps.MapMouseEvent) => {
      if (e.latLng) {
        const newLat = e.latLng.lat();
        const newLng = e.latLng.lng();
        const newPos = { lat: newLat, lng: newLng };
        setPosition(newPos);
        onLocationSelect(newPos);
      }
    },
    [onLocationSelect]
  );

  if (loadError) {
    return (
      <div className="h-64 w-full rounded-2xl bg-surface border border-border p-4 flex flex-col items-center justify-center text-center text-caption text-text-secondary gap-2">
        <MapPin className="h-6 w-6 text-error" />
        <span>Failed to load Google Maps script. Check API Key configuration.</span>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="h-64 w-full rounded-2xl bg-surface border border-border flex items-center justify-center text-caption text-text-secondary animate-pulse">
        Loading Google Maps...
      </div>
    );
  }

  return (
    <div className="relative h-64 w-full rounded-2xl overflow-hidden border border-border shadow-card">
      <GoogleMap
        mapContainerStyle={mapContainerStyle}
        center={position}
        zoom={13}
        onClick={handleMapClick}
        options={{
          disableDefaultUI: false,
          zoomControl: true,
        }}
      >
        <MarkerF position={position} draggable onDragEnd={handleMarkerDragEnd} />
      </GoogleMap>
      <div className="absolute bottom-2 left-2 bg-black/70 text-white text-xs px-3 py-1 rounded-full backdrop-blur-sm">
        Lat: {position.lat.toFixed(4)}, Lng: {position.lng.toFixed(4)} (Click or drag pin)
      </div>
    </div>
  );
}
