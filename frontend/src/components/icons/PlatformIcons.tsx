// Brand marks for console platform badges (customer tier selection).
// Path data from Simple Icons (CC0 dedication) — https://simpleicons.org
import type { SVGProps } from 'react';
import { Monitor, Gamepad2, MoreHorizontal } from 'lucide-react';
import type { Platform } from '@/constants/platforms';

export function PlayStationIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg role="img" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" {...props}>
      <title>PlayStation</title>
      <path d="M8.984 2.596v17.547l3.915 1.261V6.688c0-.69.304-1.151.794-.991.636.18.76.814.76 1.505v5.875c2.441 1.193 4.362-.002 4.362-3.152 0-3.237-1.126-4.675-4.438-5.827-1.307-.448-3.728-1.186-5.39-1.502zm4.656 16.241l6.296-2.275c.715-.258.826-.625.246-.818-.586-.192-1.637-.139-2.357.123l-4.205 1.5V14.98l.24-.085s1.201-.42 2.913-.615c1.696-.18 3.785.03 5.437.661 1.848.601 2.04 1.472 1.576 2.072-.465.6-1.622 1.036-1.622 1.036l-8.544 3.107V18.86zM1.807 18.6c-1.9-.545-2.214-1.668-1.352-2.32.801-.586 2.16-1.052 2.16-1.052l5.615-2.013v2.313L4.205 17c-.705.271-.825.632-.239.826.586.195 1.637.15 2.343-.12L8.247 17v2.074c-.12.03-.256.044-.39.073-1.939.331-3.996.196-6.038-.479z" />
    </svg>
  );
}

export function XboxIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg role="img" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" {...props}>
      <title>Xbox</title>
      <path d="M4.102 21.033C6.211 22.881 8.977 24 12 24c3.026 0 5.789-1.119 7.902-2.967 1.877-1.912-4.316-8.709-7.902-11.417-3.582 2.708-9.779 9.505-7.898 11.417zm11.16-14.406c2.5 2.961 7.484 10.313 6.076 12.912C23.002 17.48 24 14.861 24 12.004c0-3.34-1.365-6.362-3.57-8.536 0 0-.027-.022-.082-.042-.063-.022-.152-.045-.281-.045-.592 0-1.985.434-4.805 3.246zM3.654 3.426c-.057.02-.082.041-.086.042C1.365 5.642 0 8.664 0 12.004c0 2.854.998 5.473 2.661 7.533-1.401-2.605 3.579-9.951 6.08-12.91-2.82-2.813-4.216-3.245-4.806-3.245-.131 0-.223.021-.281.046v-.002zM12 3.551S9.055 1.828 6.755 1.746c-.903-.033-1.454.295-1.521.339C7.379.646 9.659 0 11.984 0H12c2.334 0 4.605.646 6.766 2.085-.068-.046-.615-.372-1.52-.339C14.946 1.828 12 3.545 12 3.545v.006z" />
    </svg>
  );
}

// Not wired to a selectable platform yet — a bookable-type expansion (pool
// tables, cue sports) is still just a plan, see conversation. Kept here,
// ready to drop into PLATFORMS/PlatformIcon, so that work is UI-icon-free
// when it lands instead of starting from scratch.
export function SnookerIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" {...props}>
      <title>Snooker</title>
      <circle cx="12" cy="12" r="10" fill="currentColor" />
      <circle cx="12" cy="12" r="5.5" fill="#ffffff" />
      <text x="12" y="14.7" textAnchor="middle" fontSize="6.5" fontWeight="800" fill="currentColor" fontFamily="Arial, sans-serif">8</text>
      <circle cx="6.7" cy="6.7" r="1.4" fill="#ffffff" fillOpacity="0.4" />
    </svg>
  );
}

/** Single source of truth for "which mark represents this platform" — used
 *  everywhere a platform needs a visual (filter chips, café cards, tier
 *  cards/badges, owner hardware config) so a future icon swap or a new
 *  platform (see SnookerIcon above) only has to change here. */
export function PlatformIcon({
  platform,
  className,
}: {
  platform: Platform | string | null | undefined;
  className?: string;
}) {
  switch (platform) {
    case 'pc':
      return <Monitor className={className} />;
    case 'playstation':
      return <PlayStationIcon className={className} />;
    case 'xbox':
      return <XboxIcon className={className} />;
    case 'nintendo':
      return <Gamepad2 className={className} />;
    default:
      return <MoreHorizontal className={className} />;
  }
}
