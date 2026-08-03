'use client';

import { useState, useEffect, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  Store,
  MapPin,
  Clock,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  ChevronLeft,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { createCafe } from '@/lib/api/cafes';
import { useAuthStore } from '@/store/authStore';
import { Button, Input, Textarea, Card, CardContent, Badge } from '@/components/ui';

interface OnboardingFormState {
  name: string;
  description: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  pincode: string;
  phoneNumber: string;
  email: string;
  openingTime: string;
  closingTime: string;
  totalSeats: number;
  amenities: string[];
}

const DEFAULT_STATE: OnboardingFormState = {
  name: '',
  description: '',
  addressLine1: '',
  addressLine2: '',
  city: 'Bengaluru',
  state: 'Karnataka',
  pincode: '',
  phoneNumber: '',
  email: '',
  openingTime: '09:00:00',
  closingTime: '23:00:00',
  totalSeats: 20,
  amenities: ['High-speed Wi-Fi', 'Air Conditioned', 'Snacks & Drinks'],
};

export default function OnboardingWizardPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<OnboardingFormState>(DEFAULT_STATE);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Restore draft from sessionStorage if present (Mitigation for risk #11)
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('khelo_onboarding_draft');
      if (saved) {
        setFormData(JSON.parse(saved));
      }
    } catch {
      // Ignore parse errors
    }
  }, []);

  const updateField = (field: keyof OnboardingFormState, value: any) => {
    const updated = { ...formData, [field]: value };
    setFormData(updated);
    try {
      sessionStorage.setItem('khelo_onboarding_draft', JSON.stringify(updated));
    } catch {
      // Ignore storage quota
    }
  };

  const handleNext = () => {
    setError(null);
    if (step === 1) {
      if (!formData.name || !formData.addressLine1 || !formData.city || !formData.state) {
        setError('Please complete all required address fields.');
        return;
      }
    }
    if (step === 2) {
      if (!formData.totalSeats || formData.totalSeats <= 0) {
        setError('Please specify a valid total station capacity.');
        return;
      }
    }
    setStep((s) => Math.min(s + 1, 4));
  };

  const handleBack = () => {
    setError(null);
    setStep((s) => Math.max(s - 1, 1));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await createCafe({
        name: formData.name,
        description: formData.description || undefined,
        addressLine1: formData.addressLine1,
        addressLine2: formData.addressLine2 || undefined,
        city: formData.city,
        state: formData.state,
        pincode: formData.pincode || undefined,
        phoneNumber: formData.phoneNumber || user?.phoneNumber || undefined,
        email: formData.email || user?.email || undefined,
        openingTime: formData.openingTime,
        closingTime: formData.closingTime,
        totalSeats: Number(formData.totalSeats),
        amenities: formData.amenities,
      });

      // Clear draft on successful submission
      sessionStorage.removeItem('khelo_onboarding_draft');
      setIsSubmitted(true);
    } catch (err: any) {
      setError(err?.message || 'Failed to submit café application. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Verification Pending Screen after submission
  if (isSubmitted) {
    return (
      <div className="flex flex-col items-center text-center max-w-xl mx-auto py-12 px-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-warning/10 text-warning mb-6">
          <Clock className="h-8 w-8 animate-pulse" />
        </div>

        <Badge variant="warning" size="md" className="mb-3">
          Application Pending Verification
        </Badge>

        <h1 className="font-heading text-display text-text-primary mb-3">
          Café Application Received!
        </h1>

        <p className="text-body text-text-secondary leading-relaxed mb-8">
          Thank you for applying to list <span className="font-semibold text-text-primary">{formData.name}</span> on KHEL-O. Our platform compliance team will inspect your venue details within 24 hours.
        </p>

        <Card elevation="resting" className="w-full mb-8 text-left bg-surface">
          <CardContent className="p-5 flex flex-col gap-3">
            <h3 className="font-heading text-h3 text-text-primary">What happens next?</h3>
            <div className="flex items-start gap-3 text-caption text-text-secondary">
              <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
              <span>Admin reviews your venue address and station capacity.</span>
            </div>
            <div className="flex items-start gap-3 text-caption text-text-secondary">
              <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
              <span>Upon verification, your account will automatically upgrade to Café Owner.</span>
            </div>
            <div className="flex items-start gap-3 text-caption text-text-secondary">
              <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
              <span>You will unlock the Owner Portal to add hardware tiers and set up payouts.</span>
            </div>
          </CardContent>
        </Card>

        <Button variant="primary" size="lg" onClick={() => router.push('/')}>
          Return to Marketplace
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto pb-16">
      {/* Step Indicator Header */}
      <div className="flex flex-col gap-2 mb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-white shadow-card">
              <Store className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-heading text-h2 text-text-primary">Partner Registration</h1>
              <p className="text-caption text-text-secondary">List your gaming café on KHEL-O</p>
            </div>
          </div>
          <span className="text-caption font-semibold text-primary">Step {step} of 4</span>
        </div>

        {/* Progress Bar */}
        <div className="h-2 w-full rounded-full bg-border overflow-hidden mt-2">
          <div
            className="h-full bg-primary transition-all duration-normal"
            style={{ width: `${(step / 4) * 100}%` }}
          />
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 rounded-2xl bg-error/10 border border-error/20 text-body text-error mb-6">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Step Forms */}
      <Card elevation="raised">
        <CardContent className="p-6 md:p-8">
          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            {/* Step 1: Venue & Address Details */}
            {step === 1 && (
              <div className="flex flex-col gap-4">
                <div>
                  <h2 className="font-heading text-h2 text-text-primary">1. Café Identity & Address</h2>
                  <p className="text-caption text-text-secondary">Provide your venue name and location.</p>
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
                  placeholder="Tell gamers about your PC specs, console setups, or lounge vibe..."
                  value={formData.description}
                  onChange={(e) => updateField('description', e.target.value)}
                />

                <Input
                  label="Address Line 1 *"
                  placeholder="Street address, building number"
                  value={formData.addressLine1}
                  onChange={(e) => updateField('addressLine1', e.target.value)}
                  required
                />

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Input
                    label="City *"
                    placeholder="Bengaluru"
                    value={formData.city}
                    onChange={(e) => updateField('city', e.target.value)}
                    required
                  />

                  <Input
                    label="State *"
                    placeholder="Karnataka"
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

            {/* Step 2: Contact & Station Capacity */}
            {step === 2 && (
              <div className="flex flex-col gap-4">
                <div>
                  <h2 className="font-heading text-h2 text-text-primary">2. Operating Hours & Capacity</h2>
                  <p className="text-caption text-text-secondary">Specify hours and total gaming stations.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    label="Contact Phone Number"
                    placeholder="+91 98765 43210"
                    value={formData.phoneNumber}
                    onChange={(e) => updateField('phoneNumber', e.target.value)}
                  />

                  <Input
                    label="Contact Email"
                    placeholder="contact@velocityesports.com"
                    value={formData.email}
                    onChange={(e) => updateField('email', e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Input
                    label="Opening Time"
                    type="time"
                    value={formData.openingTime.slice(0, 5)}
                    onChange={(e) => updateField('openingTime', `${e.target.value}:00`)}
                  />

                  <Input
                    label="Closing Time"
                    type="time"
                    value={formData.closingTime.slice(0, 5)}
                    onChange={(e) => updateField('closingTime', `${e.target.value}:00`)}
                  />

                  <Input
                    label="Total Seats *"
                    type="number"
                    min="1"
                    value={formData.totalSeats}
                    onChange={(e) => updateField('totalSeats', e.target.value)}
                    required
                  />
                </div>
              </div>
            )}

            {/* Step 3: Amenities Selection */}
            {step === 3 && (
              <div className="flex flex-col gap-4">
                <div>
                  <h2 className="font-heading text-h2 text-text-primary">3. Amenities & Features</h2>
                  <p className="text-caption text-text-secondary">Select facilities available at your venue.</p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    'High-speed Wi-Fi',
                    'Air Conditioned',
                    'Snacks & Drinks',
                    'Console Lounges',
                    'Tournament Stage',
                    'Streaming Pods',
                    'Parking Available',
                    '24/7 Power Backup',
                  ].map((amenity) => {
                    const isChecked = formData.amenities.includes(amenity);
                    return (
                      <button
                        type="button"
                        key={amenity}
                        onClick={() => {
                          const updated = isChecked
                            ? formData.amenities.filter((a) => a !== amenity)
                            : [...formData.amenities, amenity];
                          updateField('amenities', updated);
                        }}
                        className={`p-3 rounded-xl text-caption font-semibold flex items-center gap-2 border transition-all ${
                          isChecked
                            ? 'bg-primary/10 border-primary text-primary'
                            : 'bg-surface border-border text-text-secondary hover:bg-border/40'
                        }`}
                      >
                        <div
                          className={`h-4 w-4 rounded flex items-center justify-center border ${
                            isChecked ? 'bg-primary border-primary text-white' : 'border-border'
                          }`}
                        >
                          {isChecked && <CheckCircle2 className="h-3 w-3" />}
                        </div>
                        <span>{amenity}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Step 4: Review & Submit */}
            {step === 4 && (
              <div className="flex flex-col gap-4">
                <div>
                  <h2 className="font-heading text-h2 text-text-primary">4. Review Application</h2>
                  <p className="text-caption text-text-secondary">Confirm details before submitting for verification.</p>
                </div>

                <div className="flex flex-col gap-3 bg-surface p-4 rounded-2xl border border-border text-body">
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Venue Name:</span>
                    <span className="font-semibold text-text-primary">{formData.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Location:</span>
                    <span className="font-semibold text-text-primary">{formData.city}, {formData.state}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Capacity:</span>
                    <span className="font-semibold text-text-primary">{formData.totalSeats} Stations</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Amenities:</span>
                    <span className="font-semibold text-text-primary">{formData.amenities.join(', ')}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Navigation Buttons */}
            <div className="flex items-center justify-between border-t border-border pt-6 mt-4">
              {step > 1 ? (
                <Button type="button" variant="ghost" onClick={handleBack} className="gap-1">
                  <ChevronLeft className="h-4 w-4" />
                  <span>Back</span>
                </Button>
              ) : (
                <div />
              )}

              {step < 4 ? (
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
                  loadingText="Submitting..."
                  className="gap-2 px-8"
                >
                  <ShieldCheck className="h-5 w-5" />
                  <span>Submit Partner Application</span>
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
