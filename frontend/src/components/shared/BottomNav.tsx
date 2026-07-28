'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { Home, Search, Calendar, User as UserIcon, LogIn } from 'lucide-react';

export default function BottomNav() {
  const pathname = usePathname();
  const { isAuthenticated } = useAuthStore();

  const navItems = !isAuthenticated
    ? [
        { label: 'Home', href: '/', icon: Home },
        { label: 'Search', href: '/search', icon: Search },
        { label: 'Login', href: '/login', icon: LogIn },
      ]
    : [
        { label: 'Home', href: '/', icon: Home },
        { label: 'Search', href: '/search', icon: Search },
        { label: 'Bookings', href: '/bookings', icon: Calendar },
        { label: 'Profile', href: '/profile', icon: UserIcon },
      ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-zinc-950/90 backdrop-blur-lg border-t border-zinc-800/80 pb-safe">
      <div className="flex items-center justify-around h-16 px-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center w-full h-full gap-1 text-[11px] font-medium transition ${
                isActive ? 'text-purple-400' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.5px]' : 'stroke-2'}`} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
