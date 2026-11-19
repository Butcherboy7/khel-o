'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Gamepad2, MapPinOff, Store, X } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon';
import { SuggestCafeForm } from '@/components/gta6/SuggestCafeForm';
import { HELP_WHATSAPP } from '@/components/support/WhatsAppHelp';
import { COMMUNITY_URL } from '@/lib/challenge';
import { trackAction } from '@/lib/api/analyticsEvents';
import { useLocationStore } from '@/store/locationStore';

/** The message is typed for them; they only add their area and tap Send. Nothing is stored by us. */
function askLink(city: string | null): string {
  const where = city ? `in ${city}` : 'in my city';
  const text = `Hi KHEL-O! There's no GTA 6 café ${where} yet. Can you onboard one near me? My area: `;
  return `https://wa.me/${HELP_WHATSAPP}?text=${encodeURIComponent(text)}`;
}

interface CityAskProps {
  /** The page's own place when it is a city page (e.g. "Delhi NCR"); null on near-me and the home screen. */
  place: string | null;
  /** True when that place has a GTA 6 café live. */
  placeIsLive: boolean;
  /** Cities with a GTA 6 café live, e.g. ["Hyderabad"]. */
  liveCities: string[];
  /** Where this was shown, for the numbers ("gta6-delhi", "home"). */
  source: string;
}

/**
 * "Your city not listed?" under the GTA 6 cafés. Opens a sheet with two big
 * ways in: message us on WhatsApp (a warm lead the founder answers himself),
 * or join the gamer community. Visitors from a city with no café also get a
 * slim bar above the bottom menu while the card is off screen.
 */
export function CityAsk({ place, placeIsLive, liveCities, source }: CityAskProps) {
  const [open, setOpen] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [cardVisible, setCardVisible] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const [savedCity, setSavedCity] = useState<string | null>(null);
  const cardRef = useRef<HTMLButtonElement>(null);
  const selectedCity = useLocationStore((s) => s.selectedCity);

  // The saved city only exists in the browser; read it after mount so the server HTML stays stable.
  useEffect(() => {
    setSavedCity(selectedCity && selectedCity !== 'All Cities' ? selectedCity : null);
  }, [selectedCity]);

  useEffect(() => {
    const el = cardRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setCardVisible(e.isIntersecting), { rootMargin: '0px 0px -40px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const live = new Set(liveCities.map((c) => c.toLowerCase()));
  // The city we talk about: the page's own, else the one they picked in the app.
  const city = place && place !== 'India' ? place : savedCity;
  const cityMissing = place ? !placeIsLive && place !== 'India' : !!savedCity && !live.has(savedCity.toLowerCase());
  const showBar = cityMissing && !cardVisible && !open && !dismissed;

  const title = cityMissing && city ? `No GTA 6 café in ${city} yet?` : 'Your city not listed?';

  const openSheet = (from: 'card' | 'bar') => {
    setSuggesting(false);
    setOpen(true);
    trackAction('gta6_city_ask_open', { from, source, city: city ?? null });
  };

  return (
    <>
      <button
        ref={cardRef}
        type="button"
        onClick={() => openSheet('card')}
        className="group flex w-full items-center gap-3 rounded-2xl border-[1.5px] border-dashed border-primary/70 bg-card p-3.5 text-left transition-colors hover:border-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      >
        <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <MapPinOff className="h-5 w-5" />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="text-body font-bold text-text-primary">{title}</span>
          <span className="text-caption text-text-secondary">Message us. We&apos;ll find a café near you and bring GTA 6 there.</span>
        </span>
        <ArrowRight aria-hidden="true" className="ml-auto h-5 w-5 shrink-0 text-primary transition-transform group-hover:translate-x-0.5" />
      </button>

      {showBar && (
        <div className="gta6-askbar fixed inset-x-0 z-sticky px-3 bottom-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom,0px)+10px)] md:bottom-6">
          <div className="mx-auto flex max-w-content items-center gap-2 rounded-2xl bg-secondary py-2 pl-4 pr-2 text-white shadow-overlay">
            <button type="button" onClick={() => openSheet('bar')} className="flex min-h-[44px] min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none">
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-body font-bold">{title}</span>
                <span className="truncate text-caption text-white/75">We&apos;ll bring one. One tap.</span>
              </span>
              <span className="btn-depth ml-auto shrink-0 rounded-xl bg-primary px-3.5 py-2 text-caption font-bold text-white">Ask us</span>
            </button>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              aria-label="Hide this bar"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-white/70 hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <BottomSheet
        isOpen={open}
        onClose={() => setOpen(false)}
        title={cityMissing && city ? `No GTA 6 café in ${city} yet?` : 'No GTA 6 café in your city?'}
        description="Tell us and we'll find a café near you and get it on KHEL-O."
      >
        {suggesting ? (
          <div className="flex flex-col gap-3 pb-2">
            <button type="button" onClick={() => setSuggesting(false)} className="w-fit text-caption font-semibold text-text-secondary underline underline-offset-2">
              Back
            </button>
            <SuggestCafeForm place={city ?? undefined} source={`${source}-sheet`} />
          </div>
        ) : (
          <div className="flex flex-col gap-3 pb-2">
            <a
              href={askLink(city)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackAction('gta6_city_ask_whatsapp', { source, city: city ?? null })}
              className="btn-depth flex items-center gap-3 rounded-2xl bg-[#1FA855] p-4 text-white [--edge:#14803F]"
            >
              <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/20">
                <WhatsAppIcon className="h-6 w-6" />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-h3 font-bold">{city && cityMissing ? `Bring GTA 6 to ${city}` : 'Bring GTA 6 to my city'}</span>
                <span className="text-caption text-white/85">Opens WhatsApp with the message ready. Add your area and send.</span>
              </span>
            </a>

            <a
              href={COMMUNITY_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackAction('gta6_city_ask_community', { source, city: city ?? null })}
              className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-text-primary"
            >
              <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <Gamepad2 className="h-6 w-6" />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-h3 font-bold text-text-primary">Join the gamer community</span>
                <span className="text-caption text-text-secondary">We play Valorant, GTA 6 and more. Find gamers like you.</span>
              </span>
            </a>

            <button
              type="button"
              onClick={() => setSuggesting(true)}
              className="mx-auto flex min-h-[44px] items-center gap-1.5 text-body font-semibold text-text-secondary underline-offset-2 hover:text-text-primary hover:underline"
            >
              <Store aria-hidden="true" className="h-4 w-4" />
              Know a café? Suggest it
            </button>
          </div>
        )}
      </BottomSheet>
    </>
  );
}
