import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// The type scale in tailwind.config.ts (text-caption, text-body-emphasis…)
// has to be registered as font sizes: unregistered, tailwind-merge reads
// them as text *colours* and drops a sibling `text-white` — which is how
// every size="lg"/"sm" primary Button ended up with dark labels.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        { text: ['display', 'h1', 'h2', 'h3', 'h4', 'body', 'body-emphasis', 'caption', 'overline', 'price-lg', 'price-sm', 'ref', 'badge', 'btn'] },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
