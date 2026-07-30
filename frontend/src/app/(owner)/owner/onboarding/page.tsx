'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Store, Building2, MapPin, Phone, CheckCircle2, ArrowLeft, Loader2, AlertCircle, Cpu, Monitor, FileText, ChevronRight } from 'lucide-react';
import { createCafe, CafeFormData } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';

export default function OwnerOnboardingPage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);

  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState<CafeFormData>({
    name: '',
    description: '',
    addressLine1: '',
    addressLine2: '',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560001',
    phoneNumber: user?.phoneNumber || '',
    email: user?.email || '',
    openingTime: '10:00:00',
    closingTime: '23:00:00',
    totalSeats: 20,
    amenities: ['High Speed Wi-Fi', 'Air Conditioned', 'Snacks & Beverages', 'Gaming Headsets'],
    photos: ['https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1200&q=80'],
  });

  const [panNumber, setPanNumber] = useState('');
  const [gstNumber, setGstNumber] = useState('');
  const [tierName, setTierName] = useState('Standard Gaming PCs');
  const [gpuSpec, setGpuSpec] = useState('NVIDIA RTX 4060');
  const [pricePerHour, setPricePerHour] = useState(120);

  const handleSubmitApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await createCafe(formData);
      setCurrentStep(4);
    } catch (err: unknown) {
      const errObj = err as { response?: { data?: { error?: { message?: string } } } };
      setError(errObj?.response?.data?.error?.message || 'Failed to submit application. Please verify details.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto py-6 px-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Link
            href="/profile"
            className="p-2 bg-card border border-border rounded-full text-text-secondary hover:text-text-primary shadow-sm"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-lg font-bold font-heading text-text-primary">
              Partner Onboarding
            </h1>
            <p className="text-xs text-text-secondary">List your gaming venue on KHEL-O</p>
          </div>
        </div>

        {currentStep < 4 && (
          <span className="text-xs font-data text-primary font-bold px-2.5 py-1 bg-surface border border-border rounded-full">
            Step {currentStep} of 3
          </span>
        )}
      </div>

      {/* Progress Bar */}
      {currentStep < 4 && (
        <div className="flex items-center space-x-2">
          <div className={`h-1.5 flex-1 rounded-full ${currentStep >= 1 ? 'bg-primary' : 'bg-border'}`} />
          <div className={`h-1.5 flex-1 rounded-full ${currentStep >= 2 ? 'bg-primary' : 'bg-border'}`} />
          <div className={`h-1.5 flex-1 rounded-full ${currentStep >= 3 ? 'bg-primary' : 'bg-border'}`} />
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-2xl p-3.5 flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* STEP 1: BUSINESS & OWNER DETAILS */}
      {currentStep === 1 && (
        <div className="card-base p-6 space-y-5 shadow-md border-border">
          <div className="space-y-1">
            <h2 className="font-heading font-bold text-xl text-text-primary">
              1. Business & Contact Information
            </h2>
            <p className="text-xs text-text-secondary">
              Provide legal business details for identity verification and Razorpay Route payouts.
            </p>
          </div>

          <div className="space-y-4 text-xs font-body">
            <div>
              <label className="block text-text-secondary font-medium mb-1">Café Business Name *</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Respawn Esports Lounge"
                className="w-full px-4 py-3 bg-surface border border-border rounded-2xl text-sm focus:outline-none focus:border-primary text-text-primary"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-text-secondary font-medium mb-1">Owner Email *</label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="owner@cafe.com"
                  className="w-full px-4 py-3 bg-surface border border-border rounded-2xl text-sm focus:outline-none focus:border-primary text-text-primary"
                />
              </div>

              <div>
                <label className="block text-text-secondary font-medium mb-1">Owner Phone *</label>
                <input
                  type="tel"
                  required
                  value={formData.phoneNumber}
                  onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                  placeholder="+91 9876543210"
                  className="w-full px-4 py-3 bg-surface border border-border rounded-2xl text-sm focus:outline-none focus:border-primary text-text-primary font-data"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-text-secondary font-medium mb-1">Business PAN (Optional)</label>
                <input
                  type="text"
                  maxLength={10}
                  value={panNumber}
                  onChange={(e) => setPanNumber(e.target.value.toUpperCase())}
                  placeholder="ABCDE1234F"
                  className="w-full px-4 py-3 bg-surface border border-border rounded-2xl text-sm focus:outline-none focus:border-primary text-text-primary font-data uppercase"
                />
              </div>

              <div>
                <label className="block text-text-secondary font-medium mb-1">GSTIN (Optional)</label>
                <input
                  type="text"
                  maxLength={15}
                  value={gstNumber}
                  onChange={(e) => setGstNumber(e.target.value.toUpperCase())}
                  placeholder="29ABCDE1234F1Z5"
                  className="w-full px-4 py-3 bg-surface border border-border rounded-2xl text-sm focus:outline-none focus:border-primary text-text-primary font-data uppercase"
                />
              </div>
            </div>

            <button
              type="button"
              disabled={!formData.name.trim() || !formData.email.trim() || !formData.phoneNumber.trim()}
              onClick={() => setCurrentStep(2)}
              className="w-full btn-primary mt-2 py-3.5 flex items-center justify-center space-x-2 disabled:opacity-50"
            >
              <span>Continue to Venue Setup</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: VENUE LOCATION & HOURS */}
      {currentStep === 2 && (
        <div className="card-base p-6 space-y-5 shadow-md border-border">
          <div className="space-y-1">
            <h2 className="font-heading font-bold text-xl text-text-primary">
              2. Venue Location & Operating Hours
            </h2>
            <p className="text-xs text-text-secondary">
              Gamers will find your lounge based on city and address.
            </p>
          </div>

          <div className="space-y-4 text-xs font-body">
            <div>
              <label className="block text-text-secondary font-medium mb-1">Address Line 1 *</label>
              <input
                type="text"
                required
                value={formData.addressLine1}
                onChange={(e) => setFormData({ ...formData, addressLine1: e.target.value })}
                placeholder="Street address, building, floor"
                className="w-full px-4 py-3 bg-surface border border-border rounded-2xl text-sm focus:outline-none focus:border-primary text-text-primary"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-text-secondary font-medium mb-1">City *</label>
                <input
                  type="text"
                  required
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  placeholder="Bengaluru"
                  className="w-full px-4 py-3 bg-surface border border-border rounded-2xl text-sm focus:outline-none focus:border-primary text-text-primary"
                />
              </div>

              <div>
                <label className="block text-text-secondary font-medium mb-1">State & Pincode *</label>
                <input
                  type="text"
                  required
                  value={formData.pincode}
                  onChange={(e) => setFormData({ ...formData, pincode: e.target.value })}
                  placeholder="560001"
                  className="w-full px-4 py-3 bg-surface border border-border rounded-2xl text-sm focus:outline-none focus:border-primary text-text-primary font-data"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-text-secondary font-medium mb-1">Opening Time</label>
                <input
                  type="text"
                  value={formData.openingTime}
                  onChange={(e) => setFormData({ ...formData, openingTime: e.target.value })}
                  className="w-full px-3 py-2.5 bg-surface border border-border rounded-xl text-xs font-data text-text-primary"
                />
              </div>

              <div>
                <label className="block text-text-secondary font-medium mb-1">Closing Time</label>
                <input
                  type="text"
                  value={formData.closingTime}
                  onChange={(e) => setFormData({ ...formData, closingTime: e.target.value })}
                  className="w-full px-3 py-2.5 bg-surface border border-border rounded-xl text-xs font-data text-text-primary"
                />
              </div>

              <div>
                <label className="block text-text-secondary font-medium mb-1">Total Seats *</label>
                <input
                  type="number"
                  required
                  min={1}
                  max={500}
                  value={formData.totalSeats}
                  onChange={(e) => setFormData({ ...formData, totalSeats: Number(e.target.value) })}
                  className="w-full px-3 py-2.5 bg-surface border border-border rounded-xl text-xs font-data text-text-primary"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setCurrentStep(1)}
                className="btn-outline flex-1 py-3 text-xs"
              >
                Back
              </button>
              <button
                type="button"
                disabled={!formData.addressLine1.trim() || !formData.city.trim()}
                onClick={() => setCurrentStep(3)}
                className="btn-primary flex-1 py-3 text-xs flex items-center justify-center space-x-1"
              >
                <span>Hardware & Rigs</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 3: HARDWARE & AMENITIES SETUP */}
      {currentStep === 3 && (
        <form onSubmit={handleSubmitApplication} className="card-base p-6 space-y-5 shadow-md border-border">
          <div className="space-y-1">
            <h2 className="font-heading font-bold text-xl text-text-primary">
              3. Hardware Tier & Amenities
            </h2>
            <p className="text-xs text-text-secondary">
              Set up your flagship rig specs and base pricing per hour.
            </p>
          </div>

          <div className="space-y-4 text-xs font-body">
            <div>
              <label className="block text-text-secondary font-medium mb-1">Flagship Rig Tier Name</label>
              <input
                type="text"
                required
                value={tierName}
                onChange={(e) => setTierName(e.target.value)}
                placeholder="e.g. VIP RTX 4080 Lounge"
                className="w-full px-4 py-3 bg-surface border border-border rounded-2xl text-sm focus:outline-none focus:border-primary text-text-primary"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-text-secondary font-medium mb-1">GPU Model</label>
                <input
                  type="text"
                  value={gpuSpec}
                  onChange={(e) => setGpuSpec(e.target.value)}
                  className="w-full px-4 py-3 bg-surface border border-border rounded-2xl text-sm font-data text-text-primary"
                />
              </div>

              <div>
                <label className="block text-text-secondary font-medium mb-1">Rate (₹/hour) *</label>
                <input
                  type="number"
                  required
                  min={10}
                  max={2000}
                  value={pricePerHour}
                  onChange={(e) => setPricePerHour(Number(e.target.value))}
                  className="w-full px-4 py-3 bg-surface border border-border rounded-2xl text-sm font-data text-text-primary"
                />
              </div>
            </div>

            <div>
              <label className="block text-text-secondary font-medium mb-1">Venue Description</label>
              <textarea
                rows={3}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe your gaming setups, atmosphere, food menu, and tournaments..."
                className="w-full px-4 py-3 bg-surface border border-border rounded-2xl text-sm focus:outline-none focus:border-primary text-text-primary"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setCurrentStep(2)}
                className="btn-outline flex-1 py-3.5 text-xs"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={loading}
                className="btn-primary flex-1 py-3.5 text-xs flex items-center justify-center space-x-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Submitting Application...</span>
                  </>
                ) : (
                  <span>Submit Application</span>
                )}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* STEP 4: APPLICATION SUBMITTED SUCCESS */}
      {currentStep === 4 && (
        <div className="card-base p-8 text-center space-y-5 shadow-md">
          <div className="inline-flex p-4 bg-emerald-50 text-primary rounded-full">
            <CheckCircle2 className="w-12 h-12" />
          </div>

          <h2 className="font-heading font-bold text-2xl text-text-primary">
            Application Submitted!
          </h2>
          <p className="text-xs text-text-secondary leading-relaxed max-w-sm mx-auto">
            Your gaming café <span className="font-semibold text-text-primary">&quot;{formData.name}&quot;</span> has been registered and assigned status <span className="font-bold text-primary">Pending Verification</span>.
          </p>

          <div className="p-4 bg-surface rounded-2xl border border-border text-left text-xs space-y-2 font-data">
            <p className="text-text-primary font-bold">Unverified Partner Access Granted:</p>
            <p className="text-text-secondary">• You can start managing your dashboard, hardware tiers, and scanner staff right away.</p>
            <p className="text-text-secondary">• Unverified limits apply (capped at 15 bookings or ₹5,000 transaction volume).</p>
            <p className="text-text-secondary">• An admin will review your PAN/venue listing for full verified status within 24-48 hours.</p>
          </div>

          <button
            type="button"
            onClick={() => router.push('/owner/dashboard')}
            className="w-full btn-primary text-sm py-3.5"
          >
            Go to Owner Dashboard
          </button>
        </div>
      )}
    </div>
  );
}
