'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Store, Building2, MapPin, Phone, CheckCircle2, ArrowLeft, Loader2, AlertCircle } from 'lucide-react';
import { createCafe, CafeFormData } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';

export default function OwnerOnboardingPage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);

  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await createCafe(formData);
      setStep(2);
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || 'Failed to submit application. Please verify details.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto py-6 px-4 space-y-6">
      <div className="flex items-center space-x-3">
        <Link
          href="/profile"
          className="p-2 bg-card border border-border rounded-full text-text-secondary hover:text-text-primary shadow-sm"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-lg font-bold font-heading text-text-primary">
          Partner Onboarding
        </h1>
      </div>

      {step === 1 ? (
        <div className="card-base p-6 space-y-6 shadow-md border-border">
          <div className="space-y-1">
            <h2 className="font-heading font-bold text-xl text-text-primary">
              Register Gaming Café
            </h2>
            <p className="text-xs text-text-secondary">
              List your venue on KHEL-O to start receiving instant player bookings.
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-2xl p-3.5 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 text-xs font-body">
            <div>
              <label className="block text-text-secondary font-medium mb-1">
                Café Business Name *
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Respawn Esports Lounge"
                className="w-full px-4 py-3 bg-surface border border-border rounded-2xl text-sm focus:outline-none focus:border-primary text-text-primary"
              />
            </div>

            <div>
              <label className="block text-text-secondary font-medium mb-1">
                Description / Tagline
              </label>
              <textarea
                rows={2}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe your gaming setups, atmosphere, and tournaments"
                className="w-full px-4 py-3 bg-surface border border-border rounded-2xl text-sm focus:outline-none focus:border-primary text-text-primary"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-text-secondary font-medium mb-1">
                  Address Line 1 *
                </label>
                <input
                  type="text"
                  required
                  value={formData.addressLine1}
                  onChange={(e) => setFormData({ ...formData, addressLine1: e.target.value })}
                  placeholder="Street, Landmark"
                  className="w-full px-4 py-3 bg-surface border border-border rounded-2xl text-sm focus:outline-none focus:border-primary text-text-primary"
                />
              </div>

              <div>
                <label className="block text-text-secondary font-medium mb-1">
                  City *
                </label>
                <input
                  type="text"
                  required
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  placeholder="Bengaluru"
                  className="w-full px-4 py-3 bg-surface border border-border rounded-2xl text-sm focus:outline-none focus:border-primary text-text-primary"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-text-secondary font-medium mb-1">
                  Phone Number *
                </label>
                <input
                  type="tel"
                  required
                  value={formData.phoneNumber}
                  onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                  placeholder="+91 9876543210"
                  className="w-full px-4 py-3 bg-surface border border-border rounded-2xl text-sm focus:outline-none focus:border-primary text-text-primary"
                />
              </div>

              <div>
                <label className="block text-text-secondary font-medium mb-1">
                  Total Gaming Seats *
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  max={500}
                  value={formData.totalSeats}
                  onChange={(e) => setFormData({ ...formData, totalSeats: Number(e.target.value) })}
                  className="w-full px-4 py-3 bg-surface border border-border rounded-2xl text-sm focus:outline-none focus:border-primary text-text-primary font-data"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full btn-primary mt-2 flex items-center justify-center space-x-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Submitting Onboarding...</span>
                </>
              ) : (
                <span>Submit Venue Application</span>
              )}
            </button>
          </form>
        </div>
      ) : (
        <div className="card-base p-8 text-center space-y-4 shadow-md">
          <div className="inline-flex p-4 bg-emerald-50 text-primary rounded-full">
            <CheckCircle2 className="w-12 h-12" />
          </div>

          <h2 className="font-heading font-bold text-2xl text-text-primary">
            Application Submitted!
          </h2>
          <p className="text-xs text-text-secondary leading-relaxed max-w-sm mx-auto">
            Your venue <span className="font-semibold text-text-primary">&quot;{formData.name}&quot;</span> has been registered and is pending admin verification.
          </p>

          <div className="p-4 bg-surface rounded-2xl border border-border text-left text-xs space-y-1 font-data">
            <p className="text-text-primary font-bold">Status: Pending Verification</p>
            <p className="text-text-secondary">• You have unverified venue limits (capped at 15 bookings or ₹5,000 total volume).</p>
            <p className="text-text-secondary">• An admin will review your listing shortly.</p>
          </div>

          <button
            type="button"
            onClick={() => router.push('/owner/dashboard')}
            className="w-full btn-primary text-sm py-3"
          >
            Go to Owner Dashboard
          </button>
        </div>
      )}
    </div>
  );
}
