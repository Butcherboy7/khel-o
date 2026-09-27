'use client';

import { useEffect, useState } from 'react';
import { Gamepad2 } from 'lucide-react';

const CODE = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];

/**
 * Easter egg: the Konami code on the explore page. Floats a small bubble,
 * takes no layout space, and disappears by itself.
 */
export function KonamiEgg() {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    let pos = 0;
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      pos = key === CODE[pos] ? pos + 1 : key === CODE[0] ? 1 : 0;
      if (pos === CODE.length) {
        pos = 0;
        setShown(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(() => setShown(false), 4500);
    return () => clearTimeout(t);
  }, [shown]);

  if (!shown) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-24 z-50 mx-auto flex w-fit max-w-[calc(100%-32px)] items-center gap-2 rounded-full bg-secondary px-4 py-2 text-caption font-semibold text-white shadow-float animate-in fade-in slide-in-from-bottom-2 duration-300"
    >
      <Gamepad2 className="h-4 w-4 text-primary" aria-hidden />
      Cheat code accepted: +30 lives. Spend them at a café near you.
    </div>
  );
}
