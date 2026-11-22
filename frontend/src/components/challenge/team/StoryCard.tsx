'use client';

import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { fightFont } from '@/components/challenge/ChallengeHero';
import type { TeamChallengeConfig } from '@/challenges/types';

/** A 1080×1920 Instagram story picture, drawn in the browser from the café
 *  photo: "I'm playing…", the team name, the day and the link. Shared with
 *  the phone's share sheet where it can take files, else downloaded. */
export function StoryCardButton({ cfg, teamName, onShared }: { cfg: TeamChallengeConfig; teamName: string | null; onShared?: () => void }) {
  const [busy, setBusy] = useState(false);

  const make = async () => {
    setBusy(true);
    try {
      const blob = await draw(cfg, teamName);
      const file = new File([blob], 'khelo-valorant-3v3.png', { type: 'image/png' });
      const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
      if (nav.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: `${cfg.storyLine} · @${cfg.links.kheloInstagramHandle}` }).catch(() => undefined);
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = file.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      }
      onShared?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={make}
      disabled={busy}
      className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#833AB4] via-[#E1306C] to-[#F77737] px-4 text-[16px] font-bold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 disabled:opacity-60"
    >
      {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Download className="h-5 w-5" aria-hidden />}
      Get your story picture
    </button>
  );
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function draw(cfg: TeamChallengeConfig, teamName: string | null): Promise<Blob> {
  const W = 1080;
  const H = 1920;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const display = fightFont.style.fontFamily;
  await document.fonts?.ready;

  g.fillStyle = '#0A0809';
  g.fillRect(0, 0, W, H);
  const photo = await loadImage(cfg.media.photos[0].srcSmall);
  if (photo) {
    // Cover-fit the hall photo into the top two thirds.
    const h = H * 0.72;
    const s = Math.max(W / photo.width, h / photo.height);
    const w = photo.width * s;
    g.drawImage(photo, (W - w) / 2, 0, w, photo.height * s);
  }
  let grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, 'rgba(10,8,9,0.55)');
  grad.addColorStop(0.45, 'rgba(10,8,9,0.35)');
  grad.addColorStop(0.72, 'rgba(10,8,9,1)');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  grad = g.createRadialGradient(200, H * 0.75, 50, 200, H * 0.75, 900);
  grad.addColorStop(0, 'rgba(208,70,60,0.35)');
  grad.addColorStop(1, 'rgba(208,70,60,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);

  // KHEL-O mark + live pill
  g.fillStyle = '#F4F1EC';
  g.font = `700 54px system-ui, sans-serif`;
  g.fillText('KHEL-O', 80, 150);
  g.fillStyle = 'rgba(0,0,0,0.55)';
  roundRect(g, W - 80 - 330, 100, 330, 72, 36);
  g.fill();
  g.fillStyle = '#FF4A4A';
  g.beginPath();
  g.arc(W - 80 - 290, 136, 11, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#F4F1EC';
  g.font = `700 30px system-ui, sans-serif`;
  g.fillText(`LIVE AT ${cfg.venue.shortName.toUpperCase()}`, W - 80 - 260, 147);

  // The line, the title, the team
  const y0 = 1060;
  g.fillStyle = '#F2C94C';
  g.font = `600 44px system-ui, sans-serif`;
  wrap(g, cfg.storyLine, 80, y0, W - 160, 56);
  g.fillStyle = '#F4F1EC';
  g.font = `700 250px ${display}`;
  g.fillText(cfg.titleTop.toUpperCase(), 70, y0 + 290);
  g.fillStyle = '#E8675D';
  g.font = `600 136px ${display}`;
  g.fillText(cfg.titleBottom.toUpperCase(), 76, y0 + 420);

  if (teamName) {
    g.fillStyle = '#D0463C';
    chamfer(g, 80, y0 + 480, W - 160, 150, 22);
    g.fill();
    g.fillStyle = '#FFFFFF';
    g.font = `600 34px system-ui, sans-serif`;
    g.fillText('TEAM', 120, y0 + 535);
    g.font = `700 84px ${display}`;
    g.fillText(teamName.toUpperCase(), 118, y0 + 610);
  }

  g.fillStyle = '#F4F1EC';
  g.font = `700 46px system-ui, sans-serif`;
  g.fillText(`Sat 5 Dec · ${cfg.venue.shortName}, Gachibowli`, 80, H - 190);
  g.fillStyle = '#B4B0B8';
  g.font = `500 38px system-ui, sans-serif`;
  g.fillText(`khel-o.com/challenge/${cfg.slug}`, 80, H - 125);

  return new Promise((resolve) => c.toBlob((b) => resolve(b!), 'image/png'));
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function chamfer(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, k: number) {
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x + w - k, y);
  g.lineTo(x + w, y + k);
  g.lineTo(x + w, y + h);
  g.lineTo(x + k, y + h);
  g.lineTo(x, y + h - k);
  g.closePath();
}

function wrap(g: CanvasRenderingContext2D, text: string, x: number, y: number, max: number, lh: number) {
  const words = text.split(' ');
  let line = '';
  let yy = y;
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (g.measureText(next).width > max && line) {
      g.fillText(line, x, yy);
      line = w;
      yy += lh;
    } else line = next;
  }
  g.fillText(line, x, yy);
}
