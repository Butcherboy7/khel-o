# Frontend Architecture — KHEL-O PWA

## Overview

KHEL-O is built as a **Mobile-First Progressive Web App (PWA)** using **Next.js 14 (App Router)**, **TypeScript**, **Tailwind CSS**, and `next-pwa`.

---

## 1. PWA & Mobile-First Strategy

- **Mobile First Design:** All layouts are designed for a 375px base width (common mobile viewport size in India).
- **Android Support:** Full web app installability on Android home screens via `manifest.json`.
- **Web Push Notifications:** Service Workers (`public/sw.js`) handle background Web Push events via FCM.
- **Fast & Responsive:** Zero heavy native dependencies. Instant loading over 4G networks.

---

## 2. Gamified Promotions UI

Promotions feature excitement styling:
- **Countdown Timers:** Live ticking timers showing time remaining ("🔥 Flash Deal — Ends in 02h 14m 10s").
- **Limited Slot Badges:** Urgency indicators ("⚡ Only 3 seats left at this price!").
- **Gamified Badges:** Eye-catching tags like `🎮 Off-Peak Power Hour` and `🔥 Fill the Café Special`.
