'use client';

import { GoogleMap, useJsApiLoader, MarkerF } from '@react-google-maps/api';
import { useCallback, useState, useRef, useEffect } from 'react';
import { MapPin, Search } from 'lucide-react';
import { GOOGLE_MAPS_SCRIPT_ID, GOOGLE_MAPS_LIBRARIES } from './mapsConfig';
import { getPublicEnv } from '@/lib/runtimeEnv';

const mapContainerStyle = {
  width: '100%',
  height: '100%',
  borderRadius: '1rem',
};

const defaultCenter = {
  lat: 12.9716, // Bengaluru
  lng: 77.5946,
};

const MAPS_ERROR_HINTS: Record<string, string> = {
  BillingNotEnabledMapError:
    'Billing isn\'t enabled on the Google Cloud project for this API key.',
  RefererNotAllowedMapError:
    'This site\'s origin isn\'t in the key\'s HTTP referrer allowlist.',
  ApiNotActivatedMapError:
    'The Maps JavaScript API isn\'t enabled for this project.',
  InvalidKeyMapError: 'The API key is invalid.',
  MissingKeyMapError: 'No API key was provided.',
};

interface LocationPickerProps {
  initialLat?: number;
  initialLng?: number;
  onLocationSelect: (location: { lat: number; lng: number; addressLine1?: string; city?: string; state?: string; pincode?: string }) => void;
}

export function GoogleLocationPicker({
  initialLat,
  initialLng,
  onLocationSelect,
}: LocationPickerProps) {
  const apiKey = getPublicEnv('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY');
  const inputRef = useRef<HTMLInputElement | null>(null);

  const isAlreadyLoaded = typeof window !== 'undefined' && typeof window.google?.maps?.Map === 'function';

  const { isLoaded: isJsLoaded, loadError } = useJsApiLoader({
    id: GOOGLE_MAPS_SCRIPT_ID,
    googleMapsApiKey: apiKey,
    libraries: GOOGLE_MAPS_LIBRARIES,
  });

  const isLoaded = isJsLoaded || isAlreadyLoaded;

  const [position, setPosition] = useState<{ lat: number; lng: number }>({
    lat: initialLat || defaultCenter.lat,
    lng: initialLng || defaultCenter.lng,
  });

  // Google's Maps JS SDK reports auth/config failures (bad key, referrer not
  // allowlisted, API not enabled, billing disabled) neither by rejecting the
  // script load promise (useJsApiLoader's loadError misses them) nor via the
  // legacy window.gm_authFailure callback (only invoked for a subset of error
  // classes, not e.g. BillingNotEnabledMapError) — it only console.errors and
  // paints its own "can't load Google Maps correctly" overlay. Intercepting
  // console.error while this component is mounted is the only way to surface
  // which specific error occurred.
  const [authErrorCode, setAuthErrorCode] = useState<string | null>(null);
  useEffect(() => {
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      const message = args.map(String).join(' ');
      const match = message.match(/Google Maps JavaScript API error: (\w+)/);
      if (match) setAuthErrorCode(match[1]);
      originalError(...args);
    };
    return () => {
      console.error = originalError;
    };
  }, []);

  // Shared with the Places Autocomplete listener below and with the
  // reverse-geocode path so a map click/drag reports the same
  // addressLine1/city/state/pincode shape as a search selection, instead of
  // handing back bare coordinates that the caller has to geocode itself.
  const parseAddressComponents = (
    components: google.maps.GeocoderAddressComponent[] | undefined
  ) => {
    let city = '';
    let state = '';
    let pincode = '';
    if (components) {
      for (const comp of components) {
        if (comp.types.includes('locality')) city = comp.long_name;
        if (comp.types.includes('administrative_area_level_1')) state = comp.long_name;
        if (comp.types.includes('postal_code')) pincode = comp.long_name;
      }
    }
    return { city, state, pincode };
  };

  const reverseGeocode = useCallback(
    (lat: number, lng: number) => {
      if (!window.google?.maps) return;
      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ location: { lat, lng } }, (results, status) => {
        if (status !== 'OK' || !results || results.length === 0) {
          onLocationSelect({ lat, lng });
          return;
        }
        const result = results[0];
        const { city, state, pincode } = parseAddressComponents(result.address_components);
        onLocationSelect({
          lat,
          lng,
          addressLine1: result.formatted_address,
          city,
          state,
          pincode,
        });
      });
    },
    [onLocationSelect]
  );

  useEffect(() => {
    if (!isLoaded || !inputRef.current || !window.google?.maps?.places) return;

    try {
      const autocomplete = new window.google.maps.places.Autocomplete(inputRef.current, {
        types: ['establishment', 'geocode'],
        componentRestrictions: { country: 'in' },
      });

      const listener = autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        if (place.geometry && place.geometry.location) {
          const newLat = place.geometry.location.lat();
          const newLng = place.geometry.location.lng();
          const newPos = { lat: newLat, lng: newLng };
          setPosition(newPos);

          const { city, state, pincode } = parseAddressComponents(place.address_components);

          onLocationSelect({
            lat: newLat,
            lng: newLng,
            addressLine1: place.name || place.formatted_address,
            city,
            state,
            pincode,
          });
        }
      });

      return () => {
        if (listener) listener.remove();
      };
    } catch {
      // Ignore autocomplete setup error if Google Cloud project lacks Places API (New) enablement
    }
  }, [isLoaded, onLocationSelect]);

  const handleMapClick = useCallback(
    (e: google.maps.MapMouseEvent) => {
      if (e.latLng) {
        const newLat = e.latLng.lat();
        const newLng = e.latLng.lng();
        setPosition({ lat: newLat, lng: newLng });
        reverseGeocode(newLat, newLng);
      }
    },
    [reverseGeocode]
  );

  const handleMarkerDragEnd = useCallback(
    (e: google.maps.MapMouseEvent) => {
      if (e.latLng) {
        const newLat = e.latLng.lat();
        const newLng = e.latLng.lng();
        setPosition({ lat: newLat, lng: newLng });
        reverseGeocode(newLat, newLng);
      }
    },
    [reverseGeocode]
  );

  if (loadError || authErrorCode) {
    return (
      <div className="h-72 w-full rounded-2xl bg-surface border border-border p-4 flex flex-col items-center justify-center text-center text-caption text-text-secondary gap-2">
        <MapPin className="h-6 w-6 text-error" />
        {authErrorCode ? (
          <>
            <span>Google Maps configuration error: {authErrorCode}</span>
            <span className="text-badge text-text-tertiary">
              {MAPS_ERROR_HINTS[authErrorCode] ?? 'Check the API key setup in Google Cloud Console.'}
            </span>
          </>
        ) : (
          <>
            <span>Failed to load Google Maps script.</span>
            {loadError?.message && (
              <span className="text-badge text-text-tertiary">{loadError.message}</span>
            )}
          </>
        )}
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="h-72 w-full rounded-2xl bg-surface border border-border flex items-center justify-center text-caption text-text-secondary animate-pulse">
        Loading Google Maps & Places Search...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Search Input Box */}
      <div className="relative z-10">
        <div className="relative flex items-center">
          <Search className="absolute left-3.5 h-4 w-4 text-text-tertiary" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search your gaming café address on Google Maps..."
            className="w-full rounded-xl border border-border bg-card pl-10 pr-4 py-2.5 text-body text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary/40 shadow-sm"
          />
        </div>
      </div>

      {/* Interactive Map View */}
      <div className="relative h-64 w-full rounded-2xl overflow-hidden border border-border shadow-card">
        <GoogleMap
          mapContainerStyle={mapContainerStyle}
          center={position}
          zoom={14}
          onClick={handleMapClick}
          options={{
            disableDefaultUI: false,
            zoomControl: true,
          }}
        >
          <MarkerF position={position} draggable onDragEnd={handleMarkerDragEnd} />
        </GoogleMap>
        <div className="absolute bottom-2 left-2 bg-black/70 text-white text-xs px-3 py-1 rounded-full backdrop-blur-sm">
          Lat: {position.lat.toFixed(4)}, Lng: {position.lng.toFixed(4)} (Search or drag pin)
        </div>
      </div>
    </div>
  );
}
