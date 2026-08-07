'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { Gamepad2, Store, RefreshCw, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';

export function RoleSwitcher() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const activeRole = useAuthStore((s) => s.activeRole);
  const switchActiveRole = useAuthStore((s) => s.switchActiveRole);

  const [isSwitching, setIsSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const roles = user?.roles || [];
  if (!user || roles.length <= 1) {
    return null;
  }

  const handleToggleRole = async () => {
    const targetRole = activeRole === 'cafe_owner' ? 'gamer' : 'cafe_owner';
    setError(null);
    setIsSwitching(true);

    try {
      await switchActiveRole(targetRole);
      if (targetRole === 'cafe_owner') {
        router.push('/owner/dashboard');
      } else {
        router.push('/');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to switch portal mode');
    } finally {
      setIsSwitching(false);
    }
  };

  const isOwnerActive = activeRole === 'cafe_owner';

  return (
    <div className="relative inline-flex items-center gap-2">
      <button
        onClick={handleToggleRole}
        disabled={isSwitching}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold transition-all duration-200 shadow-sm ${
          isOwnerActive
            ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20'
            : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
        }`}
        title={`Click to switch to ${isOwnerActive ? 'Gamer Mode' : 'Owner Portal'}`}
      >
        {isSwitching ? (
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
        ) : isOwnerActive ? (
          <Store className="h-3.5 w-3.5" />
        ) : (
          <Gamepad2 className="h-3.5 w-3.5" />
        )}

        <span>{isOwnerActive ? 'Owner Portal' : 'Gamer Mode'}</span>

        <Badge
          variant={isOwnerActive ? 'warning' : 'success'}
          size="sm"
          className="ml-1 text-[10px] uppercase py-0 px-1.5"
        >
          {isOwnerActive ? 'Owner' : 'Gamer'}
        </Badge>
      </button>

      {error && (
        <span className="text-[11px] text-rose-400 flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          {error}
        </span>
      )}
    </div>
  );
}
