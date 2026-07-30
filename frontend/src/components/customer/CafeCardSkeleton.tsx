'use client';

import React from 'react';

export default function CafeCardSkeleton() {
  return (
    <div className="bg-card rounded-2xl border border-border shadow-md p-3 flex gap-3 animate-pulse">
      {/* Left: Square Image Placeholder */}
      <div className="w-[96px] h-[96px] bg-surface rounded-xl flex-shrink-0" />

      {/* Right Content */}
      <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
        {/* Row 1: Name & Rating */}
        <div className="flex items-center justify-between gap-2">
          <div className="h-4 bg-surface rounded w-3/5" />
          <div className="h-4 bg-surface rounded-full w-12 flex-shrink-0" />
        </div>

        {/* Row 2: City */}
        <div className="h-3 bg-surface rounded w-1/4" />

        {/* Row 3: Tier Tags */}
        <div className="flex gap-1.5">
          <div className="h-4 bg-surface rounded-full w-16" />
          <div className="h-4 bg-surface rounded-full w-14" />
        </div>

        {/* Row 4: Price & Flash Deal Badge */}
        <div className="flex items-center justify-between">
          <div className="h-4 bg-surface rounded w-1/3" />
          <div className="h-4 bg-surface rounded-full w-20" />
        </div>
      </div>
    </div>
  );
}
