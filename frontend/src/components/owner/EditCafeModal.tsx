'use client';

import { useState, type FormEvent } from 'react';
import { MapPin, Clock, Sparkles, Store, Plus, Trash2, CheckCircle2, X } from 'lucide-react';
import { Modal, Button, Input } from '@/components/ui';
import { updateCafeDetails, updateOperatingHours, type OwnerSettings } from '@/lib/api/settings';
import { GoogleLocationPicker } from '@/components/maps/GoogleLocationPicker';

interface EditCafeModalProps {
  isOpen: boolean;
  onClose: () => void;
  cafeId: string;
  settings: OwnerSettings;
  onSaved: (updated: Partial<OwnerSettings>) => void;
}

const PRESET_AMENITIES = [
  'Air conditioned',
  'Free Wi-Fi',
  'Free water',
  'Café & snacks',
  'Discord booth',
  'Washroom',
  'Parking',
  'Streaming setup',
  'Wheelchair accessible',
];

type Tab = 'basic' | 'location' | 'hours' | 'amenities';

const TABS: { id: Tab; label: string; icon: typeof Store }[] = [
  { id: 'basic', label: 'Basic Info', icon: Store },
  { id: 'location', label: 'Location', icon: MapPin },
  { id: 'hours', label: 'Hours', icon: Clock },
  { id: 'amenities', label: 'Amenities & Photos', icon: Sparkles },
];

function toHHMM(time: string | null): string {
  if (!time) return '09:00';
  return time.slice(0, 5);
}

export function EditCafeModal({ isOpen, onClose, cafeId, settings, onSaved }: EditCafeModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>('basic');

  // Basic info
  const [name, setName] = useState(settings.cafeName);
  const [phoneNumber, setPhoneNumber] = useState(settings.phoneNumber);
  const [addressLine1, setAddressLine1] = useState(settings.addressLine1);
  const [city, setCity] = useState(settings.city);
  const [state, setState] = useState(settings.state);
  const [pincode, setPincode] = useState(settings.pincode);
  const [basicSaving, setBasicSaving] = useState(false);
  const [basicError, setBasicError] = useState<string | null>(null);
  const [basicSaved, setBasicSaved] = useState(false);

  // Location
  const [lat, setLat] = useState<number | null>(settings.latitude);
  const [lng, setLng] = useState<number | null>(settings.longitude);
  const [locationSaving, setLocationSaving] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationSaved, setLocationSaved] = useState(false);

  // Hours
  const [openingTime, setOpeningTime] = useState(toHHMM(settings.openingTime));
  const [closingTime, setClosingTime] = useState(toHHMM(settings.closingTime));
  const [hoursSaving, setHoursSaving] = useState(false);
  const [hoursError, setHoursError] = useState<string | null>(null);
  const [hoursSaved, setHoursSaved] = useState(false);

  // Amenities & photos
  const [amenities, setAmenities] = useState<string[]>(settings.amenities || []);
  const [customAmenity, setCustomAmenity] = useState('');
  const [photos, setPhotos] = useState<string[]>(settings.photos && settings.photos.length > 0 ? settings.photos : ['']);
  const [amenitiesSaving, setAmenitiesSaving] = useState(false);
  const [amenitiesError, setAmenitiesError] = useState<string | null>(null);
  const [amenitiesSaved, setAmenitiesSaved] = useState(false);

  const toggleAmenity = (item: string) => {
    setAmenities((prev) => (prev.includes(item) ? prev.filter((a) => a !== item) : [...prev, item]));
  };

  const addCustomAmenity = () => {
    const trimmed = customAmenity.trim();
    if (trimmed && !amenities.includes(trimmed)) {
      setAmenities((prev) => [...prev, trimmed]);
    }
    setCustomAmenity('');
  };

  const handleBasicSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBasicSaving(true);
    setBasicError(null);
    try {
      await updateCafeDetails(cafeId, { name, phoneNumber, addressLine1, city, state, pincode });
      onSaved({ cafeName: name, phoneNumber, addressLine1, city, state, pincode });
      setBasicSaved(true);
      setTimeout(() => setBasicSaved(false), 2500);
    } catch (err: unknown) {
      setBasicError(err instanceof Error ? err.message : 'Failed to update café details');
    } finally {
      setBasicSaving(false);
    }
  };

  const handleLocationSave = async () => {
    if (lat == null || lng == null) return;
    setLocationSaving(true);
    setLocationError(null);
    try {
      await updateCafeDetails(cafeId, { latitude: lat, longitude: lng });
      onSaved({ latitude: lat, longitude: lng });
      setLocationSaved(true);
      setTimeout(() => setLocationSaved(false), 2500);
    } catch (err: unknown) {
      setLocationError(err instanceof Error ? err.message : 'Failed to update café location');
    } finally {
      setLocationSaving(false);
    }
  };

  const handleHoursSave = async () => {
    setHoursSaving(true);
    setHoursError(null);
    try {
      await updateOperatingHours(cafeId, `${openingTime}:00`, `${closingTime}:00`);
      onSaved({ openingTime: `${openingTime}:00`, closingTime: `${closingTime}:00` });
      setHoursSaved(true);
      setTimeout(() => setHoursSaved(false), 2500);
    } catch (err: unknown) {
      setHoursError(err instanceof Error ? err.message : 'Failed to update operating hours');
    } finally {
      setHoursSaving(false);
    }
  };

  const handleAmenitiesSave = async () => {
    setAmenitiesSaving(true);
    setAmenitiesError(null);
    try {
      const cleanPhotos = photos.map((p) => p.trim()).filter(Boolean);
      await updateCafeDetails(cafeId, { amenities, photos: cleanPhotos });
      onSaved({ amenities, photos: cleanPhotos });
      setAmenitiesSaved(true);
      setTimeout(() => setAmenitiesSaved(false), 2500);
    } catch (err: unknown) {
      setAmenitiesError(err instanceof Error ? err.message : 'Failed to update amenities & photos');
    } finally {
      setAmenitiesSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Edit Café Profile"
      description="Each section saves independently — switch tabs freely."
      size="full"
    >
      <div className="flex flex-col gap-5">
        {/* Tab bar — horizontally scrollable on mobile, touch-friendly (44px targets) */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 sm:mx-0 sm:px-0">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex-shrink-0 flex items-center gap-1.5 h-11 px-3.5 rounded-xl text-caption font-semibold whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-primary text-white shadow-sm'
                    : 'bg-surface text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* BASIC INFO */}
        {activeTab === 'basic' && (
          <form onSubmit={handleBasicSubmit} className="flex flex-col gap-4">
            {basicError && (
              <div className="rounded-xl bg-error/10 border border-error/20 p-3 text-caption text-error">{basicError}</div>
            )}
            <Input label="Café Name" value={name} onChange={(e) => setName(e.target.value)} required />
            <Input label="Phone Number" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} required />
            <Input label="Address" value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} required />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="City" value={city} onChange={(e) => setCity(e.target.value)} required />
              <Input label="State" value={state} onChange={(e) => setState(e.target.value)} required />
            </div>
            <Input label="Pincode" value={pincode} onChange={(e) => setPincode(e.target.value)} required />
            <SaveRow saving={basicSaving} saved={basicSaved} label="Save Basic Info" />
          </form>
        )}

        {/* LOCATION */}
        {activeTab === 'location' && (
          <div className="flex flex-col gap-4">
            {locationError && (
              <div className="rounded-xl bg-error/10 border border-error/20 p-3 text-caption text-error">{locationError}</div>
            )}
            <p className="text-caption text-text-secondary">
              Search your café or drag the pin to set the exact spot shown to customers on the map.
            </p>
            <GoogleLocationPicker
              initialLat={lat ?? undefined}
              initialLng={lng ?? undefined}
              onLocationSelect={(loc) => {
                setLat(loc.lat);
                setLng(loc.lng);
              }}
            />
            <SaveRow saving={locationSaving} saved={locationSaved} label="Save Location" onClick={handleLocationSave} disabled={lat == null || lng == null} />
          </div>
        )}

        {/* HOURS */}
        {activeTab === 'hours' && (
          <div className="flex flex-col gap-4">
            {hoursError && (
              <div className="rounded-xl bg-error/10 border border-error/20 p-3 text-caption text-error">{hoursError}</div>
            )}
            <p className="text-caption text-text-secondary">
              Overnight hours are supported — e.g. opening at 10:00 and closing at 02:00 the next day.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-caption font-semibold text-text-primary">Opening Time</label>
                <input
                  type="time"
                  value={openingTime}
                  onChange={(e) => setOpeningTime(e.target.value)}
                  className="h-11 w-full rounded-xl border border-border bg-card px-3 text-body text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-caption font-semibold text-text-primary">Closing Time</label>
                <input
                  type="time"
                  value={closingTime}
                  onChange={(e) => setClosingTime(e.target.value)}
                  className="h-11 w-full rounded-xl border border-border bg-card px-3 text-body text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>
            <SaveRow saving={hoursSaving} saved={hoursSaved} label="Save Hours" onClick={handleHoursSave} />
          </div>
        )}

        {/* AMENITIES & PHOTOS */}
        {activeTab === 'amenities' && (
          <div className="flex flex-col gap-6">
            {amenitiesError && (
              <div className="rounded-xl bg-error/10 border border-error/20 p-3 text-caption text-error">{amenitiesError}</div>
            )}

            <div className="flex flex-col gap-2.5">
              <label className="text-caption font-semibold text-text-primary">Amenities</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {PRESET_AMENITIES.map((item) => {
                  const selected = amenities.includes(item);
                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() => toggleAmenity(item)}
                      className={`min-h-[44px] px-3 py-2 rounded-xl text-caption font-semibold flex items-center justify-between gap-1.5 border transition-colors ${
                        selected
                          ? 'bg-primary/10 border-primary text-primary'
                          : 'bg-surface border-border text-text-secondary hover:bg-surface-hover'
                      }`}
                    >
                      <span className="truncate">{item}</span>
                      {selected && <CheckCircle2 className="h-4 w-4 flex-shrink-0" />}
                    </button>
                  );
                })}
                {amenities.filter((a) => !PRESET_AMENITIES.includes(a)).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => toggleAmenity(item)}
                    className="min-h-[44px] px-3 py-2 rounded-xl text-caption font-semibold flex items-center justify-between gap-1.5 border bg-primary/10 border-primary text-primary"
                  >
                    <span className="truncate">{item}</span>
                    <X className="h-4 w-4 flex-shrink-0" />
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <Input
                  placeholder="Add a custom amenity..."
                  value={customAmenity}
                  onChange={(e) => setCustomAmenity(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addCustomAmenity();
                    }
                  }}
                />
                <Button type="button" variant="outline" size="md" onClick={addCustomAmenity} className="flex-shrink-0 gap-1">
                  <Plus className="h-4 w-4" />
                  Add
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              <label className="text-caption font-semibold text-text-primary">Venue Photos (URLs)</label>
              {photos.map((photo, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input
                    value={photo}
                    placeholder="https://images.unsplash.com/..."
                    onChange={(e) => {
                      const updated = [...photos];
                      updated[idx] = e.target.value;
                      setPhotos(updated);
                    }}
                  />
                  {photos.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setPhotos(photos.filter((_, i) => i !== idx))}
                      className="h-11 w-11 flex-shrink-0 flex items-center justify-center rounded-xl text-error hover:bg-error/10"
                      aria-label="Remove photo"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setPhotos([...photos, ''])}
                className="self-start gap-1.5"
              >
                <Plus className="h-4 w-4" />
                <span>Add Photo URL</span>
              </Button>
            </div>

            <SaveRow saving={amenitiesSaving} saved={amenitiesSaved} label="Save Amenities & Photos" onClick={handleAmenitiesSave} />
          </div>
        )}
      </div>
    </Modal>
  );
}

function SaveRow({
  saving,
  saved,
  label,
  onClick,
  disabled,
}: {
  saving: boolean;
  saved: boolean;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 pt-2 border-t border-border">
      <Button
        type={onClick ? 'button' : 'submit'}
        variant="primary"
        size="md"
        isLoading={saving}
        loadingText="Saving..."
        disabled={disabled}
        onClick={onClick}
      >
        {label}
      </Button>
      {saved && (
        <span className="flex items-center gap-1.5 text-caption font-semibold text-success">
          <CheckCircle2 className="h-4 w-4" /> Saved
        </span>
      )}
    </div>
  );
}
