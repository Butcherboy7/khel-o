# Frontend Architecture — KHEL-O

## Overview

The KHEL-O frontend application is a modern, responsive single-page/SSR web application built with **React**, **Next.js 14+ (App Router)**, **TypeScript**, and **Tailwind CSS**.

---

## 1. Directory Tree

```
khel_o_frontend/
├── src/
│   ├── app/                      # Next.js App Router structure
│   │   ├── (auth)/               # Shared auth layout group
│   │   │   ├── login/
│   │   │   └── register/
│   │   ├── (gamer)/              # Gamer role route group
│   │   │   ├── page.tsx          # Gamer home (Discovery)
│   │   │   ├── cafes/[id]/       # Café details & profile
│   │   │   ├── bookings/         # Booking history
│   │   │   └── checkout/         # Payment checkout
│   │   ├── (owner)/              # Owner role route group
│   │   │   └── owner/
│   │   │       ├── dashboard/    # Analytics & today's bookings
│   │   │       ├── tiers/        # Hardware tier manager
│   │   │       └── promotions/   # Promotion manager
│   │   └── (admin)/              # Admin route group
│   │       └── admin/
│   │           └── verifications/
│   ├── components/               # UI components
│   │   ├── ui/                   # Core atomic design primitives (Buttons, Inputs, Cards)
│   │   ├── gamer/                # Gamer specific components (CafeCard, TierSelector)
│   │   ├── owner/                # Owner specific components (BookingTable, PromoForm)
│   │   └── shared/               # Shared components (Navbar, Header, Footer)
│   ├── lib/                      # Core libraries
│   │   ├── api_client.ts         # Axios/Fetch API client with auth interceptors
│   │   └── constants.ts
│   ├── store/                    # State management (Zustand)
│   │   ├── use_auth_store.ts
│   │   └── use_booking_store.ts
│   └── types/                    # TypeScript definitions
│       ├── api.ts
│       └── domain.ts
├── public/                       # Static assets & icons
├── tailwind.config.js
├── tsconfig.json
└── package.json
```

---

## 2. Key Architecture Pillars

- **State Management:** Zustand for client-side state (Auth state, active search filters), React Query / TanStack Query for server-state caching and async data fetching.
- **API Client Layer:** Axios instance with request/response interceptors to automatically attach Bearer JWT tokens and handle token refresh on `401 Unauthorized`.
- **Authentication Flow:** OTP input screens with client-side countdown timers, JWT storage in secure `httpOnly` cookies or memory store.
- **Design System:** Dark-mode friendly, vibrant gamer aesthetic using Vanilla CSS/TailwindCSS utility combinations and responsive layouts.
