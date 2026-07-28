import React from 'react';
import { Search, Flame, MapPin, Monitor, Zap } from 'lucide-react';

export default function Home() {
  return (
    <main className="max-w-md mx-auto min-h-screen pb-20 px-4 pt-6 flex flex-col gap-6">
      {/* Header */}
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-extrabold tracking-wider bg-gradient-to-r from-purple-500 via-indigo-400 to-pink-500 bg-clip-text text-transparent">
            KHEL-O
          </h1>
          <p className="text-xs text-zinc-400 font-medium">Gaming Café Demand Engine</p>
        </div>
        <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-full text-xs font-semibold text-purple-400">
          <MapPin size={14} className="text-purple-400" />
          <span>Pune</span>
        </div>
      </header>

      {/* Search Bar */}
      <div className="relative">
        <input
          type="text"
          placeholder="Search cafés, GPUs (RTX 3060, PS5)..."
          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-3 pl-10 pr-4 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-purple-500 transition"
        />
        <Search className="absolute left-3 top-3.5 text-zinc-500" size={18} />
      </div>

      {/* Flash Deals Section */}
      <section className="flex flex-col gap-3">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-1.5 text-amber-400 font-bold text-sm">
            <Flame size={18} className="animate-pulse text-amber-500" />
            <span>Off-Peak Power Deals</span>
          </div>
          <span className="text-xs text-purple-400 font-semibold cursor-pointer">View All</span>
        </div>

        {/* Gamified Promo Banner Card */}
        <div className="bg-gradient-to-br from-purple-900/60 via-zinc-900 to-zinc-900 border border-purple-500/30 rounded-2xl p-4 flex flex-col gap-3 relative overflow-hidden shadow-lg shadow-purple-950/40">
          <div className="flex justify-between items-start">
            <span className="bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] uppercase tracking-wider font-extrabold px-2.5 py-0.5 rounded-md flex items-center gap-1">
              <Zap size={12} /> 30% OFF FLASH DEAL
            </span>
            <span className="text-xs text-zinc-400 font-mono bg-zinc-950/60 px-2 py-0.5 rounded">Ends in 02h 14m</span>
          </div>

          <div>
            <h3 className="font-bold text-base text-zinc-100">GG Zone Gaming Café</h3>
            <p className="text-xs text-zinc-400">Kothrud, Pune • Premium Tier (RTX 3060, 240Hz)</p>
          </div>

          <div className="flex justify-between items-center pt-2 border-t border-zinc-800/80">
            <div>
              <span className="text-xs line-through text-zinc-500">₹120/hr</span>
              <span className="text-base font-bold text-emerald-400 ml-2">₹84/hr</span>
            </div>
            <button className="bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs px-4 py-2 rounded-xl transition shadow-md shadow-purple-600/30">
              Book Seat
            </button>
          </div>
        </div>
      </section>

      {/* Featured Cafés List */}
      <section className="flex flex-col gap-3">
        <h2 className="font-bold text-sm text-zinc-300">Nearby Gaming Cafés</h2>
        
        {/* Café Placeholder Card */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-3 hover:border-zinc-700 transition">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="font-semibold text-sm text-zinc-100">FragHouse Gaming Lounge</h3>
              <p className="text-xs text-zinc-400">Viman Nagar, Pune</p>
            </div>
            <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold px-2 py-0.5 rounded">
              4.8 ★
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs text-zinc-400">
            <span className="flex items-center gap-1"><Monitor size={14} className="text-purple-400" /> RTX 4070 / PS5</span>
            <span>•</span>
            <span>From ₹100/hr</span>
          </div>
        </div>
      </section>
    </main>
  );
}
