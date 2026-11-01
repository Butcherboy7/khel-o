'use client';

import { useEffect, useRef, useState } from 'react';

const COLOURS = ['#F2C27A', '#FFE29A', '#C9CBD3', '#D79A6B', '#E8675D', '#FFFFFF'];

/** A short confetti burst for the winners: two cannons from the bottom
 *  corners, about 4 seconds, then gone. Plays once per `id` per browser tab
 *  (sessionStorage), never for people who turn motion off, and never blocks
 *  a tap. `big` is the projector: more pieces, bigger. */
export function Celebration({ id, big = false }: { id: string; big?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [on, setOn] = useState(false);

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const key = `khelo.celebrated.${id}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch {
      // Storage blocked: still celebrate, it just may play again on reload.
    }
    setOn(true);
  }, [id]);

  useEffect(() => {
    if (!on) return;
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const scale = big ? 1.8 : 1;
    const count = big ? 260 : 140;
    type Piece = { x: number; y: number; vx: number; vy: number; r: number; spin: number; size: number; colour: string; round: boolean };
    const pieces: Piece[] = [];
    for (let i = 0; i < count; i++) {
      const left = i % 2 === 0;
      // Fired up and inwards from each bottom corner, in two waves.
      const angle = (Math.PI / 180) * (20 + Math.random() * 35); // from straight up
      const speed = (h * (0.016 + Math.random() * 0.012)) * (i < count * 0.6 ? 1 : 0.8);
      pieces.push({
        x: left ? -10 : w + 10,
        y: h + 10 + (i < count * 0.6 ? 0 : 120),
        vx: Math.sin(angle) * speed * (left ? 1 : -1),
        vy: -Math.cos(angle) * speed,
        r: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 0.3,
        size: (5 + Math.random() * 6) * scale,
        colour: COLOURS[i % COLOURS.length],
        round: Math.random() < 0.3,
      });
    }

    const start = performance.now();
    let frame = 0;
    const tick = (t: number) => {
      const age = t - start;
      ctx.clearRect(0, 0, w, h);
      const fade = age > 3200 ? Math.max(0, 1 - (age - 3200) / 800) : 1;
      ctx.globalAlpha = fade;
      for (const p of pieces) {
        p.vy += 0.35 * scale;
        p.vx *= 0.99;
        p.vy *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.r += p.spin;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.fillStyle = p.colour;
        if (p.round) {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2.4, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Flat paper turning in the air: width follows the spin.
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size * Math.abs(Math.cos(p.r * 2)) + 1, p.size / 2);
        }
        ctx.restore();
      }
      if (age < 4000) frame = requestAnimationFrame(tick);
      else setOn(false);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [on, big]);

  if (!on) return null;
  return <canvas ref={ref} aria-hidden="true" className="pointer-events-none fixed inset-0 z-[300] h-full w-full" />;
}
