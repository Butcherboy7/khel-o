'use client';

import Link from 'next/link';
import { useAuthStore } from '@/store/authStore';
import {
  Avatar,
  Card,
  CardContent,
  Button,
  Badge,
} from '@/components/ui';
import {
  User,
  Mail,
  Phone,
  Store,
  LogOut,
  ChevronRight,
  ShieldCheck,
  Ticket,
} from 'lucide-react';

export default function ProfilePage() {
  const { user, logout } = useAuthStore();

  if (!user) return null;

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto pb-16">
      {/* Profile Header Card */}
      <Card elevation="raised">
        <CardContent className="p-6 flex flex-col sm:flex-row items-center sm:items-start gap-5">
          <Avatar name={user.fullName} src={user.avatarUrl} size="xl" />

          <div className="flex flex-1 flex-col items-center sm:items-start text-center sm:text-left gap-1">
            <div className="flex items-center gap-2">
              <h1 className="font-heading text-h2 text-text-primary">{user.fullName}</h1>
              <Badge variant="primary" size="sm">
                {user.role.replace('_', ' ')}
              </Badge>
            </div>
            <p className="text-body text-text-secondary">{user.email}</p>
            {user.phoneNumber && (
              <p className="text-caption text-text-secondary flex items-center gap-1 mt-1">
                <Phone className="h-3.5 w-3.5" />
                <span>{user.phoneNumber}</span>
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Gamer-to-Owner Conversion Funnel Banner */}
      {user.role === 'gamer' && (
        <Card elevation="resting" className="border-2 border-primary/30 bg-gradient-to-r from-primary/10 via-card to-accent/10">
          <CardContent className="p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-white shadow-card flex-shrink-0">
                <Store className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-heading text-h3 text-text-primary">Own a Gaming Café?</h3>
                <p className="text-body text-text-secondary">
                  List your café on KHEL-O to reach thousands of gamers and automate station bookings.
                </p>
              </div>
            </div>

            <Link href="/owner/onboarding" className="flex-shrink-0 w-full sm:w-auto">
              <Button variant="primary" size="md" className="gap-2 w-full">
                <span>Become a Partner</span>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Quick Navigation Links */}
      <Card elevation="resting">
        <CardContent className="p-2 flex flex-col divide-y divide-border">
          <Link
            href="/bookings"
            className="flex items-center justify-between p-4 hover:bg-surface rounded-xl transition-colors"
          >
            <div className="flex items-center gap-3 text-text-primary font-semibold text-body">
              <Ticket className="h-5 w-5 text-primary" />
              <span>My Booking Passes</span>
            </div>
            <ChevronRight className="h-5 w-5 text-text-secondary" />
          </Link>

          {(user.role === 'cafe_owner' || user.role === 'staff') && (
            <Link
              href="/owner/dashboard"
              className="flex items-center justify-between p-4 hover:bg-surface rounded-xl transition-colors"
            >
              <div className="flex items-center gap-3 text-text-primary font-semibold text-body">
                <Store className="h-5 w-5 text-primary" />
                <span>Owner Dashboard</span>
              </div>
              <ChevronRight className="h-5 w-5 text-text-secondary" />
            </Link>
          )}

          {user.role === 'admin' && (
            <Link
              href="/admin"
              className="flex items-center justify-between p-4 hover:bg-surface rounded-xl transition-colors"
            >
              <div className="flex items-center gap-3 text-text-primary font-semibold text-body">
                <ShieldCheck className="h-5 w-5 text-primary" />
                <span>Admin Operations Panel</span>
              </div>
              <ChevronRight className="h-5 w-5 text-text-secondary" />
            </Link>
          )}
        </CardContent>
      </Card>

      {/* Sign Out Button */}
      <Button
        variant="destructive"
        size="lg"
        onClick={logout}
        className="gap-2 mt-4"
      >
        <LogOut className="h-5 w-5" />
        <span>Sign Out</span>
      </Button>
    </div>
  );
}
