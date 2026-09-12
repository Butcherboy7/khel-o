// Marks for café Activities (snooker, arcade, etc.) — a separate axis from
// PlatformIcons.tsx's PC/console marks (a café's PC tiers and its Snooker
// tables both exist independently), so this is its own small icon set +
// helper, not a case added to PlatformIcon.
import type { SVGProps } from 'react';
import { Joystick, Zap, Rocket, CircleDot } from 'lucide-react';
import { SnookerIcon } from '@/components/icons/PlatformIcons';

export function AirHockeyIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg role="img" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <title>Air Hockey</title>
      <rect x="2" y="6" width="20" height="12" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <line x1="12" y1="6" x2="12" y2="18" stroke="currentColor" strokeWidth="1.2" strokeDasharray="1.5 1.5" />
      <circle cx="7" cy="12" r="1.6" fill="currentColor" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </svg>
  );
}

export function FoosballIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg role="img" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <title>Foosball</title>
      <rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <line x1="7" y1="5" x2="7" y2="19" stroke="currentColor" strokeWidth="1.4" />
      <line x1="17" y1="5" x2="17" y2="19" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" />
    </svg>
  );
}

/** Preset chips the owner picks from when adding an activity — deliberately
 *  a frontend-only suggestion list, not a backend enum. `key` is what gets
 *  sent as `activityKind`; "Other" is handled specially by the caller (free
 *  text input) and isn't sent as a literal activityKind value.
 *  `defaultIndividualUnits` is just this chip's starting suggestion for the
 *  Individual/Pooled toggle (Task 5) — table/machine-shaped activities
 *  default to individually-tracked units, an open zone defaults to pooled;
 *  the owner can always flip it before saving either way. */
export const ACTIVITY_PRESETS: { key: string; label: string; icon: React.ComponentType<{ className?: string }>; defaultIndividualUnits: boolean }[] = [
  { key: 'Snooker / Pool', label: 'Snooker / Pool', icon: SnookerIcon, defaultIndividualUnits: true },
  { key: 'Arcade', label: 'Arcade', icon: Joystick, defaultIndividualUnits: false },
  { key: 'Racing Simulator', label: 'Racing Simulator', icon: Rocket, defaultIndividualUnits: true },
  { key: 'VR', label: 'VR', icon: Zap, defaultIndividualUnits: true },
  { key: 'Air Hockey', label: 'Air Hockey', icon: AirHockeyIcon, defaultIndividualUnits: true },
  { key: 'Foosball', label: 'Foosball', icon: FoosballIcon, defaultIndividualUnits: true },
  { key: 'Bowling', label: 'Bowling', icon: CircleDot, defaultIndividualUnits: true },
];

/** Best-effort icon lookup for an arbitrary activityKind string (including
 *  ones an owner typed as custom text and that never matches a preset
 *  exactly) — falls back to a generic joystick mark rather than guessing. */
export function ActivityIcon({
  activityKind,
  className,
}: {
  activityKind: string | null | undefined;
  className?: string;
}) {
  const preset = ACTIVITY_PRESETS.find(
    (p) => p.key.toLowerCase() === (activityKind || '').toLowerCase()
  );
  const Icon = preset?.icon || Joystick;
  return <Icon className={className} />;
}
