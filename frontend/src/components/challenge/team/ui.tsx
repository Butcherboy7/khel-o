'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, CreditCard, Crosshair, Instagram, LifeBuoy, MapPin, Timer, Trophy, Users } from 'lucide-react';
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon';
import type { TeamChallengeConfig, TeamIcon } from '@/challenges/types';

/* One palette for every team-challenge page: KHEL-O's challenge colours
   (warm black, brand red, signal yellow) plus XQZ's own blue light. */
export const C = {
  bg: '#0A0809',
  ink: '#F4F1EC',
  muted: '#B4B0B8',
  line: '#2A2530',
  surface: '#141017',
  red: '#D0463C',
  redHi: '#E8675D',
  yellow: '#F2C94C',
  blue: '#5B8CFF',
  green: '#25D366',
};

export const field =
  'h-12 w-full rounded-xl border border-[#2C2530] bg-[#0F0C12] px-3.5 text-base text-[#F4F1EC] placeholder:text-[#77707C] focus:border-[#E8675D] focus:outline-none focus:ring-2 focus:ring-[#E8675D]/40 aria-[invalid=true]:border-[#E8675D]';

export function rupees(n: number): string {
  return `₹${n.toLocaleString('en-IN')}`;
}

export function istTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }).toUpperCase();
}

export function istDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
}

/** Ticks once a second. Null on the server and the first browser paint, so
 *  the server's clock never disagrees with the phone's (hydration). */
export function useNow(): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

export function countdownParts(target: string, now: number | null): { d: number; h: number; m: number; s: number; over: boolean; ready: boolean } {
  if (now === null) return { d: 0, h: 0, m: 0, s: 0, over: false, ready: false };
  const ms = Math.max(0, new Date(target).getTime() - now);
  const s = Math.floor(ms / 1000);
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60, over: ms === 0, ready: true };
}

export function instaUrl(handle: string): string {
  return `https://www.instagram.com/${handle}/`;
}

export function TeamIconGlyph({ icon, className = 'h-5 w-5' }: { icon: TeamIcon; className?: string }) {
  switch (icon) {
    case 'crosshair': return <Crosshair className={className} aria-hidden />;
    case 'users': return <Users className={className} aria-hidden />;
    case 'timer': return <Timer className={className} aria-hidden />;
    case 'card': return <CreditCard className={className} aria-hidden />;
    case 'whatsapp': return <WhatsAppIcon className={className} aria-hidden />;
    case 'instagram': return <Instagram className={className} aria-hidden />;
    case 'pin': return <MapPin className={className} aria-hidden />;
    case 'trophy': return <Trophy className={className} aria-hidden />;
  }
}

/** The page frame: back to KHEL-O, the content, and the footer every page of the challenge carries. */
export function TeamShell({ cfg, children, back = '/', backLabel = 'Home', wide = false }: {
  cfg: TeamChallengeConfig; children: ReactNode; back?: string; backLabel?: string; wide?: boolean;
}) {
  return (
    <div className="min-h-screen bg-[#0A0809] text-[#F4F1EC] selection:bg-[#D0463C] selection:text-white [&_a]:underline-offset-4">
      <header className={`relative z-20 mx-auto flex items-center justify-between px-4 pt-4 ${wide ? 'max-w-6xl' : 'max-w-xl'}`}>
        <Link
          href={back}
          className="inline-flex h-11 items-center gap-1.5 rounded-full border border-white/20 bg-black/55 pl-3 pr-4 text-sm font-semibold backdrop-blur hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> {backLabel}
        </Link>
      </header>
      {children}
      <TeamFooter cfg={cfg} wide={wide} />
    </div>
  );
}

export function TeamFooter({ cfg, wide = false }: { cfg: TeamChallengeConfig; wide?: boolean }) {
  const venueInsta = cfg.venue.instagramHandle;
  return (
    <footer className="border-t border-[#221D27] bg-[#08060A] px-4 pb-32 pt-8 md:pb-10">
      <div className={`mx-auto flex flex-col gap-5 ${wide ? 'max-w-6xl' : 'max-w-xl'}`}>
        <div className="flex flex-wrap gap-2 text-sm font-semibold">
          <FooterLink href={instaUrl(cfg.links.kheloInstagramHandle)} icon={<Instagram className="h-4 w-4" aria-hidden />}>
            Khelo on Instagram
          </FooterLink>
          {venueInsta && (
            <FooterLink href={instaUrl(venueInsta)} icon={<Instagram className="h-4 w-4" aria-hidden />}>
              {cfg.venue.shortName} on Instagram
            </FooterLink>
          )}
          <FooterLink href={cfg.links.communityInvite} icon={<WhatsAppIcon className="h-4 w-4 text-[#25D366]" aria-hidden />}>
            Join the Khelo community
          </FooterLink>
          {cfg.links.supportWhatsApp && (
            <FooterLink
              href={`https://wa.me/${cfg.links.supportWhatsApp}?text=${encodeURIComponent(`Hi Khelo, I have a question about the ${cfg.title}.`)}`}
              icon={<WhatsAppIcon className="h-4 w-4 text-[#25D366]" aria-hidden />}
            >
              Ask us on WhatsApp
            </FooterLink>
          )}
          {/* No help number yet: payments and refunds still need somewhere to ask. */}
          {!cfg.links.supportWhatsApp && (
            <FooterLink href="/support" icon={<LifeBuoy className="h-4 w-4" aria-hidden />}>
              Need help?
            </FooterLink>
          )}
        </div>
        <p className="text-sm text-[#9A94A0]">{cfg.disclaimer}</p>
      </div>
    </footer>
  );
}

function FooterLink({ href, icon, children }: { href: string; icon: ReactNode; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-[#2A2530] px-4 text-[#E4E0E8] transition-colors hover:border-[#4A4352] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
    >
      {icon}
      {children}
    </a>
  );
}

/** A big link button that turns into a green tick once tapped (community / Instagram). */
export function TapButton({
  href, done, onTap, icon, children, tone,
}: {
  href: string; done: boolean; onTap: () => void; icon: ReactNode; children: ReactNode; tone: 'whatsapp' | 'instagram';
}) {
  const idle = tone === 'whatsapp'
    ? 'border-[#25D366]/50 bg-[#25D366]/10 text-[#C8F7D8] hover:bg-[#25D366]/20'
    : 'border-[#E1306C]/45 bg-gradient-to-r from-[#833AB4]/20 via-[#E1306C]/18 to-[#F77737]/18 text-[#FFD9E6] hover:border-[#E1306C]/70';
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onTap}
      className={`flex min-h-[60px] items-center gap-3 rounded-2xl border px-4 text-left text-[16px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${
        done ? 'border-[#3B6B4A] bg-[#13221A] text-[#9BF0B9]' : idle
      }`}
    >
      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center">{icon}</span>
      <span className="flex-1">{children}</span>
      {done ? (
        <span className="vx-tick flex h-8 w-8 items-center justify-center rounded-full bg-[#25D366] text-[#06210F]" aria-label="Done">
          <Check className="h-5 w-5" strokeWidth={3} aria-hidden />
        </span>
      ) : (
        <span className="text-xs font-semibold opacity-80">Tap</span>
      )}
    </a>
  );
}

export function Tick({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-[#2C2530] bg-[#0F0C12] p-3.5 text-[14px] leading-snug text-[#DCD7E0]">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span
        className={`mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border-2 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-white/70 ${
          checked ? 'border-[#D0463C] bg-[#D0463C] text-white' : 'border-[#5A5260]'
        }`}
        aria-hidden
      >
        {checked && <Check className="vx-tick h-4 w-4" strokeWidth={3} />}
      </span>
      <span>{children}</span>
    </label>
  );
}

export function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <span id={id} role="alert" className="text-[13px] font-medium text-[#FF9C93]">
      {children}
    </span>
  );
}
