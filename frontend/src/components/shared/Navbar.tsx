'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/store/authStore';
import { Gamepad2, Calendar, LayoutDashboard, Shield, LogOut, ChevronDown } from 'lucide-react';

export default function Navbar() {
  const { user, isAuthenticated, logout } = useAuthStore();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <header className="hidden md:block sticky top-0 z-40 w-full border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Brand Logo */}
        <Link href="/" className="flex items-center gap-2 text-purple-500 font-extrabold text-xl tracking-wider hover:opacity-90 transition">
          <Gamepad2 className="w-7 h-7" />
          <span className="text-white">KHEL-O</span>
        </Link>

        {/* Auth States */}
        <div className="flex items-center gap-4">
          {!isAuthenticated || !user ? (
            <>
              <Link
                href="/login"
                className="text-sm font-semibold text-zinc-300 hover:text-white transition px-3 py-2"
              >
                Login
              </Link>
              <Link
                href="/register"
                className="text-sm font-semibold text-purple-400 hover:text-purple-300 border border-purple-500/50 hover:border-purple-500 px-4 py-2 rounded-xl transition"
              >
                Register
              </Link>
            </>
          ) : (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-2.5 bg-zinc-900 hover:bg-zinc-800/90 border border-zinc-800 p-1.5 pr-3 rounded-full transition"
              >
                {user.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.avatarUrl}
                    alt={user.fullName}
                    className="w-8 h-8 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-purple-600 text-white font-bold text-xs flex items-center justify-center">
                    {getInitials(user.fullName)}
                  </div>
                )}
                <span className="text-xs font-semibold text-white max-w-[120px] truncate">{user.fullName}</span>
                <ChevronDown className={`w-3.5 h-3.5 text-zinc-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Dropdown Menu */}
              {dropdownOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="px-4 py-2.5 border-b border-zinc-800/80">
                    <p className="text-xs font-bold text-white truncate">{user.fullName}</p>
                    <p className="text-[11px] text-zinc-400 truncate">{user.email}</p>
                    <span className="inline-block mt-1 text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-purple-950 text-purple-400 border border-purple-800/60">
                      {user.role}
                    </span>
                  </div>

                  <div className="py-1">
                    <Link
                      href="/bookings"
                      onClick={() => setDropdownOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-800/60 hover:text-white transition"
                    >
                      <Calendar className="w-4 h-4 text-purple-400" />
                      My Bookings
                    </Link>

                    {user.role === 'cafe_owner' && (
                      <Link
                        href="/owner"
                        onClick={() => setDropdownOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-800/60 hover:text-white transition"
                      >
                        <LayoutDashboard className="w-4 h-4 text-emerald-400" />
                        Owner Dashboard
                      </Link>
                    )}

                    {user.role === 'admin' && (
                      <Link
                        href="/admin"
                        onClick={() => setDropdownOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-800/60 hover:text-white transition"
                      >
                        <Shield className="w-4 h-4 text-amber-400" />
                        Admin Panel
                      </Link>
                    )}
                  </div>

                  <div className="pt-1 border-t border-zinc-800/80">
                    <button
                      onClick={() => {
                        setDropdownOpen(false);
                        logout();
                      }}
                      className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-red-400 hover:bg-red-950/40 hover:text-red-300 transition text-left"
                    >
                      <LogOut className="w-4 h-4" />
                      Logout
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
