'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Store,
  Clock,
  XCircle,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Send,
  Check,
  Wifi,
  Wind,
  UtensilsCrossed,
  Car,
  Headphones,
  Lock,
  Video,
  Trophy,
  Plus,
  Trash2,
} from 'lucide-react';
import { getOwnerCafe, getCafe, createCafe, updateCafe, CafeFormData } from '@/lib/api';

const CITIES = ['Bengaluru', 'Mumbai', 'Pune', 'Delhi', 'Hyderabad', 'Chennai', 'Kolkata', 'Jaipur'];

const CITY_TO_STATE: Record<string, string> = {
  Bengaluru: 'Karnataka',
  Mumbai: 'Maharashtra',
  Pune: 'Maharashtra',
  Delhi: 'Delhi',
  Hyderabad: 'Telangana',
  Chennai: 'Tamil Nadu',
  Kolkata: 'West Bengal',
  Jaipur: 'Rajasthan',
};

const AMENITY_OPTIONS = [
  { value: 'wifi', label: 'Wi-Fi', icon: Wifi },
  { value: 'ac', label: 'Air Conditioning', icon: Wind },
  { value: 'food', label: 'Food & Drinks', icon: UtensilsCrossed },
  { value: 'parking', label: 'Parking', icon: Car },
  { value: 'headsets', label: 'Gaming Headsets', icon: Headphones },
  { value: 'private_rooms', label: 'Private Rooms', icon: Lock },
  { value: 'streaming', label: 'Streaming Setup', icon: Video },
  { value: 'tournaments', label: 'Tournaments', icon: Trophy },
];

const DEFAULT_FORM_DATA: CafeFormData = {
  name: '',
  description: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  pincode: '',
  phoneNumber: '',
  email: '',
  openingTime: '10:00:00',
  closingTime: '23:00:00',
  totalSeats: 20,
  amenities: [],
  photos: [],
};

export default function OwnerCafePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const formRef = useRef<HTMLFormElement>(null);

  // States
  const [formData, setFormData] = useState<CafeFormData>(DEFAULT_FORM_DATA);
  const [openHour, setOpenHour] = useState('10');
  const [openMinute, setOpenMinute] = useState('00');
  const [closeHour, setCloseHour] = useState('23');
  const [closeMinute, setCloseMinute] = useState('00');
  const [photoUrls, setPhotoUrls] = useState<string[]>(['']);
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>([]);

  // Validation & banner messages
  const [errors, setErrors] = useState<Partial<Record<keyof CafeFormData | 'timeMismatch', string>>>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  // 1. Fetch Owner's Café summary
  const { data: ownerCafeSummary, isLoading: isSummaryLoading } = useQuery({
    queryKey: ['ownerCafe'],
    queryFn: getOwnerCafe,
    staleTime: 120_000,
  });

  const cafeId = ownerCafeSummary?.id;

  // 2. Fetch Owner's full Café detail (if summary exists)
  const { data: cafeDetail, isLoading: isDetailLoading } = useQuery({
    queryKey: ['cafe', cafeId],
    queryFn: () => getCafe(cafeId!),
    enabled: !!cafeId,
    staleTime: 120_000,
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: createCafe,
    onSuccess: (data) => {
      setSuccessMessage("Your café has been submitted for verification. We'll review it within 24–48 hours.");
      setApiError(null);
      queryClient.invalidateQueries({ queryKey: ['ownerCafe'] });
      if (data.id) {
        queryClient.invalidateQueries({ queryKey: ['cafe', data.id] });
      }
    },
    onError: (err: unknown) => {
      const errObj = err as { response?: { data?: { error?: { message?: string }; detail?: string } } };
      const msg = errObj?.response?.data?.error?.message || errObj?.response?.data?.detail || 'Failed to submit café.';
      setApiError(msg);
      setSuccessMessage(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<CafeFormData>) => updateCafe(cafeId!, data),
    onSuccess: () => {
      setSuccessMessage('Changes saved successfully.');
      setApiError(null);
      queryClient.invalidateQueries({ queryKey: ['ownerCafe'] });
      queryClient.invalidateQueries({ queryKey: ['cafe', cafeId] });
    },
    onError: (err: unknown) => {
      const errObj = err as { response?: { data?: { error?: { message?: string }; detail?: string } } };
      const msg = errObj?.response?.data?.error?.message || errObj?.response?.data?.detail || 'Failed to update café changes.';
      setApiError(msg);
      setSuccessMessage(null);
    },
  });

  // Pre-fill form when café detail resolves
  useEffect(() => {
    if (cafeDetail) {
      setFormData({
        name: cafeDetail.name ?? '',
        description: cafeDetail.description ?? '',
        addressLine1: cafeDetail.addressLine1 ?? '',
        addressLine2: cafeDetail.addressLine2 ?? '',
        city: cafeDetail.city ?? '',
        state: cafeDetail.state ?? '',
        pincode: cafeDetail.pincode ?? '',
        phoneNumber: cafeDetail.phoneNumber ?? '',
        email: cafeDetail.email ?? '',
        openingTime: cafeDetail.openingTime ?? '10:00:00',
        closingTime: cafeDetail.closingTime ?? '23:00:00',
        totalSeats: cafeDetail.totalSeats ?? 20,
        amenities: cafeDetail.amenities ?? [],
        photos: cafeDetail.photos ?? [],
      });

      setSelectedAmenities(cafeDetail.amenities ?? []);
      setPhotoUrls(cafeDetail.photos && cafeDetail.photos.length > 0 ? cafeDetail.photos : ['']);

      // Parse times
      if (cafeDetail.openingTime) {
        const [h, m] = cafeDetail.openingTime.split(':');
        setOpenHour(h);
        setOpenMinute(m);
      }
      if (cafeDetail.closingTime) {
        const [h, m] = cafeDetail.closingTime.split(':');
        setCloseHour(h);
        setCloseMinute(m);
      }
    }
  }, [cafeDetail]);

  // City-to-state change handler
  const handleCityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    const mappedState = CITY_TO_STATE[val] || '';
    setFormData((prev) => ({ ...prev, city: val, state: mappedState }));
    setErrors((prev) => ({ ...prev, city: undefined, state: undefined }));
  };

  // Synchronize opening/closing times back into formData
  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      openingTime: `${openHour.padStart(2, '0')}:${openMinute.padStart(2, '0')}:00`,
      closingTime: `${closeHour.padStart(2, '0')}:${closeMinute.padStart(2, '0')}:00`,
    }));
  }, [openHour, openMinute, closeHour, closeMinute]);

  // Synchronize photo URL array changes into formData
  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      photos: photoUrls.filter((url) => url.trim() !== ''),
    }));
  }, [photoUrls]);

  // Synchronize amenities chip selection
  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      amenities: selectedAmenities,
    }));
  }, [selectedAmenities]);

  // Chip toggler
  const toggleAmenity = (val: string) => {
    setSelectedAmenities((prev) =>
      prev.includes(val) ? prev.filter((x) => x !== val) : [...prev, val]
    );
  };

  // Field validation trigger
  const validateField = (field: keyof CafeFormData, value: unknown) => {
    let errMsg = '';
    if (field === 'pincode') {
      const pinStr = String(value);
      if (!/^\d{6}$/.test(pinStr)) {
        errMsg = 'Pincode must be exactly 6 digits';
      }
    } else if (field === 'email') {
      const emailStr = String(value);
      if (emailStr && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailStr)) {
        errMsg = 'Please enter a valid email address';
      }
    }
    setErrors((prev) => ({ ...prev, [field]: errMsg || undefined }));
  };

  // Final Form Validation checks
  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof CafeFormData | 'timeMismatch', string>> = {};

    if (!formData.name.trim()) newErrors.name = 'Café Name is required';
    if (!formData.description.trim()) newErrors.description = 'Description is required';
    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }
    if (!formData.phoneNumber.trim()) newErrors.phoneNumber = 'Phone Number is required';
    if (!formData.addressLine1.trim()) newErrors.addressLine1 = 'Address Line 1 is required';
    if (!formData.city) newErrors.city = 'City selection is required';
    if (!formData.state.trim()) newErrors.state = 'State is required';

    if (!formData.pincode.trim()) {
      newErrors.pincode = 'Pincode is required';
    } else if (!/^\d{6}$/.test(formData.pincode)) {
      newErrors.pincode = 'Pincode must be exactly 6 digits';
    }

    if (formData.totalSeats < 1 || formData.totalSeats > 500) {
      newErrors.totalSeats = 'Seats must be between 1 and 500';
    }

    // Time validation check
    const openMins = parseInt(openHour, 10) * 60 + parseInt(openMinute, 10);
    const closeMins = parseInt(closeHour, 10) * 60 + parseInt(closeMinute, 10);
    if (closeMins <= openMins) {
      newErrors.timeMismatch = 'Closing time must be after opening time';
    }

    setErrors(newErrors);

    const isValid = Object.keys(newErrors).length === 0;

    if (!isValid) {
      // Find the first error block and scroll into view
      setTimeout(() => {
        const firstErrorEl = document.querySelector('.text-error');
        if (firstErrorEl) {
          firstErrorEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    }

    return isValid;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    if (cafeId) {
      updateMutation.mutate(formData);
    } else {
      createMutation.mutate(formData);
    }
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  if (isSummaryLoading || (cafeId && isDetailLoading)) {
    return (
      <div className="space-y-4 animate-pulse pb-32">
        <div className="h-14 bg-surface rounded-md w-full mb-6" />
        <div className="card-base h-28 mx-4" />
        <div className="h-6 bg-surface rounded w-1/4 mx-4 mt-6" />
        <div className="card-base h-48 mx-4" />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-32">
      {/* PAGE HEADER */}
      <div className="sticky top-0 z-30 bg-card border-b border-border shadow-sm h-14 flex items-center justify-between px-4 -mx-4">
        <button
          type="button"
          onClick={() => router.push('/owner/dashboard')}
          className="p-2 hover:bg-surface rounded-full transition-colors text-text-secondary"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <span className="font-heading font-semibold text-base text-text-primary">
          Café Profile
        </span>
        <div className="w-12 text-right">
          {cafeDetail && (
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                cafeDetail.verificationStatus === 'verified'
                  ? 'bg-emerald-100 text-emerald-800'
                  : cafeDetail.verificationStatus === 'pending'
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-red-100 text-red-800'
              }`}
            >
              {cafeDetail.verificationStatus.toUpperCase()}
            </span>
          )}
        </div>
      </div>

      {/* BANNER: No café yet */}
      {!cafeId && (
        <div className="mx-4 mt-4 card-base p-5 border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10 shadow-sm flex flex-col items-center text-center">
          <Store className="w-8 h-8 text-primary" />
          <h2 className="font-heading font-bold text-lg text-text-primary mt-3">
            List your gaming café
          </h2>
          <p className="font-body text-sm text-text-secondary mt-1 leading-relaxed">
            Fill in your venue details below. Our team will verify your café before it goes live on KHEL-O.
          </p>
        </div>
      )}

      {/* BANNER: Verification pending */}
      {cafeDetail && cafeDetail.verificationStatus === 'pending' && (
        <div className="mx-4 mt-4 rounded-2xl border border-warning/30 bg-warning/10 p-4 flex items-start gap-3 shadow-sm">
          <Clock className="w-5 h-5 text-warning shrink-0 mt-0.5" />
          <p className="font-body text-sm text-text-primary leading-relaxed">
            Your café is under review. Our team typically verifies venues within 24–48 hours. You can still update your details while waiting.
          </p>
        </div>
      )}

      {/* BANNER: Verification rejected */}
      {cafeDetail && cafeDetail.verificationStatus === 'rejected' && (
        <div className="mx-4 mt-4 rounded-2xl border border-error/30 bg-error/10 p-4 flex items-start gap-3 shadow-sm">
          <XCircle className="w-5 h-5 text-error shrink-0 mt-0.5" />
          <div>
            <h4 className="font-body font-semibold text-sm text-error">
              Verification rejected
            </h4>
            <p className="font-body text-xs text-text-secondary mt-1 leading-relaxed">
              {cafeDetail.rejectionReason || 'Your café was not approved. Please review and update your details.'}
            </p>
          </div>
        </div>
      )}

      {/* SUCCESS / ERROR BANNERS */}
      {successMessage && (
        <div className="mx-4 mt-4 rounded-2xl border border-success/20 bg-success/10 p-4 flex items-center gap-3 shadow-sm animate-fade-in">
          <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
          <p className="font-body text-sm text-text-primary">{successMessage}</p>
        </div>
      )}

      {apiError && (
        <div className="mx-4 mt-4 rounded-2xl border border-error/20 bg-error/10 p-4 flex items-start gap-3 shadow-sm animate-fade-in">
          <AlertTriangle className="w-5 h-5 text-error shrink-0 mt-0.5" />
          <p className="font-body text-sm text-text-primary">{apiError}</p>
        </div>
      )}

      {/* THE FORM */}
      <form ref={formRef} onSubmit={handleSubmit} className="mx-4 mt-6 flex flex-col gap-6">
        {/* FORM SECTION 1: Basic Info */}
        <div className="space-y-4">
          <h3 className="font-heading font-semibold text-xs text-text-secondary uppercase tracking-widest border-b border-border pb-2">
            Basic Information
          </h3>

          <div className="space-y-1">
            <label className="block text-xs font-semibold text-text-secondary">Café Name *</label>
            <input
              type="text"
              required
              maxLength={100}
              value={formData.name}
              onChange={(e) => {
                setFormData((prev) => ({ ...prev, name: e.target.value }));
                setErrors((prev) => ({ ...prev, name: undefined }));
              }}
              placeholder="e.g., GG Zone Gaming Café"
              className={`w-full bg-card border rounded-2xl px-4 py-3 text-sm font-body text-text-primary focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all ${
                errors.name ? 'border-error focus:border-error focus:ring-error/20' : 'border-border'
              }`}
            />
            {errors.name && <p className="text-xs text-error mt-1 font-body">{errors.name}</p>}
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-semibold text-text-secondary">Description *</label>
            <textarea
              rows={4}
              required
              maxLength={500}
              value={formData.description}
              onChange={(e) => {
                setFormData((prev) => ({ ...prev, description: e.target.value }));
                setErrors((prev) => ({ ...prev, description: undefined }));
              }}
              placeholder="Describe your café — ambience, rigs available, what makes it special..."
              className={`w-full bg-card border rounded-2xl px-4 py-3 text-base font-body text-text-primary focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all ${
                errors.description ? 'border-error focus:border-error focus:ring-error/20' : 'border-border'
              }`}
            />
            {errors.description && (
              <p className="text-xs text-error mt-1 font-body">{errors.description}</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-text-secondary">Email Address *</label>
              <input
                type="email"
                required
                value={formData.email}
                onChange={(e) => {
                  setFormData((prev) => ({ ...prev, email: e.target.value }));
                  validateField('email', e.target.value);
                }}
                onBlur={(e) => validateField('email', e.target.value)}
                placeholder="cafe@example.com"
                className={`w-full bg-card border rounded-2xl px-4 py-3 text-sm font-body text-text-primary focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all ${
                  errors.email ? 'border-error focus:border-error focus:ring-error/20' : 'border-border'
                }`}
              />
              {errors.email && <p className="text-xs text-error mt-1 font-body">{errors.email}</p>}
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-text-secondary">Phone Number *</label>
              <input
                type="tel"
                required
                value={formData.phoneNumber}
                onChange={(e) => {
                  setFormData((prev) => ({ ...prev, phoneNumber: e.target.value }));
                  setErrors((prev) => ({ ...prev, phoneNumber: undefined }));
                }}
                placeholder="+91 98765 43210"
                className="w-full bg-card border border-border rounded-2xl px-4 py-3 text-sm font-body text-text-primary focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
              />
              {errors.phoneNumber && (
                <p className="text-xs text-error mt-1 font-body">{errors.phoneNumber}</p>
              )}
            </div>
          </div>
        </div>

        {/* FORM SECTION 2: Location */}
        <div className="space-y-4">
          <h3 className="font-heading font-semibold text-xs text-text-secondary uppercase tracking-widest border-b border-border pb-2">
            Location
          </h3>

          <div className="space-y-1">
            <label className="block text-xs font-semibold text-text-secondary font-body">
              Address Line 1 *
            </label>
            <input
              type="text"
              required
              maxLength={200}
              value={formData.addressLine1}
              onChange={(e) => {
                setFormData((prev) => ({ ...prev, addressLine1: e.target.value }));
                setErrors((prev) => ({ ...prev, addressLine1: undefined }));
              }}
              placeholder="Street address, building name"
              className="w-full bg-card border border-border rounded-2xl px-4 py-3 text-sm font-body text-text-primary focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
            />
            {errors.addressLine1 && (
              <p className="text-xs text-error mt-1 font-body">{errors.addressLine1}</p>
            )}
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-semibold text-text-secondary font-body">
              Address Line 2 (Optional)
            </label>
            <input
              type="text"
              maxLength={200}
              value={formData.addressLine2}
              onChange={(e) => setFormData((prev) => ({ ...prev, addressLine2: e.target.value }))}
              placeholder="Floor, landmark, suite"
              className="w-full bg-card border border-border rounded-2xl px-4 py-3 text-sm font-body text-text-primary focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-text-secondary">City *</label>
              <select
                required
                value={formData.city}
                onChange={handleCityChange}
                className="w-full bg-card border border-border rounded-2xl px-4 py-3 text-sm font-body text-text-primary focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
              >
                <option value="" disabled>
                  Select city
                </option>
                {CITIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              {errors.city && <p className="text-xs text-error mt-1 font-body">{errors.city}</p>}
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-text-secondary">State *</label>
              <input
                type="text"
                required
                maxLength={100}
                value={formData.state}
                onChange={(e) => setFormData((prev) => ({ ...prev, state: e.target.value }))}
                placeholder="e.g., Karnataka"
                className="w-full bg-card border border-border rounded-2xl px-4 py-3 text-sm font-body text-text-primary focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
              />
              {errors.state && <p className="text-xs text-error mt-1 font-body">{errors.state}</p>}
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-text-secondary">Pincode *</label>
              <input
                type="text"
                required
                maxLength={6}
                value={formData.pincode}
                onChange={(e) => {
                  setFormData((prev) => ({ ...prev, pincode: e.target.value }));
                  validateField('pincode', e.target.value);
                }}
                onBlur={(e) => validateField('pincode', e.target.value)}
                placeholder="560001"
                className={`w-full bg-card border rounded-2xl px-4 py-3 text-sm font-body text-text-primary focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all ${
                  errors.pincode ? 'border-error focus:border-error focus:ring-error/20' : 'border-border'
                }`}
              />
              {errors.pincode && <p className="text-xs text-error mt-1 font-body">{errors.pincode}</p>}
            </div>
          </div>
        </div>

        {/* FORM SECTION 3: Operating Hours & Capacity */}
        <div className="space-y-4">
          <h3 className="font-heading font-semibold text-xs text-text-secondary uppercase tracking-widest border-b border-border pb-2">
            Hours & Capacity
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-text-secondary">Opening Time *</label>
              <div className="flex gap-2">
                <select
                  value={openHour}
                  onChange={(e) => {
                    setOpenHour(e.target.value);
                    setErrors((prev) => ({ ...prev, timeMismatch: undefined }));
                  }}
                  className="flex-1 bg-card border border-border rounded-2xl px-3 py-3 text-sm font-data text-text-primary focus:outline-none focus:border-primary"
                >
                  {Array.from({ length: 24 }).map((_, i) => {
                    const h = String(i).padStart(2, '0');
                    return (
                      <option key={h} value={h}>
                        {h} hrs
                      </option>
                    );
                  })}
                </select>
                <select
                  value={openMinute}
                  onChange={(e) => {
                    setOpenMinute(e.target.value);
                    setErrors((prev) => ({ ...prev, timeMismatch: undefined }));
                  }}
                  className="flex-1 bg-card border border-border rounded-2xl px-3 py-3 text-sm font-data text-text-primary focus:outline-none focus:border-primary"
                >
                  <option value="00">00 mins</option>
                  <option value="30">30 mins</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-text-secondary">Closing Time *</label>
              <div className="flex gap-2">
                <select
                  value={closeHour}
                  onChange={(e) => {
                    setCloseHour(e.target.value);
                    setErrors((prev) => ({ ...prev, timeMismatch: undefined }));
                  }}
                  className="flex-1 bg-card border border-border rounded-2xl px-3 py-3 text-sm font-data text-text-primary focus:outline-none focus:border-primary"
                >
                  {Array.from({ length: 24 }).map((_, i) => {
                    const h = String(i).padStart(2, '0');
                    return (
                      <option key={h} value={h}>
                        {h} hrs
                      </option>
                    );
                  })}
                </select>
                <select
                  value={closeMinute}
                  onChange={(e) => {
                    setCloseMinute(e.target.value);
                    setErrors((prev) => ({ ...prev, timeMismatch: undefined }));
                  }}
                  className="flex-1 bg-card border border-border rounded-2xl px-3 py-3 text-sm font-data text-text-primary focus:outline-none focus:border-primary"
                >
                  <option value="00">00 mins</option>
                  <option value="30">30 mins</option>
                </select>
              </div>
            </div>
          </div>
          {errors.timeMismatch && (
            <p className="text-xs text-error font-body mt-1">{errors.timeMismatch}</p>
          )}

          <div className="space-y-1">
            <label className="block text-xs font-semibold text-text-secondary">Total Seats *</label>
            <input
              type="number"
              required
              min={1}
              max={500}
              value={formData.totalSeats || ''}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                setFormData((prev) => ({ ...prev, totalSeats: isNaN(val) ? 0 : val }));
                setErrors((prev) => ({ ...prev, totalSeats: undefined }));
              }}
              placeholder="e.g., 20"
              className="w-full bg-card border border-border rounded-2xl px-4 py-3 text-sm font-data text-text-primary focus:outline-none focus:border-primary"
            />
            {errors.totalSeats && (
              <p className="text-xs text-error mt-1 font-body">{errors.totalSeats}</p>
            )}
          </div>
        </div>

        {/* FORM SECTION 4: Amenities */}
        <div className="space-y-3">
          <h3 className="font-heading font-semibold text-xs text-text-secondary uppercase tracking-widest border-b border-border pb-2">
            Amenities
          </h3>
          <p className="font-body text-xs text-text-secondary">Select all that apply to your venue</p>

          <div className="flex flex-wrap gap-2">
            {AMENITY_OPTIONS.map((opt) => {
              const isSelected = selectedAmenities.includes(opt.value);
              const Icon = opt.icon;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggleAmenity(opt.value)}
                  className={`px-3.5 py-2 rounded-full border text-sm font-body flex items-center gap-1.5 active:scale-95 transition-all ${
                    isSelected
                      ? 'bg-primary text-white border-primary shadow-sm font-medium'
                      : 'bg-card border-border text-text-secondary hover:text-text-primary'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* FORM SECTION 5: Photos (URL Input) */}
        <div className="space-y-4">
          <h3 className="font-heading font-semibold text-xs text-text-secondary uppercase tracking-widest border-b border-border pb-2">
            Venue Photos
          </h3>
          <p className="font-body text-xs text-text-secondary">
            Provide direct image URLs for your café. The first photo acts as the cover image (Maximum 4).
          </p>

          <div className="space-y-3">
            {photoUrls.map((url, index) => (
              <div key={index} className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => {
                      const newUrls = [...photoUrls];
                      newUrls[index] = e.target.value;
                      setPhotoUrls(newUrls);
                    }}
                    placeholder={`Photo URL #${index + 1} (https://...)`}
                    className="flex-1 bg-card border border-border rounded-2xl px-4 py-3 text-sm font-body text-text-primary focus:outline-none focus:border-primary"
                  />
                  {photoUrls.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setPhotoUrls(photoUrls.filter((_, i) => i !== index))}
                      className="p-3 text-error bg-red-50 hover:bg-red-100 border border-red-200 rounded-2xl flex items-center justify-center shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* URL Image preview rendering */}
                {url.trim().startsWith('http') && (
                  <div className="relative w-28 h-20 rounded-xl overflow-hidden bg-surface border border-border">
                    <img
                      src={url}
                      alt={`Preview #${index + 1}`}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                        const p = (e.target as HTMLElement).parentElement;
                        if (p) {
                          const errText = document.createElement('span');
                          errText.className = 'text-[10px] text-error font-medium flex items-center justify-center h-full';
                          errText.innerText = 'Invalid image URL';
                          p.appendChild(errText);
                        }
                      }}
                    />
                  </div>
                )}
              </div>
            ))}

            {photoUrls.length < 4 && (
              <button
                type="button"
                onClick={() => setPhotoUrls([...photoUrls, ''])}
                className="btn-outline text-sm w-full py-2.5 rounded-2xl mt-1 flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>Add another photo</span>
              </button>
            )}
          </div>
        </div>

        {/* SUBMIT BUTTON BAR (Fixed Bottom) */}
        <div className="fixed bottom-0 left-0 right-0 z-20 bg-card border-t border-border px-4 py-3.5 shadow-lg">
          <div className="max-w-md mx-auto">
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : cafeId ? (
                <>
                  <Check className="w-5 h-5" />
                  <span>Save Changes</span>
                </>
              ) : (
                <>
                  <Send className="w-5 h-5" />
                  <span>Submit for Verification</span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
