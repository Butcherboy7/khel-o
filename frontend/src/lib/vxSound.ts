'use client';

/**
 * Small game-style sound effects for the Valorant challenge pages. Made with the browser's
 * WebAudio (no sound files to download), quiet by default, off in one tap, and the choice is
 * remembered. Browsers only allow sound after a tap, so nothing plays before the first one.
 */
export type Sfx = 'tap' | 'select' | 'next' | 'success' | 'error' | 'slash' | 'primary' | 'join' | 'share' | 'back' | 'reveal';

const KEY = 'khelo_vx_sound';
const EVENT = 'khelo:vx-sound';
let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;
let bus: AudioNode | null = null;
let lastAt = 0;

/** Every sound goes through one gentle compressor, so stacked sounds never clip or jump in loudness. */
function out(c: AudioContext): AudioNode {
  if (!bus) {
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.ratio.value = 4;
    const g = c.createGain();
    g.gain.value = 0.9;
    comp.connect(g).connect(c.destination);
    bus = comp;
  }
  return bus;
}

export function soundOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setSound(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    /* private mode: it just won't be remembered */
  }
  window.dispatchEvent(new Event(EVENT));
  if (on) sfx('select');
}

export function onSoundChange(fn: () => void): () => void {
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/**
 * Wakes the audio engine without making a sound. Some phones (iPhone Safari) only allow it inside a
 * finished tap (touchend / click), so the page calls this on those too. Never throws, never plays.
 */
export function unlockAudio(): void {
  if (!soundOn()) return;
  try {
    const c = audio();
    if (!c) return;
    // A one-sample silent buffer is the usual way to finish the unlock.
    const b = c.createBuffer(1, 1, 22050);
    const s = c.createBufferSource();
    s.buffer = b;
    s.connect(c.destination);
    s.start(0);
  } catch {
    /* audio is optional: the tap still works */
  }
}

function tone(c: AudioContext, type: OscillatorType, from: number, to: number, at: number, dur: number, vol: number) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(from, at);
  o.frequency.exponentialRampToValueAtTime(Math.max(to, 1), at + dur);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(out(c));
  o.start(at);
  o.stop(at + dur + 0.02);
}

function whoosh(c: AudioContext, at: number, dur: number, vol: number) {
  if (!noise) {
    noise = c.createBuffer(1, c.sampleRate * 0.6, c.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = c.createBufferSource();
  s.buffer = noise;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 1.2;
  f.frequency.setValueAtTime(500, at);
  f.frequency.exponentialRampToValueAtTime(4200, at + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + dur * 0.4);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  s.connect(f).connect(g).connect(out(c));
  s.start(at);
  s.stop(at + dur + 0.02);
}

export function sfx(kind: Sfx): void {
  if (!soundOn()) return;
  // Two taps inside 40 ms are one gesture: play one sound, not a smear.
  const now = typeof performance !== 'undefined' ? performance.now() : 0;
  if (now - lastAt < 40) return;
  lastAt = now;
  const c = audio();
  if (!c) return;
  const t = c.currentTime + 0.005;
  switch (kind) {
    // The main button (sign up): a low thump with a short bright confirm on top.
    case 'primary':
      tone(c, 'sine', 140, 55, t, 0.18, 0.13);
      tone(c, 'triangle', 880, 1320, t + 0.03, 0.09, 0.05);
      tone(c, 'triangle', 1320, 1760, t + 0.1, 0.12, 0.045);
      whoosh(c, t, 0.14, 0.02);
      break;
    // Join the community: two soft rising pops, friendly, not a fanfare.
    case 'join':
      tone(c, 'sine', 520, 700, t, 0.09, 0.07);
      tone(c, 'sine', 780, 1040, t + 0.09, 0.12, 0.07);
      break;
    // Share: an airy sweep that opens up.
    case 'share':
      whoosh(c, t, 0.22, 0.04);
      tone(c, 'triangle', 700, 1500, t + 0.02, 0.16, 0.04);
      break;
    // Back / close: the tap, pitched down.
    case 'back':
      tone(c, 'triangle', 760, 460, t, 0.08, 0.05);
      break;
    // The sticky sign-up bar sliding in.
    case 'reveal':
      tone(c, 'sine', 300, 520, t, 0.12, 0.04);
      whoosh(c, t, 0.14, 0.015);
      break;
    case 'tap':
      tone(c, 'triangle', 1300, 850, t, 0.06, 0.05);
      break;
    case 'select':
      tone(c, 'triangle', 900, 1250, t, 0.07, 0.05);
      tone(c, 'triangle', 1250, 1700, t + 0.07, 0.08, 0.05);
      break;
    case 'next':
      tone(c, 'sine', 170, 62, t, 0.16, 0.12);
      whoosh(c, t, 0.16, 0.025);
      break;
    case 'success':
      [659, 831, 988, 1319].forEach((f, i) => tone(c, 'triangle', f, f * 1.01, t + i * 0.085, 0.3, 0.06));
      tone(c, 'sine', 110, 55, t, 0.3, 0.1);
      break;
    case 'error':
      tone(c, 'sawtooth', 220, 110, t, 0.2, 0.04);
      break;
    case 'slash':
      whoosh(c, t, 0.42, 0.06);
      tone(c, 'sine', 120, 45, t + 0.3, 0.22, 0.12);
      break;
  }
}
