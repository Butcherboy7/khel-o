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
  Plus,
  Trash2
} from 'lucide-react';
import { getOnboardingDraft, saveOnboardingDraft, submitOnboardingApplication } from '@/lib/api/owner';
import { useAuthStore } from '@/store/authStore';
import { Button, Input, Textarea, Card, CardContent, Badge } from '@/components/ui';
import { GoogleLocationPicker } from '@/components/maps/GoogleLocationPicker';

const GPU_PRESETS = [
  { name: 'Standard RTX 3060 Pods', gpu: 'NVIDIA RTX 3060 / 16GB RAM', hourlyRate: 100, totalSeats: 10 },
  { name: 'High-End RTX 4070 Pods', gpu: 'NVIDIA RTX 4070 / 32GB RAM', hourlyRate: 150, totalSeats: 8 },
  { name: 'Flagship RTX 4090 Arena', gpu: 'NVIDIA RTX 4090 / 240Hz Displays', hourlyRate: 250, totalSeats: 4 },
  { name: 'PS5 Console Lounge', gpu: 'PlayStation 5 / 4K OLED HDR', hourlyRate: 200, totalSeats: 2 },
  { name: 'VR Flight & Racing Sim Bay', gpu: 'Motion Sim + VR Headset', hourlyRate: 350, totalSeats: 1 },
];

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
  gstin: string;
  legalDocumentUrl: string;
  bankAccountNumber: string;
  bankIfsc: string;
  accountHolderName: string;
  openingTime: string;
  closingTime: string;
  totalSeats: number;
  hardwareTiers: Array<{
    name: string;
    gpu: string;
    hourlyRate: number;
    totalSeats: number;
  }>;
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
  gstin: '',
  legalDocumentUrl: '',
  bankAccountNumber: '',
  bankIfsc: '',
  accountHolderName: '',
  openingTime: '09:00',
  closingTime: '23:00',
  totalSeats: 20,
  hardwareTiers: [
    { name: 'Standard RTX 3060 Pods', gpu: 'NVIDIA RTX 3060 / 16GB RAM', hourlyRate: 100, totalSeats: 12 },
    { name: 'High-End RTX 4070 Pods', gpu: 'NVIDIA RTX 4070 / 32GB RAM', hourlyRate: 150, totalSeats: 8 },
  ],
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
          setFormData((prev) => ({ ...prev, ...res.draft }));
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
    if (step === 1) {
      if (!formData.name || !formData.addressLine1 || !formData.city || !formData.state || !formData.pincode) {
        setError('Please complete all required business identity, address, and pincode fields.');
        return;
      }
    }
    if (step === 3) {
      if (formData.businessPan) {
        const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
        if (!panRegex.test(formData.businessPan.toUpperCase())) {
          setError('Please enter a valid 10-character Business PAN format (e.g. ABCDE1234F).');
          return;
        }
      }
      if (formData.bankAccountNumber && !formData.bankIfsc) {
        setError('Please enter a valid Bank IFSC code.');
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

    const formattedHardwareTiers = (formData.hardwareTiers || []).map((t) => ({
      name: t.name,
      gpu: t.gpu,
      hourlyRate: Number(t.hourlyRate) || 100,
      totalSeats: Number(t.totalSeats) || 10,
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
        businessPan: formData.businessPan,
        gstin: formData.gstin,
        legalDocumentUrl: formData.legalDocumentUrl,
        bankAccountNumber: formData.bankAccountNumber,
        bankIfsc: formData.bankIfsc,
        accountHolderName: formData.accountHolderName || user?.fullName,
        cancellationPolicy: formData.cancellationPolicy,
        houseRules: formData.houseRules,
        socialLinks: { instagram: formData.instagram, discord: formData.discord },
        hardwareTiers: formattedHardwareTiers,
      });

      setIsSubmitted(true);
    } catch (err: any) {
      setError(err?.message || 'Failed to submit café application. Please try again.');
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

        <Button variant="primary" size="lg" onClick={() => router.push('/owner/dashboard')}>
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
                    onLocationSelect={(pos) => {
                      updateField('latitude', pos.lat);
                      updateField('longitude', pos.lng);
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
                  <Input
                    label="City *"
                    value={formData.city}
                    onChange={(e) => updateField('city', e.target.value)}
                    required
                  />

                  <Input
                    label="State *"
                    value={formData.state}
                    onChange={(e) => updateField('state', e.target.value)}
                    required
                  />

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

                  <Input
                    label="GSTIN Number (Optional)"
                    placeholder="29ABCDE1234F1Z5"
                    value={formData.gstin}
                    onChange={(e) => updateField('gstin', e.target.value.toUpperCase())}
                  />
                </div>

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
                    placeholder="9180200192847291"
                    value={formData.bankAccountNumber}
                    onChange={(e) => updateField('bankAccountNumber', e.target.value)}
                  />

                  <Input
                    label="Bank IFSC Code"
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
                    label="Opening Time"
                    type="time"
                    value={formData.openingTime}
                    onChange={(e) => updateField('openingTime', e.target.value)}
                  />

                  <Input
                    label="Closing Time"
                    type="time"
                    value={formData.closingTime}
                    onChange={(e) => updateField('closingTime', e.target.value)}
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
                  <div className="flex items-center justify-between">
                    <h3 className="font-heading text-h3 text-text-primary">Hardware Tiers</h3>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        updateField('hardwareTiers', [
                          ...formData.hardwareTiers,
                          { name: 'Custom Hardware Tier', gpu: 'RTX 3070 / 16GB', hourlyRate: 120, totalSeats: 5 }
                        ]);
                      }}
                      className="gap-1.5"
                    >
                      <Plus className="h-4 w-4" />
                      <span>Add Tier</span>
                    </Button>
                  </div>

                  {/* GPU Presets Selector */}
                  <div className="flex flex-wrap gap-2 mb-2">
                    <span className="text-xs text-text-tertiary self-center">Quick Presets:</span>
                    {GPU_PRESETS.map((preset) => (
                      <button
                        key={preset.name}
                        type="button"
                        onClick={() => {
                          if (!formData.hardwareTiers.some((t) => t.name === preset.name)) {
                            updateField('hardwareTiers', [...formData.hardwareTiers, preset]);
                          }
                        }}
                        className="px-2.5 py-1 rounded-lg bg-surface-hover hover:bg-border/60 text-xs font-medium text-text-secondary border border-border transition-all"
                      >
                        + {preset.name}
                      </button>
                    ))}
                  </div>

                  {formData.hardwareTiers.map((tier, idx) => (
                    <div key={idx} className="p-4 rounded-2xl bg-surface-hover border border-border flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <span className="font-heading text-caption font-bold text-emerald-600">Tier #{idx + 1}</span>
                        {formData.hardwareTiers.length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              const updated = formData.hardwareTiers.filter((_, i) => i !== idx);
                              updateField('hardwareTiers', updated);
                            }}
                            className="text-rose-500 hover:text-rose-600 p-1"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <Input
                          label="Tier Name"
                          value={tier.name}
                          onChange={(e) => {
                            const updated = [...formData.hardwareTiers];
                            updated[idx].name = e.target.value;
                            updateField('hardwareTiers', updated);
                          }}
                        />
                        <Input
                          label="Specifications & GPU"
                          value={tier.gpu}
                          onChange={(e) => {
                            const updated = [...formData.hardwareTiers];
                            updated[idx].gpu = e.target.value;
                            updateField('hardwareTiers', updated);
                          }}
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <Input
                          label="Hourly Price (₹)"
                          type="number"
                          value={tier.hourlyRate}
                          onChange={(e) => {
                            const updated = [...formData.hardwareTiers];
                            updated[idx].hourlyRate = Number(e.target.value);
                            updateField('hardwareTiers', updated);
                          }}
                        />
                        <Input
                          label="Seats in this Tier"
                          type="number"
                          value={tier.totalSeats}
                          onChange={(e) => {
                            const updated = [...formData.hardwareTiers];
                            updated[idx].totalSeats = Number(e.target.value);
                            updateField('hardwareTiers', updated);
                          }}
                        />
                      </div>
                    </div>
                  ))}
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

                <div className="flex flex-col gap-2">
                  <label className="text-caption font-semibold text-text-primary">Venue Photos (URLs)</label>
                  {formData.photos.map((photo, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Input
                        value={photo}
                        placeholder="https://images.unsplash.com/..."
                        onChange={(e) => {
                          const updated = [...formData.photos];
                          updated[idx] = e.target.value;
                          updateField('photos', updated);
                        }}
                      />
                      {formData.photos.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            updateField('photos', formData.photos.filter((_, i) => i !== idx));
                          }}
                          className="text-rose-500 p-2"
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
                    onClick={() => updateField('photos', [...formData.photos, ''])}
                    className="self-start gap-1 text-emerald-600"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Add Photo URL</span>
                  </Button>
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
