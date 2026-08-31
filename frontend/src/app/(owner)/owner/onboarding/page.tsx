'use client';

import { useState, useEffect, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  Store,
  Clock,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  ChevronLeft,
  ShieldCheck,
  MapPin,
  CreditCard,
  Monitor,
  Gamepad2,
  FileText,
  Image as ImageIcon
} from 'lucide-react';
import { getOnboardingDraft, saveOnboardingDraft, submitOnboardingApplication } from '@/lib/api/owner';
import { useAuthStore } from '@/store/authStore';
import { Button, Input, Textarea, Card, CardContent, Badge } from '@/components/ui';
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
import { INDIAN_STATES } from '@/constants/states';
import { SUPPORTED_CITIES } from '@/constants/cities';
import { PlatformTierConfigurator } from '@/components/owner/PlatformTierConfigurator';
import type { TierConfig } from '@/types/tier';
import { safeRandomUUID } from '@/lib/uuid';
import { getPublicEnv } from '@/lib/runtimeEnv';

const PRESET_GAMES = [
  'Valorant',
  'Counter-Strike 2',
  'GTA V Online',
  'EA Sports FC 24',
  'Dota 2',
  'Apex Legends',
  'Fortnite',
  'Call of Duty: Warzone',
  'League of Legends',
  'Overwatch 2',
  'Tekken 8',
  'Rocket League',
];

interface OnboardingState {
  name: string;
  description: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  pincode: string;
  latitude: number | null;
  longitude: number | null;
  phoneNumber: string;
  email: string;
  businessPan: string;
  hasGst: boolean;
  gstin: string;
  legalDocumentUrl: string;
  bankAccountNumber: string;
  bankIfsc: string;
  accountHolderName: string;
  openingTime: string;
  closingTime: string;
  totalSeats: number;
  hardwareTiers: TierConfig[];
  supportedGames: string[];
  amenities: string[];
  photos: string[];
  cancellationPolicy: string;
  houseRules: string[];
  instagram: string;
  discord: string;
}

const INITIAL_STATE: OnboardingState = {
  name: '',
  description: '',
  addressLine1: '',
  addressLine2: '',
  city: 'Bengaluru',
  state: 'Karnataka',
  pincode: '560001',
  latitude: 12.9716,
  longitude: 77.5946,
  phoneNumber: '',
  email: '',
  businessPan: 'ABCDE1234F',
  hasGst: false,
  gstin: '',
  legalDocumentUrl: '',
  bankAccountNumber: '',
  bankIfsc: '',
  accountHolderName: '',
  openingTime: '09:00',
  closingTime: '23:00',
  totalSeats: 20,
  hardwareTiers: [],
  supportedGames: ['Valorant', 'Counter-Strike 2', 'GTA V Online', 'EA Sports FC 24'],
  amenities: ['High-speed Wi-Fi', 'Air Conditioned', 'Snacks & Drinks'],
  photos: ['https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=1200&auto=format&fit=crop'],
  cancellationPolicy: 'Free cancellation up to 2 hours before session start time.',
  houseRules: ['No outside food or beverages permitted inside station pods.', 'Valid Photo ID required at check-in.'],
  instagram: '',
  discord: '',
};

export default function OnboardingWizardPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<OnboardingState>(INITIAL_STATE);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load server-persisted draft on mount with StrictMode cleanup flag
  useEffect(() => {
    let isMounted = true;
    async function loadDraft() {
      try {
        const res = await getOnboardingDraft();
        if (isMounted && res.draft && Object.keys(res.draft).length > 0) {
          const draft: Record<string, any> = { ...res.draft };
          // Sanitize pre-Platform-V2 drafts: the old hardwareTiers shape
          // ({name, gpu, cpu, monitor, ...}, no `platform`) renders nothing
          // in PlatformTierConfigurator but is still silently carried in
          // formData and submitted as an invisible "ghost" tier with
          // fabricated specs (see final-review.md C3). Drop any entry that
          // isn't a real platform-shaped config, and mint an id for any
          // survivor that's missing one.
          if (Array.isArray(draft.hardwareTiers)) {
            draft.hardwareTiers = draft.hardwareTiers
              .filter((t: any) => t && typeof t.platform === 'string' && t.platform.length > 0)
              .map((t: any) => (t.id ? t : { ...t, id: safeRandomUUID() }));
          }
          setFormData((prev) => ({ ...prev, ...draft }));
          if (res.draft.step && typeof res.draft.step === 'number') {
            setStep(res.draft.step);
          }
        }
      } catch {
        // Fallback to local session
      }
    }
    loadDraft();
    return () => {
      isMounted = false;
    };
  }, []);

  const updateField = (field: keyof OnboardingState, value: any) => {
    const updated = { ...formData, [field]: value };
    setFormData(updated);
  };

  const handleNext = async () => {
    setError(null);
    
    // Step 1: Basic validation
    if (step === 1) {
      if (!formData.name || !formData.addressLine1 || !formData.city || !formData.state || !formData.pincode) {
        setError('Please complete all required business identity, address, and pincode fields.');
        return;
      }
      if (formData.name.trim().length < 2) {
        setError('Café Name must be at least 2 characters long.');
        return;
      }
      if (!/^\d{6}$/.test(formData.pincode)) {
        setError('Please enter a valid 6-digit Indian pincode.');
        return;
      }
    }
    
    // Step 2: Business verification
    if (step === 2) {
      if (formData.phoneNumber && !/^\+91[6-9]\d{9}$/.test(formData.phoneNumber)) {
        setError('Please enter a valid Indian mobile number (+91 XXXXX XXXXX).');
        return;
      }
      if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
        setError('Please enter a valid email address.');
        return;
      }
      if (formData.hasGst && formData.gstin) {
        const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
        if (!GSTIN_REGEX.test(formData.gstin.toUpperCase())) {
          setError('Please enter a valid 15-character GSTIN (e.g. 29ABCDE1234F1Z5).');
          return;
        }
      }
    }
    
    // Step 3: Bank & Payouts
    if (step === 3) {
      if (formData.businessPan) {
        const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
        if (!panRegex.test(formData.businessPan.toUpperCase())) {
          setError('Please enter a valid 10-character Business PAN format (e.g. ABCDE1234F).');
          return;
        }
      }
      if (formData.accountHolderName && formData.accountHolderName.length < 2) {
        setError('Account holder name must be at least 2 characters.');
        return;
      }
      if (formData.bankAccountNumber) {
        if (!/^\d{8,18}$/.test(formData.bankAccountNumber)) {
          setError('Bank account number must be 8-18 digits.');
          return;
        }
        if (!formData.bankIfsc || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(formData.bankIfsc.toUpperCase())) {
          setError('Please enter a valid Bank IFSC code (e.g. HDFC0000128).');
          return;
        }
      }
      if (formData.bankIfsc && !formData.bankAccountNumber) {
        setError('Please enter bank account number along with IFSC code.');
        return;
      }
    }

    // Step 4: Hardware tiers. INITIAL_STATE seeds an empty array (this used
    // to be unreachable because two tiers were pre-seeded) — an owner must
    // not be able to click through to a live, unbookable, zero-tier café.
    // Mirrors owner/tiers/page.tsx's blank-model guard so both consumers of
    // PlatformTierConfigurator enforce the same guarantee.
    if (step === 4) {
      if (!formData.hardwareTiers || formData.hardwareTiers.length === 0) {
        setError('Please add at least one hardware tier before continuing.');
        return;
      }
      const hasBlankModel = formData.hardwareTiers.some((t) => !t.model || !t.model.trim());
      if (hasBlankModel) {
        setError('Please select a model for every hardware tier before continuing.');
        return;
      }
    }

    const nextStep = Math.min(step + 1, 6);
    setStep(nextStep);
    try {
      await saveOnboardingDraft(nextStep, formData);
    } catch {
      // Ignore draft save error
    }
  };

  const handleBack = () => {
    setError(null);
    setStep((s) => Math.max(s - 1, 1));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const formatTimeString = (timeStr: string) => {
      if (!timeStr) return '09:00:00';
      if (timeStr.length === 5) return `${timeStr}:00`;
      return timeStr;
    };

    const formattedHardwareTiers = (formData.hardwareTiers || []).map((c: TierConfig) => ({
      platform: c.platform,
      model: c.model,
      hourlyRate: Number(c.pricePerHour) || 100,
      totalSeats: Number(c.totalSeats) || 4,
      appBookableSeats: Number(c.appBookableSeats) || Math.max(1, Math.round((Number(c.totalSeats) || 4) * 0.25)),
    }));

    try {
      await submitOnboardingApplication({
        name: formData.name,
        description: formData.description,
        addressLine1: formData.addressLine1,
        addressLine2: formData.addressLine2,
        city: formData.city,
        state: formData.state,
        pincode: formData.pincode || '560001',
        latitude: formData.latitude,
        longitude: formData.longitude,
        phoneNumber: formData.phoneNumber || user?.phoneNumber || '+919876543210',
        email: formData.email || user?.email,
        openingTime: formatTimeString(formData.openingTime),
        closingTime: formatTimeString(formData.closingTime),
        totalSeats: Number(formData.totalSeats) || 20,
        amenities: formData.amenities,
        photos: formData.photos,
        supportedGames: formData.supportedGames,
        businessPan: formData.businessPan || undefined,
        gstin: formData.gstin || undefined,
        legalDocumentUrl: formData.legalDocumentUrl || undefined,
        bankAccountNumber: formData.bankAccountNumber || undefined,
        bankIfsc: formData.bankIfsc || undefined,
        accountHolderName: formData.accountHolderName || user?.fullName || undefined,
        cancellationPolicy: formData.cancellationPolicy,
        houseRules: formData.houseRules,
        socialLinks: { instagram: formData.instagram, discord: formData.discord },
        hardwareTiers: formattedHardwareTiers,
      });

      setIsSubmitted(true);
    } catch (err: any) {
      const details = err?.details || err?.response?.data?.detail;
      let msg = err?.message || 'Failed to submit café application.';
      if (Array.isArray(details)) {
        const fieldMsgs = details.map((d: any) => `${d.loc?.[d.loc?.length - 1] || 'Field'}: ${d.msg}`).join(', ');
        msg = `Validation Error: ${fieldMsgs}`;
      }
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="flex flex-col items-center text-center max-w-xl mx-auto py-12 px-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-500/10 text-emerald-600 mb-6 shadow-sm">
          <Clock className="h-8 w-8 animate-pulse" />
        </div>

        <Badge variant="success" size="md" className="mb-3">
          Application Submitted Successfully
        </Badge>

        <h1 className="font-heading text-display text-text-primary mb-3">
          Café Application Under Review!
        </h1>

        <p className="text-body text-text-secondary leading-relaxed mb-8">
          Thank you for applying to list <span className="font-semibold text-text-primary">{formData.name}</span> on KHEL. Our platform compliance team will inspect your venue details within 24 hours.
        </p>

        <Card elevation="resting" className="w-full mb-8 text-left bg-surface border border-border">
          <CardContent className="p-5 flex flex-col gap-3">
            <h3 className="font-heading text-h3 text-text-primary">What happens next?</h3>
            <div className="flex items-start gap-3 text-caption text-text-secondary">
              <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-0.5" />
              <span>Admin reviews venue coordinates, legal documents & Razorpay Route payout setup.</span>
            </div>
            <div className="flex items-start gap-3 text-caption text-text-secondary">
              <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-0.5" />
              <span>Upon verification, your account automatically unlocks the full Live Owner Portal.</span>
            </div>
            <div className="flex items-start gap-3 text-caption text-text-secondary">
              <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-0.5" />
              <span>You will receive notification when your venue goes live to gamers.</span>
            </div>
          </CardContent>
        </Card>

        <Button
          variant="primary"
          size="lg"
          onClick={async () => {
            try {
              const refreshToken = localStorage.getItem('refreshToken');
              if (refreshToken) {
                const refreshRes = await fetch(`${getPublicEnv('NEXT_PUBLIC_API_URL', 'http://localhost:8000')}/api/v1/auth/refresh`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ refreshToken })
                });
                if (refreshRes.ok) {
                  const data = await refreshRes.json();
                  localStorage.setItem('accessToken', data.data.accessToken);
                  localStorage.setItem('refreshToken', data.data.refreshToken);
                  const userRes = await fetch(`${getPublicEnv('NEXT_PUBLIC_API_URL', 'http://localhost:8000')}/api/v1/auth/refresh`, {
                    headers: { Authorization: `Bearer ${data.data.accessToken}` }
                  });
                  if (userRes.ok) {
                    const userData = await userRes.json();
                    localStorage.setItem('user', JSON.stringify(userData.data?.user || userData.data));
                  }
                }
              }
            } catch {
              // Ignore token sync error
            }
            window.location.href = '/owner/dashboard';
          }}
        >
          Go to Owner Dashboard Status
        </Button>
      </div>
    );
  }

  const stepsList = [
    { title: 'Identity & Map Pin', icon: MapPin },
    { title: 'Business Verification', icon: ShieldCheck },
    { title: 'Bank & Payouts', icon: CreditCard },
    { title: 'Hours & Hardware Tiers', icon: Monitor },
    { title: 'Games & Photos', icon: Gamepad2 },
    { title: 'Policies & Review', icon: FileText },
  ];

  return (
    <div className="max-w-3xl mx-auto pb-16 pt-4 px-4">
      {/* Wizard Header */}
      <div className="flex flex-col gap-3 mb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500 text-slate-950 shadow-md">
              <Store className="h-6 w-6" />
            </div>
            <div>
              <h1 className="font-heading text-h2 text-text-primary">Café Onboarding Setup</h1>
              <p className="text-caption text-text-secondary">Step {step} of 6: {stepsList[step - 1].title}</p>
            </div>
          </div>
          <Badge variant="success" size="md" className="hidden sm:inline-flex">
            Auto-Saving Progress
          </Badge>
        </div>

        {/* Multi-Step Indicator */}
        <div className="grid grid-cols-6 gap-1.5 mt-2">
          {stepsList.map((s, idx) => {
            const isDone = idx + 1 < step;
            const isCurrent = idx + 1 === step;
            return (
              <div key={idx} className="flex flex-col gap-1">
                <div
                  className={`h-2 rounded-full transition-all duration-300 ${
                    isDone ? 'bg-emerald-500' : isCurrent ? 'bg-primary' : 'bg-border'
                  }`}
                />
                <span className={`text-[10px] hidden md:block font-medium truncate ${isCurrent ? 'text-primary font-bold' : 'text-text-tertiary'}`}>
                  {s.title}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-body text-rose-600 mb-6">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <Card elevation="raised" className="bg-surface border border-border">
        <CardContent className="p-6 md:p-8">
          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            {/* STEP 1: IDENTITY & MAP PIN */}
            {step === 1 && (
              <div className="flex flex-col gap-4">
                <div>
                  <h2 className="font-heading text-h2 text-text-primary flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-emerald-500" />
                    <span>1. Café Identity & Location Pin</span>
                  </h2>
                  <p className="text-caption text-text-secondary">Provide basic business details and drop your pin on Google Maps.</p>
                </div>

                <Input
                  label="Café Name *"
                  placeholder="e.g. Velocity Esports Lounge"
                  value={formData.name}
                  onChange={(e) => updateField('name', e.target.value)}
                  required
                />

                <Textarea
                  label="Café Description"
                  placeholder="Describe your PC specs, gaming vibe, food options, or tournament setups..."
                  value={formData.description}
                  onChange={(e) => updateField('description', e.target.value)}
                />

                <div className="flex flex-col gap-1.5">
                  <label className="text-caption font-semibold text-text-primary flex items-center gap-1.5">
                    <MapPin className="h-4 w-4 text-emerald-500" />
                    <span>Select Location Pin on Google Maps *</span>
                  </label>
                  <GoogleLocationPicker
                    initialLat={formData.latitude || 12.9716}
                    initialLng={formData.longitude || 77.5946}
                    onLocationSelect={(res) => {
                      updateField('latitude', res.lat);
                      updateField('longitude', res.lng);
                      if (res.addressLine1) updateField('addressLine1', res.addressLine1);
                      // Google's geocoded "locality" is free text and often
                      // doesn't match our fixed city list (e.g. it can return
                      // a suburb/neighbouring municipality instead of the
                      // metro city KHEL-O actually operates in) — this was
                      // the root cause of cafés silently disappearing from
                      // their own city's filter. Only auto-fill when it's an
                      // exact (case-insensitive) match to a supported city;
                      // otherwise leave the dropdown for the owner to pick.
                      if (res.city) {
                        const matched = SUPPORTED_CITIES.find(
                          (c) => c.toLowerCase() === res.city!.trim().toLowerCase()
                        );
                        if (matched) updateField('city', matched);
                      }
                      if (res.state) updateField('state', res.state);
                      if (res.pincode) updateField('pincode', res.pincode);
                    }}
                  />
                </div>

                <Input
                  label="Address Line 1 *"
                  placeholder="Building number, street address"
                  value={formData.addressLine1}
                  onChange={(e) => updateField('addressLine1', e.target.value)}
                  required
                />

                <Input
                  label="Address Line 2 (Optional)"
                  placeholder="Landmark, floor number"
                  value={formData.addressLine2}
                  onChange={(e) => updateField('addressLine2', e.target.value)}
                />

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-caption font-semibold text-text-primary">
                      City *
                    </label>
                    <select
                      value={formData.city}
                      onChange={(e) => updateField('city', e.target.value)}
                      className="flex h-10 w-full rounded-xl border border-border bg-card px-3 py-2 text-body text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                      required
                    >
                      <option value="">Select City</option>
                      {SUPPORTED_CITIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                    <p className="text-overline text-text-tertiary">
                      Not seeing your city? KHEL-O isn&apos;t live there yet — contact support.
                    </p>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-caption font-semibold text-text-primary">
                      State *
                    </label>
                    <select
                      value={formData.state}
                      onChange={(e) => updateField('state', e.target.value)}
                      className="flex h-10 w-full rounded-xl border border-border bg-card px-3 py-2 text-body text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                      required
                    >
                      <option value="">Select State</option>
                      {INDIAN_STATES.map((state) => (
                        <option key={state} value={state}>
                          {state}
                        </option>
                      ))}
                    </select>
                  </div>

                  <Input
                    label="Pincode"
                    placeholder="560001"
                    value={formData.pincode}
                    onChange={(e) => updateField('pincode', e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* STEP 2: BUSINESS VERIFICATION */}
            {step === 2 && (
              <div className="flex flex-col gap-4">
                <div>
                  <h2 className="font-heading text-h2 text-text-primary flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-emerald-500" />
                    <span>2. Business Verification & Legal Documents</span>
                  </h2>
                  <p className="text-caption text-text-secondary">Verify your business identity to build trust with gamers.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    label="Business Contact Phone Number"
                    placeholder="+91 98765 43210"
                    value={formData.phoneNumber}
                    onChange={(e) => updateField('phoneNumber', e.target.value)}
                  />

                  <Input
                    label="Official Business Email"
                    placeholder="contact@esportsarena.in"
                    value={formData.email}
                    onChange={(e) => updateField('email', e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    label="Business PAN Number (Optional)"
                    placeholder="ABCDE1234F"
                    value={formData.businessPan}
                    onChange={(e) => updateField('businessPan', e.target.value.toUpperCase())}
                  />

                  <div className="flex flex-col gap-2">
                    <label className="text-caption font-semibold text-text-primary">
                      Do you have GST registration?
                    </label>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          updateField('hasGst', true);
                          if (!formData.gstin) {
                            updateField('gstin', '');
                          }
                        }}
                        className={`flex-1 px-4 py-2 rounded-xl text-caption font-semibold transition-all ${
                          formData.hasGst
                            ? 'bg-primary text-white border-2 border-primary'
                            : 'bg-surface text-text-secondary border border-border hover:border-primary'
                        }`}
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          updateField('hasGst', false);
                          updateField('gstin', '');
                        }}
                        className={`flex-1 px-4 py-2 rounded-xl text-caption font-semibold transition-all ${
                          !formData.hasGst
                            ? 'bg-primary text-white border-2 border-primary'
                            : 'bg-surface text-text-secondary border border-border hover:border-primary'
                        }`}
                      >
                        No
                      </button>
                    </div>
                  </div>
                </div>

                {formData.hasGst && (
                  <Input
                    label="GSTIN Number"
                    placeholder="29ABCDE1234F1Z5"
                    value={formData.gstin}
                    onChange={(e) => updateField('gstin', e.target.value.toUpperCase())}
                    required
                  />
                )}

                <Input
                  label="Trade License / Registration Document URL"
                  placeholder="https://drive.google.com/... or document link"
                  value={formData.legalDocumentUrl}
                  onChange={(e) => updateField('legalDocumentUrl', e.target.value)}
                />
              </div>
            )}

            {/* STEP 3: BANK & PAYOUTS */}
            {step === 3 && (
              <div className="flex flex-col gap-4">
                <div>
                  <h2 className="font-heading text-h2 text-text-primary flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-emerald-500" />
                    <span>3. Bank Account & Razorpay Route Settlement</span>
                  </h2>
                  <p className="text-caption text-text-secondary">Direct automated payouts into your bank account.</p>
                </div>

                <Card elevation="resting" className="bg-emerald-500/5 border border-emerald-500/20 text-caption p-4">
                  <span className="font-semibold text-emerald-600 block mb-1">Razorpay Route Direct Settlement</span>
                  KHEL processes customer payments securely through Razorpay Route. Earnings settle directly to your registered bank account.
                </Card>

                <Input
                  label="Account Holder Name"
                  placeholder="e.g. LXG Gaming Private Limited"
                  value={formData.accountHolderName}
                  onChange={(e) => updateField('accountHolderName', e.target.value)}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    label="Bank Account Number"
                    name="bank-account-number"
                    autoComplete="off"
                    placeholder="9180200192847291"
                    value={formData.bankAccountNumber}
                    onChange={(e) => updateField('bankAccountNumber', e.target.value)}
                  />

                  <Input
                    label="Bank IFSC Code"
                    name="bank-ifsc-code"
                    autoComplete="off"
                    placeholder="HDFC0000128"
                    value={formData.bankIfsc}
                    onChange={(e) => updateField('bankIfsc', e.target.value.toUpperCase())}
                  />
                </div>
              </div>
            )}

            {/* STEP 4: HOURS & HARDWARE TIERS */}
            {step === 4 && (
              <div className="flex flex-col gap-6">
                <div>
                  <h2 className="font-heading text-h2 text-text-primary flex items-center gap-2">
                    <Monitor className="h-5 w-5 text-emerald-500" />
                    <span>4. Operating Hours & Hardware Tiers</span>
                  </h2>
                  <p className="text-caption text-text-secondary">Define hardware tiers and pricing. PC assignment is handled on-site by staff during check-in.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Input
                    label="Opening Time *"
                    type="time"
                    required
                    value={formData.openingTime}
                    onChange={(e) => updateField('openingTime', e.target.value)}
                    error={!formData.openingTime ? 'Opening time is required' : undefined}
                  />

                  <Input
                    label="Closing Time *"
                    type="time"
                    required
                    value={formData.closingTime}
                    onChange={(e) => updateField('closingTime', e.target.value)}
                    error={!formData.closingTime ? 'Closing time is required' : undefined}
                  />

                  <Input
                    label="Total Station Capacity"
                    type="number"
                    min="1"
                    value={formData.totalSeats}
                    onChange={(e) => updateField('totalSeats', Number(e.target.value))}
                  />
                </div>

                <div className="flex flex-col gap-3">
                  <h3 className="font-heading text-h3 text-text-primary">What does your café offer?</h3>
                  <p className="text-caption text-text-secondary">
                    Set up your stations by platform — no technical specs needed, just what you have and what it costs.
                  </p>
                  <PlatformTierConfigurator
                    configs={formData.hardwareTiers}
                    onChange={(configs) => updateField('hardwareTiers', configs)}
                  />
                </div>
              </div>
            )}

            {/* STEP 5: GAMES & PHOTOS */}
            {step === 5 && (
              <div className="flex flex-col gap-6">
                <div>
                  <h2 className="font-heading text-h2 text-text-primary flex items-center gap-2">
                    <Gamepad2 className="h-5 w-5 text-emerald-500" />
                    <span>5. Games Supported & Photo Gallery</span>
                  </h2>
                  <p className="text-caption text-text-secondary">Showcase your library of pre-installed games and venue photos.</p>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-caption font-semibold text-text-primary">Pre-Installed Games</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {PRESET_GAMES.map((game) => {
                      const isSelected = formData.supportedGames.includes(game);
                      return (
                        <button
                          key={game}
                          type="button"
                          onClick={() => {
                            const updated = isSelected
                              ? formData.supportedGames.filter((g) => g !== game)
                              : [...formData.supportedGames, game];
                            updateField('supportedGames', updated);
                          }}
                          className={`p-2.5 rounded-xl text-caption font-semibold flex items-center justify-between border transition-all ${
                            isSelected
                              ? 'bg-emerald-500/10 border-emerald-500 text-emerald-600'
                              : 'bg-surface border-border text-text-secondary hover:bg-border/40'
                          }`}
                        >
                          <span>{game}</span>
                          {isSelected && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Photos are uploaded from the device AFTER the café exists: the
                    presigned-upload endpoint is scoped to a real cafe_id
                    (/owner/cafes/{cafe_id}/photos/presign), so there is nothing to
                    sign against until this form is submitted. Asking an owner to
                    paste an image URL here was the wrong ask — point them at the
                    real uploader instead. */}
                <div className="flex flex-col gap-2">
                  <label className="text-caption font-semibold text-text-primary">Venue Photos</label>
                  <div className="flex items-start gap-3 rounded-xl border border-border bg-surface p-3.5">
                    <div className="h-9 w-9 flex-shrink-0 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                      <ImageIcon className="h-4 w-4" />
                    </div>
                    <p className="text-caption text-text-secondary">
                      You&apos;ll upload real photos straight from your phone or computer as soon as
                      this café is created — head to{' '}
                      <span className="font-semibold text-text-primary">
                        Café Settings → Edit Profile → Amenities &amp; Photos
                      </span>
                      . Until then your listing shows a placeholder image.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-caption font-semibold text-text-primary">Menu (Optional)</label>
                  <div className="flex items-start gap-3 rounded-xl border border-border bg-surface p-3.5">
                    <div className="h-9 w-9 flex-shrink-0 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                      <ImageIcon className="h-4 w-4" />
                    </div>
                    <p className="text-caption text-text-secondary">
                      Have food or drinks? You&apos;ll be able to upload your menu photo from{' '}
                      <span className="font-semibold text-text-primary">
                        Café Settings → Edit Profile → Menu
                      </span>
                      {' '}as soon as your café is approved.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 6: POLICIES & REVIEW */}
            {step === 6 && (
              <div className="flex flex-col gap-6">
                <div>
                  <h2 className="font-heading text-h2 text-text-primary flex items-center gap-2">
                    <FileText className="h-5 w-5 text-emerald-500" />
                    <span>6. Policies & Review Application</span>
                  </h2>
                  <p className="text-caption text-text-secondary">Confirm details before submitting your venue for platform verification.</p>
                </div>

                <Textarea
                  label="Cancellation Policy"
                  value={formData.cancellationPolicy}
                  onChange={(e) => updateField('cancellationPolicy', e.target.value)}
                />

                <div className="flex flex-col gap-3 bg-surface p-5 rounded-2xl border border-border text-body">
                  <h3 className="font-heading text-h3 text-text-primary border-b border-border pb-2">Submission Summary</h3>
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Venue Name:</span>
                    <span className="font-semibold text-text-primary">{formData.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Location:</span>
                    <span className="font-semibold text-text-primary">{formData.city}, {formData.state}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Hardware Tiers:</span>
                    <span className="font-semibold text-text-primary">{formData.hardwareTiers.length} Tiers Configured</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Games Supported:</span>
                    <span className="font-semibold text-text-primary">{formData.supportedGames.length} Games</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Payout Account:</span>
                    <span className="font-semibold text-emerald-600">
                      {formData.bankAccountNumber ? `Masked Account (${formData.bankAccountNumber.slice(-4)})` : 'Not Provided'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Form Navigation Controls */}
            <div className="flex items-center justify-between border-t border-border pt-6 mt-4">
              {step > 1 ? (
                <Button type="button" variant="ghost" onClick={handleBack} className="gap-1">
                  <ChevronLeft className="h-4 w-4" />
                  <span>Back</span>
                </Button>
              ) : (
                <div />
              )}

              {step < 6 ? (
                <Button type="button" variant="primary" onClick={handleNext} className="gap-1 px-6">
                  <span>Next Step</span>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  isLoading={isSubmitting}
                  loadingText="Submitting Application..."
                  className="gap-2 px-8 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold"
                >
                  <ShieldCheck className="h-5 w-5" />
                  <span>Submit Café Application</span>
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
