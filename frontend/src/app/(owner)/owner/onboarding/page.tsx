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
  Trash2,
  Image as ImageIcon
} from 'lucide-react';
import { getOnboardingDraft, saveOnboardingDraft, submitOnboardingApplication } from '@/lib/api/owner';
import { useAuthStore } from '@/store/authStore';
import { Button, Input, Textarea, Card, CardContent, Badge } from '@/components/ui';
import { GoogleLocationPicker } from '@/components/maps/GoogleLocationPicker';
import { INDIAN_STATES } from '@/constants/states';

const HARDWARE_PRESETS = [
  {
    name: 'Flagship RTX 4090 Arena',
    gpu: 'NVIDIA RTX 4090 (24GB VRAM)',
    cpu: 'Intel Core i9-14900KS (5.9GHz)',
    monitor: 'BenQ ZOWIE XL2566K (360Hz Esports)',
    hourlyRate: 250,
    totalSeats: 10,
    appBookableSeats: 8,
  },
  {
    name: 'High-End RTX 4070 Pods',
    gpu: 'NVIDIA RTX 4070 (12GB VRAM)',
    cpu: 'Intel Core i7-14700K (20 Cores)',
    monitor: 'ASUS ROG Swift 240Hz QHD OLED',
    hourlyRate: 150,
    totalSeats: 10,
    appBookableSeats: 8,
  },
  {
    name: 'Standard RTX 3060 Pods',
    gpu: 'NVIDIA RTX 3060 (12GB VRAM)',
    cpu: 'Intel Core i5-13400F',
    monitor: 'BenQ ZOWIE 144Hz 1ms Gaming',
    hourlyRate: 100,
    totalSeats: 12,
    appBookableSeats: 10,
  },
  {
    name: 'PS5 Console Lounge',
    gpu: 'PlayStation 5 Console',
    cpu: 'PS5 Custom AMD Zen 2 CPU',
    monitor: 'LG 55" 4K OLED HDR TV (PS5)',
    hourlyRate: 200,
    totalSeats: 4,
    appBookableSeats: 3,
  },
];

const POPULAR_GPUS = [
  'NVIDIA RTX 4090 (24GB VRAM)',
  'NVIDIA RTX 4080 Super (16GB VRAM)',
  'NVIDIA RTX 4070 Ti Super (16GB VRAM)',
  'NVIDIA RTX 4070 (12GB VRAM)',
  'NVIDIA RTX 3070 Ti (8GB VRAM)',
  'NVIDIA RTX 3060 (12GB VRAM)',
  'AMD Radeon RX 7900 XTX (24GB)',
  'PlayStation 5 Console',
  'Xbox Series X Console',
  'Custom GPU (Type custom GPU below)',
];

const POPULAR_CPUS = [
  'Intel Core i9-14900KS (5.9GHz)',
  'Intel Core i7-14700K (20 Cores)',
  'Intel Core i7-13700K (16 Cores)',
  'AMD Ryzen 7 7800X3D (Esports King)',
  'AMD Ryzen 9 7950X3D (16 Cores)',
  'Intel Core i5-13400F',
  'PS5 Custom AMD Zen 2 CPU',
  'Custom CPU (Type custom CPU below)',
];

const POPULAR_MONITORS = [
  'BenQ ZOWIE XL2566K (360Hz Esports)',
  'ASUS ROG Swift 240Hz QHD OLED',
  'LG Ultragear 240Hz 1ms IPS',
  'BenQ ZOWIE 144Hz 1ms Gaming',
  'Samsung Odyssey G7 240Hz Curved',
  'LG 55" 4K OLED HDR TV (PS5)',
  'Custom Monitor (Type custom monitor below)',
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
  hasGst: boolean;
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
    cpu?: string;
    monitor?: string;
    hourlyRate: number;
    totalSeats: number;
    appBookableSeats: number;
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
  hasGst: false,
  gstin: '',
  legalDocumentUrl: '',
  bankAccountNumber: '',
  bankIfsc: '',
  accountHolderName: '',
  openingTime: '09:00',
  closingTime: '23:00',
  totalSeats: 20,
  hardwareTiers: [
    {
      name: 'High-End RTX 4070 Pods',
      gpu: 'NVIDIA RTX 4070 (12GB VRAM)',
      cpu: 'Intel Core i7-14700K (20 Cores)',
      monitor: 'ASUS ROG Swift 240Hz QHD OLED',
      hourlyRate: 150,
      totalSeats: 10,
      appBookableSeats: 8,
    },
    {
      name: 'Standard RTX 3060 Pods',
      gpu: 'NVIDIA RTX 3060 (12GB VRAM)',
      cpu: 'Intel Core i5-13400F',
      monitor: 'BenQ ZOWIE 144Hz 1ms Gaming',
      hourlyRate: 100,
      totalSeats: 10,
      appBookableSeats: 8,
    },
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
      cpu: t.cpu,
      monitor: t.monitor,
      hourlyRate: Number(t.hourlyRate) || 100,
      totalSeats: Number(t.totalSeats) || 10,
      appBookableSeats: Number(t.appBookableSeats) || Number(t.totalSeats) || 8,
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
                const refreshRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/auth/refresh`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ refreshToken })
                });
                if (refreshRes.ok) {
                  const data = await refreshRes.json();
                  localStorage.setItem('accessToken', data.data.accessToken);
                  localStorage.setItem('refreshToken', data.data.refreshToken);
                  const userRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/auth/refresh`, {
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
                      if (res.city) updateField('city', res.city);
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
                  <Input
                    label="City *"
                    value={formData.city}
                    onChange={(e) => updateField('city', e.target.value)}
                    required
                  />

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
                  <div className="flex items-center justify-between">
                    <h3 className="font-heading text-h3 text-text-primary">Hardware Tiers</h3>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        updateField('hardwareTiers', [
                          { name: 'Custom Hardware Tier', gpu: 'NVIDIA RTX 4070 / 32GB RAM / 240Hz QHD', hourlyRate: 150, totalSeats: 5 },
                          ...formData.hardwareTiers,
                        ]);
                      }}
                      className="gap-1.5"
                    >
                      <Plus className="h-4 w-4" />
                      <span>Add Tier to Top</span>
                    </Button>
                  </div>

                  {/* Hardware Presets Selector */}
                  <div className="flex flex-wrap gap-2 mb-2">
                    <span className="text-xs text-text-tertiary self-center">Quick Presets:</span>
                    {HARDWARE_PRESETS.map((preset) => (
                      <button
                        key={preset.name}
                        type="button"
                        onClick={() => {
                          if (!formData.hardwareTiers.some((t) => t.name === preset.name)) {
                            updateField('hardwareTiers', [preset, ...formData.hardwareTiers]);
                          }
                        }}
                        className="px-2.5 py-1 rounded-lg bg-surface-hover hover:bg-border/60 text-xs font-medium text-text-secondary border border-border transition-all"
                      >
                        + {preset.name}
                      </button>
                    ))}
                  </div>

                  {formData.hardwareTiers.map((tier, idx) => {
                    const isKnownGpu = POPULAR_GPUS.includes(tier.gpu || '');
                    const isKnownCpu = POPULAR_CPUS.includes(tier.cpu || '');
                    const isKnownMonitor = POPULAR_MONITORS.includes(tier.monitor || '');

                    return (
                      <div key={idx} className="p-5 rounded-2xl bg-surface-hover border border-border flex flex-col gap-4 shadow-sm">
                        <div className="flex items-center justify-between border-b border-border/60 pb-2">
                          <span className="font-heading text-caption font-bold text-emerald-600">Tier #{idx + 1}</span>
                          {formData.hardwareTiers.length > 1 && (
                            <button
                              type="button"
                              onClick={() => {
                                const updated = formData.hardwareTiers.filter((_, i) => i !== idx);
                                updateField('hardwareTiers', updated);
                              }}
                              className="text-rose-500 hover:text-rose-600 p-1 flex items-center gap-1 text-caption font-semibold"
                            >
                              <Trash2 className="h-4 w-4" />
                              <span>Remove</span>
                            </button>
                          )}
                        </div>

                        {/* Row 1: Tier Name & Hourly Price */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <Input
                            label="Tier Name *"
                            placeholder="e.g. RTX 4090 Ultra VIP Tier"
                            value={tier.name}
                            onChange={(e) => {
                              const updated = [...formData.hardwareTiers];
                              updated[idx].name = e.target.value;
                              updateField('hardwareTiers', updated);
                            }}
                          />

                          <Input
                            label="Hourly Rate (₹) *"
                            type="number"
                            placeholder="200"
                            value={tier.hourlyRate}
                            onChange={(e) => {
                              const updated = [...formData.hardwareTiers];
                              updated[idx].hourlyRate = Number(e.target.value);
                              updateField('hardwareTiers', updated);
                            }}
                          />
                        </div>

                        {/* Row 2: 3 Separate Dropdowns for GPU, CPU, Monitor */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          {/* GPU Selector */}
                          <div className="flex flex-col gap-1.5">
                            <label className="text-caption font-semibold text-text-primary">GPU / Graphics Card</label>
                            <select
                              value={isKnownGpu ? tier.gpu : 'Custom GPU (Type custom GPU below)'}
                              onChange={(e) => {
                                const updated = [...formData.hardwareTiers];
                                const val = e.target.value;
                                updated[idx].gpu = val.includes('Custom') ? 'NVIDIA RTX 4070' : val;
                                updateField('hardwareTiers', updated);
                              }}
                              className="flex h-10 w-full rounded-xl border border-border bg-card px-3 py-2 text-caption text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                            >
                              {POPULAR_GPUS.map((g) => (
                                <option key={g} value={g}>{g}</option>
                              ))}
                            </select>
                            {!isKnownGpu && (
                              <Input
                                placeholder="Type custom GPU..."
                                value={tier.gpu}
                                onChange={(e) => {
                                  const updated = [...formData.hardwareTiers];
                                  updated[idx].gpu = e.target.value;
                                  updateField('hardwareTiers', updated);
                                }}
                              />
                            )}
                          </div>

                          {/* CPU Selector */}
                          <div className="flex flex-col gap-1.5">
                            <label className="text-caption font-semibold text-text-primary">CPU / Processor</label>
                            <select
                              value={isKnownCpu ? (tier.cpu || POPULAR_CPUS[1]) : 'Custom CPU (Type custom CPU below)'}
                              onChange={(e) => {
                                const updated = [...formData.hardwareTiers];
                                const val = e.target.value;
                                updated[idx].cpu = val.includes('Custom') ? 'Intel Core i7' : val;
                                updateField('hardwareTiers', updated);
                              }}
                              className="flex h-10 w-full rounded-xl border border-border bg-card px-3 py-2 text-caption text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                            >
                              {POPULAR_CPUS.map((c) => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                            </select>
                            {!isKnownCpu && (
                              <Input
                                placeholder="Type custom CPU..."
                                value={tier.cpu || ''}
                                onChange={(e) => {
                                  const updated = [...formData.hardwareTiers];
                                  updated[idx].cpu = e.target.value;
                                  updateField('hardwareTiers', updated);
                                }}
                              />
                            )}
                          </div>

                          {/* Monitor Selector */}
                          <div className="flex flex-col gap-1.5">
                            <label className="text-caption font-semibold text-text-primary">Monitor / Display</label>
                            <select
                              value={isKnownMonitor ? (tier.monitor || POPULAR_MONITORS[1]) : 'Custom Monitor (Type custom monitor below)'}
                              onChange={(e) => {
                                const updated = [...formData.hardwareTiers];
                                const val = e.target.value;
                                updated[idx].monitor = val.includes('Custom') ? '240Hz Display' : val;
                                updateField('hardwareTiers', updated);
                              }}
                              className="flex h-10 w-full rounded-xl border border-border bg-card px-3 py-2 text-caption text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                            >
                              {POPULAR_MONITORS.map((m) => (
                                <option key={m} value={m}>{m}</option>
                              ))}
                            </select>
                            {!isKnownMonitor && (
                              <Input
                                placeholder="Type custom monitor..."
                                value={tier.monitor || ''}
                                onChange={(e) => {
                                  const updated = [...formData.hardwareTiers];
                                  updated[idx].monitor = e.target.value;
                                  updateField('hardwareTiers', updated);
                                }}
                              />
                            )}
                          </div>
                        </div>

                        {/* Row 3: Total Seats Available vs Total Allowed for KHEL-O App */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-card p-3 rounded-xl border border-border/60">
                          <Input
                            label="Total Stations Built in Café *"
                            type="number"
                            min="1"
                            value={tier.totalSeats}
                            onChange={(e) => {
                              const updated = [...formData.hardwareTiers];
                              const val = Number(e.target.value);
                              updated[idx].totalSeats = val;
                              if (updated[idx].appBookableSeats > val) {
                                updated[idx].appBookableSeats = val;
                              }
                              updateField('hardwareTiers', updated);
                            }}
                          />

                          <Input
                            label="Total Allowed to be Booked on KHEL-O App *"
                            type="number"
                            min="1"
                            max={tier.totalSeats}
                            value={tier.appBookableSeats}
                            onChange={(e) => {
                              const updated = [...formData.hardwareTiers];
                              const val = Number(e.target.value);
                              // Clamp typed value so it never exceeds totalSeats
                              const clampedVal = Math.min(val, tier.totalSeats);
                              updated[idx].appBookableSeats = clampedVal;
                              updateField('hardwareTiers', updated);
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
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
