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
  Gamepad2,
  Cpu,
  Users,
  LifeBuoy,
} from 'lucide-react';

const CITIES = ['Bengaluru', 'Hyderabad', 'Mumbai', 'Delhi', 'Pune', 'Chennai'];
const GAME_OPTIONS = ['Valorant', 'CS2', 'EA FC 24', 'GTA V', 'Apex Legends', 'Dota 2', 'Fortnite', 'Cyberpunk 2077'];
const RIG_TIERS = ['Ultra RTX 4080 (240Hz)', 'RTX 4070 Super Rig', 'PS5 DualSense Lounge', 'Standard Esports PC'];

export default function ProfilePage() {
  const { user, setUser, logout } = useAuthStore();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isLogoutOpen, setIsLogoutOpen] = useState(false);

  const defaultName = user?.fullName || (user?.email ? user.email.split('@')[0] : 'Khel-O Gamer');
  const defaultPhone = user?.phoneNumber ? user.phoneNumber.replace(/^\+91\s?/, '') : '';

  const [fullName, setFullName] = useState(defaultName);
  const [phoneNumber, setPhoneNumber] = useState(defaultPhone);
  const [phoneError, setPhoneError] = useState('');
  const [nameError, setNameError] = useState('');

  const [homeCity, setHomeCity] = useState('Bengaluru');
  const [favGames, setFavGames] = useState<string[]>(['Valorant', 'EA FC 24']);
  const [preferredTier, setPreferredTier] = useState('Ultra RTX 4080 (240Hz)');

  if (!user) return null;

  const handlePhoneChange = (val: string) => {
    // Only allow numeric digits for Indian mobile numbers
    const digitsOnly = val.replace(/\D/g, '').slice(0, 10);
    setPhoneNumber(digitsOnly);
    if (digitsOnly.length > 0 && digitsOnly.length < 10) {
      setPhoneError('Mobile number must be exactly 10 digits.');
    } else if (digitsOnly.length === 10 && !/^[6-9]\d{9}$/.test(digitsOnly)) {
      setPhoneError('Enter a valid 10-digit Indian mobile number starting with 6-9.');
    } else {
      setPhoneError('');
    }
  };

  const handleNameChange = (val: string) => {
    setFullName(val);
    if (val.trim().length < 2) {
      setNameError('Name must be at least 2 characters.');
    } else {
      setNameError('');
    }
  };

  const toggleGame = (game: string) => {
    if (favGames.includes(game)) {
      setFavGames(favGames.filter((g) => g !== game));
    } else {
      setFavGames([...favGames, game]);
    }
  };

  const handleSaveProfile = () => {
    if (phoneError || nameError || phoneNumber.length !== 10) return;
    setUser({
      ...user,
      fullName,
      phoneNumber: `+91 ${phoneNumber}`,
    });
    setIsEditOpen(false);
  };

  return (
    <div className="flex flex-col gap-4 max-w-2xl mx-auto pb-24">
      {/* Profile Header Card */}
      <Card elevation="raised" className="overflow-hidden border border-primary/20">
        <CardContent className="p-4 sm:p-5 flex flex-row items-center gap-4">
          <Avatar name={fullName} src={user.avatarUrl} size="lg" className="flex-shrink-0" />

          <div className="flex flex-1 flex-col gap-0.5 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="font-heading text-h3 font-bold text-text-primary truncate">{fullName}</h1>
              <Badge variant="primary" size="sm" className="flex-shrink-0">
                Level 4
              </Badge>
            </div>
            <p className="text-caption text-text-secondary truncate">{user.email}</p>

            <div className="flex items-center gap-2 text-caption text-text-secondary mt-1 flex-wrap">
              <span className="flex items-center gap-1 font-data">
                <Phone className="h-3 w-3 text-primary flex-shrink-0" />
                <span>+91 {phoneNumber}</span>
              </span>
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3 text-accent flex-shrink-0" />
                <span>{homeCity}</span>
              </span>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsEditOpen(true)}
            className="gap-1 text-caption flex-shrink-0"
          >
            <Edit3 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Edit</span>
          </Button>
        </CardContent>
      </Card>

      {/* Pending Staff Invitation Banner */}
      {user.pendingInvitations && user.pendingInvitations.length > 0 && (
        <div className="flex flex-col gap-2">
          {user.pendingInvitations.map((inv) => (
            <Card key={inv.id} elevation="raised" className="border-2 border-emerald-500/50 bg-gradient-to-r from-emerald-500/10 via-card to-amber-500/10">
              <CardContent className="p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500 text-slate-950 font-bold flex-shrink-0">
                    <Users className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-heading text-body font-bold text-text-primary flex items-center gap-2">
                      <span>🎉 Staff Invitation: {inv.venueName}</span>
                    </h3>
                    <p className="text-caption text-text-secondary">
                      You have been invited to join {inv.venueName} as venue staff.
                    </p>
                  </div>
                </div>

                <Link href={`/accept-invitation?token=${inv.token}`} className="w-full sm:w-auto flex-shrink-0">
                  <Button variant="primary" size="sm" className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold gap-1.5 shadow-card">
                    <span>Accept Invitation</span>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Gamer Preferences Breakdown */}
      <Card elevation="resting">
        <CardContent className="p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="font-heading text-body font-bold text-text-primary flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-accent" />
              <span>Gamer Profile & Hardware Preferences</span>
            </h3>
            <button
              onClick={() => setIsEditOpen(true)}
              className="text-caption font-bold text-primary hover:underline"
            >
              Manage
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-caption">
            <div className="p-3 rounded-2xl bg-surface flex flex-col gap-1">
              <span className="text-overline text-text-secondary flex items-center gap-1">
                <Gamepad2 className="h-3 w-3 text-primary" /> Favorite Games
              </span>
              <div className="flex items-center gap-1 flex-wrap mt-0.5">
                {favGames.map((g) => (
                  <span key={g} className="rounded-full bg-card px-2.5 py-0.5 font-semibold text-text-primary border border-border">
                    {g}
                  </span>
                ))}
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-surface flex flex-col gap-1">
              <span className="text-overline text-text-secondary flex items-center gap-1">
                <Cpu className="h-3 w-3 text-accent" /> Preferred Rig Tier
              </span>
              <span className="font-semibold text-primary mt-0.5">{preferredTier}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Partner Conversion / Application Status Banner */}
      {user.roles && user.roles.includes('cafe_owner') ? (
        <Card elevation="resting" className="border border-emerald-500/30 bg-gradient-to-r from-emerald-500/10 via-card to-amber-500/10">
          <CardContent className="p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500 text-slate-950 shadow-card flex-shrink-0 font-bold">
                <Store className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-heading text-body font-bold text-text-primary">Café Owner Portal Access</h3>
                <p className="text-caption text-text-secondary">
                  Manage your gaming venue, live bookings & payouts.
                </p>
              </div>
            </div>

            <Link href="/owner/dashboard" className="flex-shrink-0 w-full sm:w-auto">
              <Button variant="primary" size="sm" className="gap-1.5 w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold">
                <span>Go to Owner Portal</span>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card elevation="resting" className="border border-primary/20 bg-gradient-to-r from-primary/10 via-card to-accent/10">
          <CardContent className="p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white shadow-card flex-shrink-0">
                <Store className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-heading text-body font-bold text-text-primary">Own a Gaming Café?</h3>
                <p className="text-caption text-text-secondary">
                  List your venue on KHEL-O to automate station bookings.
                </p>
              </div>
            </div>

            <Link href="/partner" className="flex-shrink-0 w-full sm:w-auto">
              <Button variant="primary" size="sm" className="gap-1.5 w-full">
                <span>Become Partner</span>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Navigation Quick Links */}
      <Card elevation="resting">
        <CardContent className="p-1 flex flex-col divide-y divide-border/60">
          <Link
            href="/bookings"
            className="flex items-center justify-between p-3.5 hover:bg-surface rounded-xl transition-colors"
          >
            <div className="flex items-center gap-3 text-text-primary font-semibold text-body">
              <Ticket className="h-4 w-4 text-primary" />
              <span>My Booking Passes</span>
            </div>
            <ChevronRight className="h-4 w-4 text-text-secondary" />
          </Link>

          <Link
            href="/rewards"
            className="flex items-center justify-between p-3.5 hover:bg-surface rounded-xl transition-colors"
          >
            <div className="flex items-center gap-3 text-text-primary font-semibold text-body">
              <Sparkles className="h-4 w-4 text-accent" />
              <span>Gamified Rewards & Badges</span>
            </div>
            <ChevronRight className="h-4 w-4 text-text-secondary" />
          </Link>

          <Link
            href="/support"
            className="flex items-center justify-between p-3.5 hover:bg-surface rounded-xl transition-colors"
          >
            <div className="flex items-center gap-3 text-text-primary font-semibold text-body">
              <LifeBuoy className="h-4 w-4 text-text-secondary" />
              <span>Help & Support</span>
            </div>
            <ChevronRight className="h-4 w-4 text-text-secondary" />
          </Link>
        </CardContent>
      </Card>

      {/* Sign Out Button */}
      <Button
        variant="destructive"
        size="md"
        onClick={() => setIsLogoutOpen(true)}
        className="gap-2 mt-1"
      >
        <LogOut className="h-4 w-4" />
        <span>Sign Out</span>
      </Button>

      {/* Edit Profile Modal */}
      <Modal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        title="Edit Gamer Profile"
        description="Update your personal information and gaming preferences."
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setIsEditOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSaveProfile} disabled={Boolean(phoneError || nameError)}>
              Save Profile
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
              onChange={(e) => handleNameChange(e.target.value)}
              className="w-full rounded-xl border border-border bg-surface px-3.5 py-2 text-body text-text-primary focus:ring-2 focus:ring-primary/40 focus:outline-none"
            />
            {nameError && <p className="text-caption text-error mt-1">{nameError}</p>}
          </div>

          <div>
            <label className="text-caption font-semibold text-text-secondary mb-1 block">10-Digit Mobile Number (India)</label>
            <div className="relative flex items-center">
              <span className="absolute left-3.5 text-caption font-bold text-text-secondary">+91</span>
              <input
                type="text"
                value={phoneNumber}
                maxLength={10}
                onChange={(e) => handlePhoneChange(e.target.value)}
                placeholder="9876543210"
                className="w-full rounded-xl border border-border bg-surface pl-12 pr-3.5 py-2 font-data text-body text-text-primary focus:ring-2 focus:ring-primary/40 focus:outline-none"
              />
            </div>
            {phoneError && <p className="text-caption text-error mt-1">{phoneError}</p>}
          </div>

          <div>
            <label className="text-caption font-semibold text-text-secondary mb-1 block">Home City</label>
            <select
              value={homeCity}
              onChange={(e) => setHomeCity(e.target.value)}
              className="w-full rounded-xl border border-border bg-surface px-3.5 py-2 text-body text-text-primary focus:ring-2 focus:ring-primary/40 focus:outline-none"
            >
              {CITIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-caption font-semibold text-text-secondary mb-1 block">Preferred Hardware Tier</label>
            <select
              value={preferredTier}
              onChange={(e) => setPreferredTier(e.target.value)}
              className="w-full rounded-xl border border-border bg-surface px-3.5 py-2 text-body text-text-primary focus:ring-2 focus:ring-primary/40 focus:outline-none"
            >
              {RIG_TIERS.map((tier) => (
                <option key={tier} value={tier}>
                  {tier}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-caption font-semibold text-text-secondary mb-1.5 block">Favorite Games (Select Multiple)</label>
            <div className="flex items-center gap-1.5 flex-wrap">
              {GAME_OPTIONS.map((game) => {
                const isSelected = favGames.includes(game);
                return (
                  <button
                    key={game}
                    type="button"
                    onClick={() => toggleGame(game)}
                    className={`rounded-full px-3 py-1 text-caption font-semibold transition-all ${
                      isSelected
                        ? 'bg-secondary text-white shadow-sm'
                        : 'bg-surface text-text-secondary border border-border hover:bg-border/40'
                    }`}
                  >
                    {game} {isSelected ? '✓' : ''}
                  </button>
                );
              })}
            </div>
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
          <div className="flex items-center justify-end gap-2">
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
