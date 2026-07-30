'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  Trophy,
  History,
  HelpCircle,
  Gamepad2,
  ArrowRight,
  Bell,
  Lock,
  FileText,
  LogOut,
  ChevronRight,
  Phone,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { getMe } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';

export default function ProfilePage() {
  const router = useRouter();
  const { user: storedUser, setUser, logout } = useAuthStore();

  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Fetch fresh user profile via GET /api/v1/auth/me
  const { data: user, isLoading, isError, refetch } = useQuery({
    queryKey: ['me'],
    queryFn: getMe,
    staleTime: 60_000,
    retry: 1,
    initialData: storedUser || undefined,
  });

  // Sync Zustand store when query returns fresh user
  useEffect(() => {
    if (user) {
      setUser(user);
    }
  }, [user, setUser]);

  const activeUser = user || storedUser;

  const handleLogoutConfirm = () => {
    setIsLoggingOut(true);
    setTimeout(() => {
      logout();
      router.push('/login');
    }, 400);
  };

  const getRoleBadge = (role?: string) => {
    switch (role) {
      case 'cafe_owner':
        return (
          <span className="px-3 py-0.5 bg-secondary text-white text-xs font-bold rounded-full uppercase font-data">
            Café Owner
          </span>
        );
      case 'admin':
        return (
          <span className="px-3 py-0.5 bg-accent text-white text-xs font-bold rounded-full uppercase font-data">
            Admin
          </span>
        );
      case 'gamer':
      default:
        return (
          <span className="px-3 py-0.5 bg-primary/10 text-primary border border-primary/20 text-xs font-bold rounded-full uppercase font-data">
            Gamer
          </span>
        );
    }
  };

  const formatMemberSince = (dateStr?: string) => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  if (isLoading && !activeUser) {
    return (
      <div className="space-y-4 animate-pulse pb-32">
        <div className="card-base p-6 flex flex-col items-center space-y-3">
          <div className="w-20 h-20 bg-surface rounded-full" />
          <div className="h-6 bg-surface rounded w-1/3" />
          <div className="h-4 bg-surface rounded w-1/2" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="card-base h-24" />
          <div className="card-base h-24" />
        </div>
      </div>
    );
  }

  if (isError && !activeUser) {
    return (
      <div className="bg-card border border-border rounded-2xl p-8 flex flex-col items-center justify-center text-center space-y-3 shadow-md mt-4">
        <AlertTriangle className="w-12 h-12 text-error" />
        <h3 className="font-heading font-semibold text-lg text-text-primary">
          Unable to load profile
        </h3>
        <p className="text-text-secondary text-sm">
          Please check your connection and try again.
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          className="btn-outline text-sm py-2 px-6 rounded-2xl mt-2"
        >
          Try Again
        </button>
      </div>
    );
  }

  const memberSince = formatMemberSince(activeUser?.createdAt);

  return (
    <div className="space-y-6 pb-32">
      {/* Section 1: Profile Header Card */}
      <div className="card-base p-6 flex flex-col items-center text-center shadow-md">
        {/* Avatar */}
        <div className="relative w-20 h-20 rounded-full border-2 border-primary overflow-hidden bg-primary text-white flex items-center justify-center flex-shrink-0 shadow-sm">
          {activeUser?.avatarUrl ? (
            <Image
              src={activeUser.avatarUrl}
              alt={activeUser.fullName || 'User Avatar'}
              fill
              sizes="80px"
              className="object-cover"
            />
          ) : (
            <span className="font-heading font-bold text-3xl">
              {activeUser?.fullName ? activeUser.fullName.charAt(0).toUpperCase() : 'G'}
            </span>
          )}
        </div>

        {/* Name & Email */}
        <h1 className="font-heading font-bold text-xl text-text-primary mt-4">
          {activeUser?.fullName || 'Gamer'}
        </h1>
        <p className="font-body text-sm text-text-secondary mt-0.5">
          {activeUser?.email || ''}
        </p>

        {/* Role Badge */}
        <div className="mt-2.5">{getRoleBadge(activeUser?.role)}</div>

        {/* Phone Row */}
        {activeUser?.phoneNumber && (
          <div className="font-data text-sm text-text-secondary mt-3 flex items-center gap-2">
            <Phone className="w-4 h-4 text-primary" />
            <span>{activeUser.phoneNumber}</span>
          </div>
        )}

        {/* Member Since Row */}
        {memberSince && (
          <div className="w-full font-body text-xs text-text-secondary mt-4 pt-4 border-t border-border">
            Member since {memberSince}
          </div>
        )}
      </div>

      {/* Section 2: Quick Actions Grid */}
      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/rewards"
          className="card-base p-4 flex flex-col gap-2 active:scale-[0.98] transition-transform hover:border-primary/50"
        >
          <Trophy className="w-6 h-6 text-primary" />
          <div>
            <h3 className="font-heading font-semibold text-sm text-text-primary">
              Rewards
            </h3>
            <p className="font-body text-xs text-text-secondary">Coming soon</p>
          </div>
        </Link>

        <Link
          href="/bookings"
          className="card-base p-4 flex flex-col gap-2 active:scale-[0.98] transition-transform hover:border-primary/50"
        >
          <History className="w-6 h-6 text-primary" />
          <div>
            <h3 className="font-heading font-semibold text-sm text-text-primary">
              History
            </h3>
            <p className="font-body text-xs text-text-secondary">View all</p>
          </div>
        </Link>
      </div>

      {/* Help & Support Quick Action Card */}
      <a
        href="mailto:support@khel-o.com"
        className="card-base p-4 flex items-center justify-between active:scale-[0.98] transition-transform hover:border-primary/50"
      >
        <div className="flex items-center space-x-3">
          <HelpCircle className="w-6 h-6 text-primary" />
          <div>
            <h3 className="font-heading font-semibold text-sm text-text-primary">
              Help & Support
            </h3>
            <p className="font-body text-xs text-text-secondary">
              Contact support@khel-o.com
            </p>
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-text-secondary" />
      </a>

      {/* Section 3: Become a Café Partner CTA (Gamer role only) */}
      {(!activeUser?.role || activeUser.role === 'gamer') && (
        <div>
          <div className="card-base p-5 border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10 shadow-sm space-y-3">
            <div className="flex items-start space-x-3">
              <div className="p-2.5 bg-primary/10 rounded-2xl text-primary flex-shrink-0">
                <Gamepad2 className="w-8 h-8" />
              </div>
              <div>
                <h3 className="font-heading font-bold text-base text-text-primary">
                  OWN A GAMING CAFÉ?
                </h3>
                <p className="font-body text-xs text-text-secondary mt-1 leading-relaxed">
                  List your venue on KHEL-O to fill empty slots, publish flash deals, and reach thousands of local gamers.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => router.push('/owner/onboarding')}
              className="btn-primary w-full mt-2 flex items-center justify-center space-x-2"
            >
              <span>Become a Café Partner</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
          <p className="text-center text-xs text-text-secondary mt-3 px-8">
            Already a partner? Sign in with your owner account.
          </p>
        </div>
      )}

      {/* Section 4: Settings / Account List */}
      <div className="card-base p-0 overflow-hidden shadow-sm">
        <button
          type="button"
          onClick={() => alert('Notifications coming soon!')}
          className="w-full flex items-center gap-3 px-4 py-4 border-b border-border active:bg-surface transition-colors text-left"
        >
          <Bell className="w-5 h-5 text-text-secondary" />
          <span className="font-body font-medium text-sm text-text-primary flex-1">
            Notifications
          </span>
          <ChevronRight className="w-4 h-4 text-text-secondary" />
        </button>

        <button
          type="button"
          onClick={() => alert('Privacy & Security settings coming soon!')}
          className="w-full flex items-center gap-3 px-4 py-4 border-b border-border active:bg-surface transition-colors text-left"
        >
          <Lock className="w-5 h-5 text-text-secondary" />
          <span className="font-body font-medium text-sm text-text-primary flex-1">
            Privacy & Security
          </span>
          <ChevronRight className="w-4 h-4 text-text-secondary" />
        </button>

        <button
          type="button"
          onClick={() => alert('KHEL-O Terms of Service: https://khel-o.com/terms')}
          className="w-full flex items-center gap-3 px-4 py-4 border-b border-border active:bg-surface transition-colors text-left"
        >
          <FileText className="w-5 h-5 text-text-secondary" />
          <span className="font-body font-medium text-sm text-text-primary flex-1">
            Terms of Service
          </span>
          <ChevronRight className="w-4 h-4 text-text-secondary" />
        </button>

        <button
          type="button"
          onClick={() => setShowLogoutModal(true)}
          className="w-full flex items-center gap-3 px-4 py-4 active:bg-surface transition-colors text-left"
        >
          <LogOut className="w-5 h-5 text-error" />
          <span className="font-body font-semibold text-sm text-error flex-1">
            Logout
          </span>
          <ChevronRight className="w-4 h-4 text-error" />
        </button>
      </div>

      {/* Logout Confirmation Modal */}
      {showLogoutModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div className="bg-card rounded-3xl w-full max-w-md p-6 flex flex-col items-center text-center space-y-4 shadow-xl border border-border">
            <div className="p-4 bg-error/10 text-error rounded-full">
              <LogOut className="w-10 h-10" />
            </div>

            <div>
              <h3 className="font-heading font-bold text-xl text-text-primary">
                Logout of KHEL-O?
              </h3>
              <p className="font-body text-sm text-text-secondary mt-1">
                You&apos;ll need to sign in again to view your bookings and reservations.
              </p>
            </div>

            <div className="w-full flex flex-col gap-2 pt-2">
              <button
                type="button"
                disabled={isLoggingOut}
                onClick={handleLogoutConfirm}
                className="w-full bg-error text-white rounded-2xl py-3 font-heading font-semibold text-sm shadow-sm active:scale-95 transition-transform flex items-center justify-center space-x-2"
              >
                {isLoggingOut ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Logging Out...</span>
                  </>
                ) : (
                  <span>Yes, Logout</span>
                )}
              </button>

              <button
                type="button"
                disabled={isLoggingOut}
                onClick={() => setShowLogoutModal(false)}
                className="w-full btn-outline text-sm py-3"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
