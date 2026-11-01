'use client';

import { useEffect, useRef, useState } from 'react';

const COLOURS = ['#F2C27A', '#FFE29A', '#C9CBD3', '#D79A6B', '#E8675D', '#FFFFFF'];

/** A short confetti burst for the winners: two cannons from the bottom
 *  corners and a shower from above, about 4.5 seconds, then gone. Plays once per `id` per browser tab
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
    const count = big ? 300 : 160;
    type Piece = {
      x: number; y: number; vx: number; vy: number; r: number; spin: number;
      size: number; colour: string; round: boolean; rain: boolean; sway: number;
    };
    const pieces: Piece[] = [];
    for (let i = 0; i < count; i++) {
      const rain = i % 10 < 7;
      const left = i % 2 === 0;
      // 30% fired up and inwards from the bottom corners, 70% raining from above.
      const angle = (Math.PI / 180) * (15 + Math.random() * 30);
      const speed = h * (0.022 + Math.random() * 0.012);
      pieces.push(rain
        ? {
            x: Math.random() * w, y: -20 - Math.random() * h * 0.9,
            vx: (Math.random() - 0.5) * 1.2, vy: (h / 170) * (0.75 + Math.random() * 0.6),
            r: Math.random() * Math.PI, spin: (Math.random() - 0.5) * 0.25,
            size: (5 + Math.random() * 6) * scale, colour: COLOURS[i % COLOURS.length],
            round: Math.random() < 0.25, rain, sway: Math.random() * Math.PI * 2,
          }
        : {
            x: left ? -10 : w + 10, y: h + 10,
            vx: Math.sin(angle) * speed * (left ? 1 : -1), vy: -Math.cos(angle) * speed,
            r: Math.random() * Math.PI, spin: (Math.random() - 0.5) * 0.3,
            size: (5 + Math.random() * 6) * scale, colour: COLOURS[i % COLOURS.length],
            round: Math.random() < 0.3, rain, sway: 0,
          });
    }

    const start = performance.now();
    let last = start;
    let frame = 0;
    const gravity = h / 2400;
    const tick = (t: number) => {
      const age = t - start;
      // Moves by time, not by frame, so 60 Hz and 120 Hz phones look the same.
      const dt = Math.min(3, (t - last) / 16.67);
      last = t;
      ctx.clearRect(0, 0, w, h);
      ctx.globalAlpha = age > 3800 ? Math.max(0, 1 - (age - 3800) / 700) : 1;
      for (const p of pieces) {
        if (p.rain) {
          p.x += (p.vx + Math.sin(age * 0.003 + p.sway) * 1.1) * dt;
          p.y += p.vy * dt;
        } else {
          p.vy += gravity * dt;
          const drag = Math.pow(0.985, dt);
          p.vx *= drag;
          p.vy *= drag;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
        }
        p.r += p.spin * dt;
        if (p.y < -30 || p.y > h + 30) continue;
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
      if (age < 4500) frame = requestAnimationFrame(tick);
      else setOn(false);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [on, big]);

  if (!on) return null;
  return <canvas ref={ref} aria-hidden="true" className="pointer-events-none fixed inset-0 z-[300] h-full w-full" />;
}
