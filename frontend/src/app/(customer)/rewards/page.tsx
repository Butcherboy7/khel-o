'use client';

import { useState } from 'react';
import { Gift, Award, Flame, Zap, Check, Lock, Ticket, Sparkles, ChevronRight, Copy, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, Button, Badge } from '@/components/ui';

interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  isUnlocked: boolean;
  progress: string;
  xpReward: number;
}

const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'a1',
    title: 'First Blood 🩸',
    description: 'Complete your first gaming session booking.',
    icon: '🎯',
    isUnlocked: true,
    progress: '1 / 1',
    xpReward: 100,
  },
  {
    id: 'a2',
    title: 'Night Owl 🦉',
    description: 'Book and complete a session after 10 PM.',
    icon: '🌙',
    isUnlocked: true,
    progress: '1 / 1',
    xpReward: 250,
  },
  {
    id: 'a3',
    title: 'Weekend Warrior ⚔️',
    description: 'Complete 3 weekend sessions in a single month.',
    icon: '🎮',
    isUnlocked: false,
    progress: '2 / 3',
    xpReward: 500,
  },
  {
    id: 'a4',
    title: 'Regular Patron 👑',
    description: 'Complete 10 total station bookings.',
    icon: '🏆',
    isUnlocked: false,
    progress: '4 / 10',
    xpReward: 1000,
  },
];

interface Coupon {
  id: string;
  code: string;
  discount: string;
  description: string;
  requiredXp: number;
  isClaimed: boolean;
}

const COUPONS: Coupon[] = [
  {
    id: 'c1',
    code: 'FIRSTBLOOD50',
    discount: '₹50 OFF',
    description: 'Applicable on any station booking above ₹150.',
    requiredXp: 0,
    isClaimed: true,
  },
  {
    id: 'c2',
    code: 'OFFPEAK50',
    discount: '30% OFF',
    description: 'Valid for afternoon sessions before 5 PM.',
    requiredXp: 300,
    isClaimed: false,
  },
  {
    id: 'c3',
    code: 'PROGAMER100',
    discount: '₹100 OFF',
    description: 'Valid for RTX 4080 & RTX 4090 VIP Tiers.',
    requiredXp: 1500,
    isClaimed: false,
  },
];

export default function RewardsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>(COUPONS);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [activeAchievement, setActiveAchievement] = useState<Achievement | null>(null);

  const currentXp = 1450;
  const nextLevelXp = 2000;
  const xpPercentage = Math.round((currentXp / nextLevelXp) * 100);

  const claimCoupon = (id: string) => {
    setCoupons((prev) =>
      prev.map((c) => (c.id === id ? { ...c, isClaimed: true } : c))
    );
  };

  const copyCouponCode = (code: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(code);
    }
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2500);
  };

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto pb-24">
      {/* Level & XP Banner */}
      <Card elevation="raised" className="overflow-hidden border border-accent/30 bg-gradient-to-r from-secondary via-secondary to-[#2B2D42] text-white">
        <CardContent className="p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent text-white font-heading font-bold text-h3 shadow-card">
                L4
              </div>
              <div>
                <span className="text-overline text-white/70 uppercase">Current Tier</span>
                <h1 className="font-heading text-h3 text-white">Veteran Gamer</h1>
              </div>
            </div>

            <Badge variant="primary" size="md" className="gap-1 bg-white/20 text-white border-0">
              <Zap className="h-4 w-4 fill-primary text-primary" />
              <span>{currentXp} XP</span>
            </Badge>
          </div>

          {/* XP Progress Bar */}
          <div className="flex flex-col gap-1.5 pt-1">
            <div className="flex justify-between text-caption text-white/80">
              <span>Level 4 Progress</span>
              <span>{currentXp} / {nextLevelXp} XP ({xpPercentage}%)</span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-black/40 overflow-hidden p-0.5">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-500"
                style={{ width: `${xpPercentage}%` }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Toast Feedback Banner */}
      {copiedCode && (
        <div className="sticky top-20 z-50 rounded-2xl bg-success text-white px-4 py-2.5 shadow-float flex items-center justify-between animate-in fade-in">
          <span className="font-heading text-caption font-bold flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4" /> Code {copiedCode} copied to clipboard!
          </span>
          <span className="text-overline uppercase">Ready to paste</span>
        </div>
      )}

      {/* Unlockable Coupons */}
      <div className="flex flex-col gap-3">
        <h2 className="font-heading text-h3 text-text-primary flex items-center gap-2">
          <Ticket className="h-5 w-5 text-primary" />
          <span>Reward Vouchers & Coupons</span>
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {coupons.map((c) => {
            const canClaim = currentXp >= c.requiredXp;
            return (
              <div
                key={c.id}
                className="p-4 rounded-3xl bg-card border border-border/80 flex flex-col justify-between gap-3 shadow-card"
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-data text-h3 font-bold text-primary flex items-center gap-0.5">
                      {c.discount.includes('₹') ? (
                        <>
                          <span className="rupee-symbol">₹</span>
                          {c.discount.replace('₹', '')}
                        </>
                      ) : (
                        c.discount
                      )}
                    </span>
                    <Badge variant={c.isClaimed ? 'success' : 'secondary'} size="sm">
                      {c.isClaimed ? 'Claimed' : `${c.requiredXp} XP`}
                    </Badge>
                  </div>
                  <p className="text-caption text-text-secondary">
                    {c.description.includes('₹') ? (
                      <>
                        {c.description.split('₹')[0]}
                        <span className="rupee-symbol">₹</span>
                        {c.description.split('₹')[1]}
                      </>
                    ) : (
                      c.description
                    )}
                  </p>
                </div>

                <div className="flex items-center justify-between border-t border-border/60 pt-3">
                  <span className="font-data text-caption font-bold text-text-primary bg-surface px-2.5 py-1 rounded-lg border border-border">
                    {c.code}
                  </span>

                  {c.isClaimed ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyCouponCode(c.code)}
                      className="text-caption gap-1 text-primary border-primary/40 hover:bg-primary/10"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      <span>{copiedCode === c.code ? 'Copied ✓' : 'Copy Code'}</span>
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      disabled={!canClaim}
                      onClick={() => claimCoupon(c.id)}
                      className="text-caption"
                    >
                      Claim Vouchers
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Achievement Badges Grid */}
      <div className="flex flex-col gap-3">
        <h2 className="font-heading text-h3 text-text-primary flex items-center gap-2">
          <Award className="h-5 w-5 text-accent" />
          <span>Gamer Badges & Milestones</span>
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {ACHIEVEMENTS.map((ach) => (
            <div
              key={ach.id}
              onClick={() => setActiveAchievement(ach)}
              className={`p-4 rounded-3xl border transition-all flex items-start gap-3.5 cursor-pointer hover:shadow-card ${
                ach.isUnlocked
                  ? 'bg-card border-primary/40 shadow-sm'
                  : 'bg-surface/60 border-border/60 opacity-75'
              }`}
            >
              <div className="text-3xl p-2 rounded-2xl bg-surface flex-shrink-0">
                {ach.icon}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <h3 className="font-heading text-body font-bold text-text-primary truncate">
                    {ach.title}
                  </h3>
                  {ach.isUnlocked ? (
                    <span className="text-caption text-success font-bold flex-shrink-0">
                      +{ach.xpReward} XP
                    </span>
                  ) : (
                    <Lock className="h-3.5 w-3.5 text-text-secondary flex-shrink-0" />
                  )}
                </div>

                <p className="text-caption text-text-secondary mt-0.5">{ach.description}</p>
                <div className="text-badge font-semibold text-text-secondary mt-2 flex items-center justify-between">
                  <span>Progress: {ach.progress}</span>
                  <span className="text-primary hover:underline">Details →</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Achievement Feedback Celebration Modal */}
      {activeAchievement && (
        <div
          onClick={() => setActiveAchievement(null)}
          className="fixed inset-0 z-modal flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-3xl bg-card border border-border p-6 shadow-overlay flex flex-col items-center text-center gap-3"
          >
            <div className="text-5xl p-4 rounded-full bg-primary/10 mb-1">
              {activeAchievement.icon}
            </div>

            <h3 className="font-heading text-h2 font-bold text-text-primary">
              {activeAchievement.title}
            </h3>

            <p className="text-body text-text-secondary">
              {activeAchievement.description}
            </p>

            <div className="w-full rounded-2xl bg-surface p-3 flex items-center justify-between text-caption font-semibold my-1">
              <span className="text-text-secondary">Reward XP:</span>
              <span className="font-bold text-success">+{activeAchievement.xpReward} XP</span>
            </div>

            <Button
              variant="primary"
              size="md"
              fullWidth
              onClick={() => setActiveAchievement(null)}
            >
              Continue Quest
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
