'use client';

import React from 'react';
import { Gift, Sparkles } from 'lucide-react';

export default function RewardsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold font-heading text-text-primary">Gamer Rewards</h1>
        <p className="text-xs text-text-secondary">Earn points & unlock exclusive gaming discounts</p>
      </div>

      <div className="card-base text-center p-8 space-y-4 my-auto">
        <div className="inline-flex p-4 bg-emerald-50 text-primary rounded-full">
          <Gift className="w-10 h-10" />
        </div>

        <div className="space-y-2">
          <div className="inline-flex items-center space-x-1 px-3 py-1 bg-amber-50 text-amber-700 rounded-full text-[10px] font-bold font-data border border-amber-200">
            <Sparkles className="w-3 h-3" />
            <span>SEASON 1 LOYALTY PROGRAM</span>
          </div>
          <h2 className="text-2xl font-bold font-heading text-text-primary">Rewards Coming Soon</h2>
          <p className="text-xs text-text-secondary max-w-xs mx-auto leading-relaxed">
            We are crafting a gamified rewards system. Play sessions at verified cafés to earn EXP, unlock tier badges, and redeem free gaming hours!
          </p>
        </div>

        <div className="p-4 bg-surface rounded-2xl border border-border text-xs font-data text-text-secondary text-left space-y-1.5">
          <p className="font-semibold text-text-primary">🔥 Upcoming Perks:</p>
          <p>• 10% Cash-back on 5+ monthly bookings</p>
          <p>• Priority booking access during peak esports tournaments</p>
          <p>• Free upgrade from Standard to VIP RTX 4090 Rigs</p>
        </div>
      </div>
    </div>
  );
}
