'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/store/authStore';
import {
  Avatar,
  Card,
  CardContent,
  Button,
  Badge,
  Modal,
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
  MapPin,
  Calendar,
  Sparkles,
  Edit3,
  CheckCircle2,
} from 'lucide-react';

export default function ProfilePage() {
  const { user, setUser, logout } = useAuthStore();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isLogoutOpen, setIsLogoutOpen] = useState(false);

  const [fullName, setFullName] = useState(user?.fullName || '');
  const [phoneNumber, setPhoneNumber] = useState(user?.phoneNumber || '+91 9876543210');
  const [homeCity, setHomeCity] = useState('Bengaluru');
  const [favGames, setFavGames] = useState('Valorant, EA FC 24');

  if (!user) return null;

  const handleSaveProfile = () => {
    setUser({
      ...user,
      fullName,
      phoneNumber,
    });
    setIsEditOpen(false);
  };

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto pb-24">
      {/* Profile Header Card */}
      <Card elevation="raised" className="overflow-hidden border-2 border-primary/20">
        <CardContent className="p-6 flex flex-col sm:flex-row items-center sm:items-start gap-5">
          <Avatar name={user.fullName} src={user.avatarUrl} size="xl" />

          <div className="flex flex-1 flex-col items-center sm:items-start text-center sm:text-left gap-1">
            <div className="flex items-center gap-2">
              <h1 className="font-heading text-h2 text-text-primary">{user.fullName}</h1>
              <Badge variant="primary" size="sm">
                Level 4 Gamer
              </Badge>
            </div>
            <p className="text-body text-text-secondary">{user.email}</p>

            <div className="flex items-center gap-3 text-caption text-text-secondary mt-1 flex-wrap">
              <span className="flex items-center gap-1">
                <Phone className="h-3.5 w-3.5 text-primary" />
                <span>{phoneNumber}</span>
              </span>
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5 text-accent" />
                <span>{homeCity}</span>
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5 text-secondary" />
                <span>Member since Jan 2026</span>
              </span>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditOpen(true)}
              className="gap-1.5 mt-3 text-caption"
            >
              <Edit3 className="h-3.5 w-3.5" />
              <span>Edit Profile</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Gamer Preferences Breakdown */}
      <Card elevation="resting">
        <CardContent className="p-5 flex flex-col gap-3">
          <h3 className="font-heading text-h3 text-text-primary flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent" />
            <span>Gaming Preferences</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-body">
            <div className="p-3.5 rounded-2xl bg-surface flex flex-col gap-1">
              <span className="text-overline text-text-secondary">Favorite Games</span>
              <span className="font-semibold text-text-primary">{favGames}</span>
            </div>

            <div className="p-3.5 rounded-2xl bg-surface flex flex-col gap-1">
              <span className="text-overline text-text-secondary">Preferred Rig Tier</span>
              <span className="font-semibold text-primary">Ultra RTX 4080 (240Hz)</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Partner Conversion Banner */}
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

      {/* Navigation Quick Links */}
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

          <Link
            href="/rewards"
            className="flex items-center justify-between p-4 hover:bg-surface rounded-xl transition-colors"
          >
            <div className="flex items-center gap-3 text-text-primary font-semibold text-body">
              <Sparkles className="h-5 w-5 text-accent" />
              <span>Gamified Rewards & Badges</span>
            </div>
            <ChevronRight className="h-5 w-5 text-text-secondary" />
          </Link>
        </CardContent>
      </Card>

      {/* Sign Out Button */}
      <Button
        variant="destructive"
        size="lg"
        onClick={() => setIsLogoutOpen(true)}
        className="gap-2 mt-2"
      >
        <LogOut className="h-5 w-5" />
        <span>Sign Out</span>
      </Button>

      {/* Edit Profile Modal */}
      <Modal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        title="Edit Profile"
        description="Update your personal details and gamer profile."
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button variant="ghost" onClick={() => setIsEditOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSaveProfile}>
              Save Changes
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <div>
            <label className="text-caption font-semibold text-text-secondary mb-1 block">Full Name</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-body text-text-primary"
            />
          </div>

          <div>
            <label className="text-caption font-semibold text-text-secondary mb-1 block">Phone Number</label>
            <input
              type="text"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-body text-text-primary"
            />
          </div>

          <div>
            <label className="text-caption font-semibold text-text-secondary mb-1 block">Home City</label>
            <input
              type="text"
              value={homeCity}
              onChange={(e) => setHomeCity(e.target.value)}
              className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-body text-text-primary"
            />
          </div>

          <div>
            <label className="text-caption font-semibold text-text-secondary mb-1 block">Favorite Games</label>
            <input
              type="text"
              value={favGames}
              onChange={(e) => setFavGames(e.target.value)}
              className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-body text-text-primary"
            />
          </div>
        </div>
      </Modal>

      {/* Logout Confirmation Dialog */}
      <Modal
        isOpen={isLogoutOpen}
        onClose={() => setIsLogoutOpen(false)}
        title="Sign Out"
        description="Are you sure you want to sign out of your KHEL-O account?"
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button variant="ghost" onClick={() => setIsLogoutOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={logout}>
              Confirm Sign Out
            </Button>
          </div>
        }
      >
        <p className="text-caption text-text-secondary">
          You will need to sign back in to access your digital gaming passes and active sessions.
        </p>
      </Modal>
    </div>
  );
}
