'use client';

import { useState, useRef, type FormEvent } from 'react';
import { MapPin, Clock, Sparkles, Store, Plus, Trash2, CheckCircle2, Upload, ChevronUp, ChevronDown, ImageOff } from 'lucide-react';
import { Modal, Button, Input } from '@/components/ui';
import { updateCafeDetails, updateOperatingHours, uploadCafePhoto, deleteCafePhoto, uploadMenuPhoto, deleteMenuPhoto, type OwnerSettings } from '@/lib/api/settings';
import dynamic from 'next/dynamic';

const GoogleLocationPicker = dynamic(
  () => import('@/components/maps/GoogleLocationPicker').then((m) => m.GoogleLocationPicker),
  {
    ssr: false,
    loading: () => (
      <div className="h-64 w-full rounded-2xl bg-surface border border-border flex items-center justify-center text-caption text-text-secondary animate-pulse">
        Loading map picker...
      </div>
    ),
  }
);
import { getAmenityDisplay } from '@/lib/amenities';
import { SUPPORTED_CITIES } from '@/constants/cities';

const MAX_PHOTOS = 10;
const MAX_PHOTO_MB = 8;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

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
  const [photos, setPhotos] = useState<string[]>(settings.photos || []);
  const [amenitiesSaving, setAmenitiesSaving] = useState(false);
  const [amenitiesError, setAmenitiesError] = useState<string | null>(null);
  const [amenitiesSaved, setAmenitiesSaved] = useState(false);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deletingUrl, setDeletingUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [menuPhotos, setMenuPhotos] = useState<string[]>(settings.menuPhotos || []);
  const [menuUploadProgress, setMenuUploadProgress] = useState<Record<string, number>>({});
  const [menuUploadError, setMenuUploadError] = useState<string | null>(null);
  const [deletingMenuUrl, setDeletingMenuUrl] = useState<string | null>(null);
  const [menuUploadingCount, setMenuUploadingCount] = useState(0);

  // Saved amenities may be seeded snake_case slugs ("ac", "ps5_zone") or these
  // Title Case presets — both resolve to the same canonical label via
  // getAmenityDisplay, so toggling/matching works regardless of which form
  // is already stored for this cafe.
  const canonicalOf = (raw: string) => getAmenityDisplay(raw).label;

  const toggleAmenity = (item: string) => {
    const itemCanonical = canonicalOf(item);
    setAmenities((prev) => {
      const existing = prev.find((a) => canonicalOf(a) === itemCanonical);
      return existing ? prev.filter((a) => a !== existing) : [...prev, item];
    });
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

  const persistPhotos = async (updated: string[]) => {
    setPhotos(updated);
    await updateCafeDetails(cafeId, { photos: updated });
    onSaved({ photos: updated });
  };

  const handleFilesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadError(null);

    const remainingSlots = MAX_PHOTOS - photos.length;
    if (remainingSlots <= 0) {
      setUploadError(`A café can have at most ${MAX_PHOTOS} photos`);
      return;
    }

    const selected = Array.from(files).slice(0, remainingSlots);
    let workingPhotos = photos;

    for (const file of selected) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        setUploadError('Only JPEG, PNG, or WebP images are allowed');
        continue;
      }
      if (file.size > MAX_PHOTO_MB * 1024 * 1024) {
        setUploadError(`"${file.name}" is larger than ${MAX_PHOTO_MB}MB`);
        continue;
      }

      const tempKey = `${file.name}-${file.size}-${Date.now()}`;
      setUploadingCount((c) => c + 1);
      setUploadProgress((p) => ({ ...p, [tempKey]: 0 }));

      try {
        const publicUrl = await uploadCafePhoto(cafeId, file, (pct) => {
          setUploadProgress((p) => ({ ...p, [tempKey]: pct }));
        });
        workingPhotos = [...workingPhotos, publicUrl];
        await persistPhotos(workingPhotos);
      } catch (err: unknown) {
        setUploadError(err instanceof Error ? err.message : `Failed to upload "${file.name}"`);
      } finally {
        setUploadingCount((c) => c - 1);
        setUploadProgress((p) => {
          const { [tempKey]: _drop, ...rest } = p;
          return rest;
        });
      }
    }
  };

  const handleDeletePhoto = async (url: string) => {
    setDeletingUrl(url);
    setUploadError(null);
    try {
      const res = await deleteCafePhoto(cafeId, url);
      setPhotos(res.photos);
      onSaved({ photos: res.photos });
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'Failed to delete photo');
    } finally {
      setDeletingUrl(null);
    }
  };

  const persistMenuPhotos = async (updated: string[]) => {
    setMenuPhotos(updated);
    await updateCafeDetails(cafeId, { menuPhotos: updated });
    onSaved({ menuPhotos: updated });
  };

  const handleMenuFilesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setMenuUploadError(null);

    const remainingSlots = MAX_PHOTOS - menuPhotos.length;
    if (remainingSlots <= 0) {
      setMenuUploadError(`A café can have at most ${MAX_PHOTOS} menu photos`);
      return;
    }

    const selected = Array.from(files).slice(0, remainingSlots);
    let workingPhotos = menuPhotos;

    for (const file of selected) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        setMenuUploadError('Only JPEG, PNG, or WebP images are allowed');
        continue;
      }
      if (file.size > MAX_PHOTO_MB * 1024 * 1024) {
        setMenuUploadError(`"${file.name}" is larger than ${MAX_PHOTO_MB}MB`);
        continue;
      }

      const tempKey = `${file.name}-${file.size}-${Date.now()}`;
      setMenuUploadingCount((c) => c + 1);
      setMenuUploadProgress((p) => ({ ...p, [tempKey]: 0 }));

      try {
        const publicUrl = await uploadMenuPhoto(cafeId, file, (pct) => {
          setMenuUploadProgress((p) => ({ ...p, [tempKey]: pct }));
        });
        workingPhotos = [...workingPhotos, publicUrl];
        await persistMenuPhotos(workingPhotos);
      } catch (err: unknown) {
        setMenuUploadError(err instanceof Error ? err.message : `Failed to upload "${file.name}"`);
      } finally {
        setMenuUploadingCount((c) => c - 1);
        setMenuUploadProgress((p) => {
          const { [tempKey]: _drop, ...rest } = p;
          return rest;
        });
      }
    }
  };

  const handleDeleteMenuPhoto = async (url: string) => {
    setDeletingMenuUrl(url);
    setMenuUploadError(null);
    try {
      const res = await deleteMenuPhoto(cafeId, url);
      setMenuPhotos(res.menuPhotos);
      onSaved({ menuPhotos: res.menuPhotos });
    } catch (err: unknown) {
      setMenuUploadError(err instanceof Error ? err.message : 'Failed to delete menu photo');
    } finally {
      setDeletingMenuUrl(null);
    }
  };

  const movePhoto = async (idx: number, direction: -1 | 1) => {
    const target = idx + direction;
    if (target < 0 || target >= photos.length) return;
    const updated = [...photos];
    [updated[idx], updated[target]] = [updated[target], updated[idx]];
    try {
      await persistPhotos(updated);
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'Failed to reorder photos');
    }
  };

  const handleAmenitiesSave = async () => {
    setAmenitiesSaving(true);
    setAmenitiesError(null);
    try {
      await updateCafeDetails(cafeId, { amenities });
      onSaved({ amenities });
      setAmenitiesSaved(true);
      setTimeout(() => setAmenitiesSaved(false), 2500);
    } catch (err: unknown) {
      setAmenitiesError(err instanceof Error ? err.message : 'Failed to update amenities');
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
              <div className="flex flex-col gap-1.5">
                <label className="text-caption font-semibold text-text-primary">City</label>
                <select
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="flex h-10 w-full rounded-xl border border-border bg-card px-3 py-2 text-body text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  required
                >
                  <option value="">Select City</option>
                  {SUPPORTED_CITIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                  {city && !SUPPORTED_CITIES.includes(city) && (
                    <option value={city}>{city} (unsupported — please re-select)</option>
                  )}
                </select>
              </div>
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
                  const itemCanonical = canonicalOf(item);
                  const selected = amenities.some((a) => canonicalOf(a) === itemCanonical);
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
                {amenities
                  .filter((a) => !PRESET_AMENITIES.some((p) => canonicalOf(p) === canonicalOf(a)))
                  .map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => toggleAmenity(item)}
                      className="min-h-[44px] px-3 py-2 rounded-xl text-caption font-semibold flex items-center justify-between gap-1.5 border bg-primary/10 border-primary text-primary"
                    >
                      <span className="truncate">{canonicalOf(item)}</span>
                      <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
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
              <div className="flex items-center justify-between">
                <label className="text-caption font-semibold text-text-primary">
                  Venue Photos <span className="text-text-secondary font-normal">({photos.length}/{MAX_PHOTOS})</span>
                </label>
                {photos.length === 0 && (
                  <span className="text-caption text-text-secondary">Using stock photos until you upload real ones</span>
                )}
              </div>

              {uploadError && (
                <div className="rounded-xl bg-error/10 border border-error/20 p-3 text-caption text-error">{uploadError}</div>
              )}

              {photos.length === 0 && (
                <div className="flex items-center gap-2 rounded-xl bg-warning/10 border border-warning/20 p-3 text-caption text-warning">
                  <ImageOff className="h-4 w-4 flex-shrink-0" />
                  <span>No real photos uploaded yet — customers currently see generic stock images.</span>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {photos.map((photo, idx) => (
                  <div key={photo} className="relative aspect-square rounded-xl overflow-hidden border border-border group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo}
                      alt={`Café photo ${idx + 1}`}
                      className="h-full w-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                    {idx === 0 && (
                      <span className="absolute top-1.5 left-1.5 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-white">
                        Cover
                      </span>
                    )}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 sm:opacity-0 flex items-center justify-center gap-1.5 transition-opacity">
                      {idx > 0 && (
                        <button
                          type="button"
                          onClick={() => movePhoto(idx, -1)}
                          className="h-8 w-8 flex items-center justify-center rounded-lg bg-white/90 text-text-primary"
                          aria-label="Move earlier / make cover"
                        >
                          <ChevronUp className="h-4 w-4" />
                        </button>
                      )}
                      {idx < photos.length - 1 && (
                        <button
                          type="button"
                          onClick={() => movePhoto(idx, 1)}
                          className="h-8 w-8 flex items-center justify-center rounded-lg bg-white/90 text-text-primary"
                          aria-label="Move later"
                        >
                          <ChevronDown className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDeletePhoto(photo)}
                        disabled={deletingUrl === photo}
                        className="h-8 w-8 flex items-center justify-center rounded-lg bg-white/90 text-error disabled:opacity-50"
                        aria-label="Delete photo"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}

                {Object.entries(uploadProgress).map(([key, pct]) => (
                  <div key={key} className="aspect-square rounded-xl border border-border bg-surface flex flex-col items-center justify-center gap-1.5 text-caption text-text-secondary">
                    <Upload className="h-5 w-5 animate-pulse" />
                    <span>{pct}%</span>
                  </div>
                ))}

                {photos.length < MAX_PHOTOS && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingCount > 0}
                    className="aspect-square rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-1.5 text-caption font-semibold text-text-secondary hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
                  >
                    <Plus className="h-5 w-5" />
                    <span>Add Photo</span>
                  </button>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="hidden"
                onChange={(e) => {
                  handleFilesSelected(e.target.files);
                  e.target.value = '';
                }}
              />
              <p className="text-caption text-text-secondary">
                JPEG, PNG, or WebP — up to {MAX_PHOTO_MB}MB each. First photo is the cover shown on listings.
              </p>
            </div>

            <div className="flex flex-col gap-2.5">
              <label className="text-caption font-semibold text-text-primary">
                Menu Photos <span className="text-text-secondary font-normal">({menuPhotos.length}/{MAX_PHOTOS})</span>
              </label>

              {menuUploadError && (
                <div className="rounded-xl bg-error/10 border border-error/20 p-3 text-caption text-error">{menuUploadError}</div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {menuPhotos.map((photo) => (
                  <div key={photo} className="relative aspect-square rounded-xl overflow-hidden border border-border group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo}
                      alt="Menu"
                      className="h-full w-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 sm:opacity-0 flex items-center justify-center gap-1.5 transition-opacity">
                      <button
                        type="button"
                        onClick={() => handleDeleteMenuPhoto(photo)}
                        disabled={deletingMenuUrl === photo}
                        className="h-8 w-8 flex items-center justify-center rounded-lg bg-white/90 text-error disabled:opacity-50"
                        aria-label="Delete menu photo"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}

                {Object.entries(menuUploadProgress).map(([key, pct]) => (
                  <div key={key} className="aspect-square rounded-xl border border-border bg-surface flex flex-col items-center justify-center gap-1.5 text-caption text-text-secondary">
                    <Upload className="h-5 w-5 animate-pulse" />
                    <span>{pct}%</span>
                  </div>
                ))}

                {menuPhotos.length < MAX_PHOTOS && (
                  <label className="aspect-square rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-1.5 text-caption font-semibold text-text-secondary hover:border-primary hover:text-primary transition-colors cursor-pointer">
                    <Plus className="h-5 w-5" />
                    <span>Add photo</span>
                    <input
                      type="file"
                      accept={ALLOWED_TYPES.join(',')}
                      multiple
                      className="hidden"
                      disabled={menuUploadingCount > 0}
                      onChange={(e) => {
                        handleMenuFilesSelected(e.target.files);
                        e.target.value = '';
                      }}
                    />
                  </label>
                )}
              </div>
            </div>

            <SaveRow saving={amenitiesSaving} saved={amenitiesSaved} label="Save Amenities" onClick={handleAmenitiesSave} />
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
