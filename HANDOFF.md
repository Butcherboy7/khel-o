# KHEL-O Project Handoff & Architecture Decision Records (ADRs)

## Overview
KHEL-O is a mobile-first PWA and desktop-responsive gaming café marketplace in India built with Next.js 14, Tailwind CSS, FastAPI, PostgreSQL, and Docker.

- **Design System**: Official Google Stitch "Elevated Precision" (`#10B981` Vibrant Emerald badge & CTA, `#006c49` Primary Emerald, `#1F2937` Dark Slate, `#FC7C78` Coral, `#F8F9FB` Neutral surface, Space Grotesk headline scale, Plus Jakarta Sans body scale, JetBrains Mono label caps & specs).

---

## ADR 005: Frontend UI Refactoring Strategy & Route Group Isolation

- **Context**: The initial frontend prototyped unoptimized static components lacking route group isolation and native performance optimizations.
- **Decision**: Executed a "Burn and Rebuild" of the UI layer, restructuring `src/app/` into 3 strict Next.js Route Groups (`app/(customer)`, `app/(owner)`, `app/(admin)`) with dedicated layouts and OpenAPI data bindings.
- **Consequences**: Zero changes to the backend or database schemas. Enforces the strict 8px design system, sub-200ms SRS performance target, and strict OpenAPI payload compliance.

---

## Implemented Architecture (Frontend Overhaul)

### Phase 1: Route Group Isolation
- `app/(customer)`: Customer discovery feed, Intent Selector, Filter Chips, slot selector, Razorpay payment, player bookings & QR pass, rewards, gamer profile. Dedicated `(customer)/layout.tsx` rendering `DesktopNavbar` + `BottomNav`.
- `app/(owner)`: Dedicated B2B Owner Hub (`/owner/dashboard`, `/owner/onboarding`, `/owner/promotions`). Dedicated `(owner)/layout.tsx` rendering dark slate `OwnerNavbar`. Local JWT role guard treating `cafe_owner` / `owner` as a superset.
- `app/(admin)`: Admin verification portal (`/admin/cafes`). Dedicated `(admin)/layout.tsx` for platform governance.

### Phase 2: Component Eradication & Systematization
- Stripped raw static HTML/CSS exports.
- Implemented `IntentSelector` (`🎮 PC Gaming`, `🎯 Competitive`, `🕹️ PS5`, `👥 Squad`, `🔥 Flash Deals`) and `FilterChips` using performant native Tailwind CSS transitions.
- Replaced legacy image tags with optimized image rendering.

### Phase 3: OpenAPI Data Binding
- Bound UI filter chips strictly to the `name` field of `HardwareTier` objects returned by backend OpenAPI contracts.
- Bound booking checkout flow to exact `BookingCreate` camelCase OpenAPI payload (`cafeId`, `hardwareTierId`, `bookingDate`, `startTime`, `durationHours`).

---

## Running the Application
Run the entire platform with Docker Compose:
```bash
docker compose up --build -d
```

- **Customer Web App**: `http://localhost:3002`
- **Café Owner Portal**: `http://localhost:3002/owner/dashboard`
- **Admin Verification Panel**: `http://localhost:3002/admin/cafes`
- **FastAPI Backend & Swagger**: `http://localhost:8000/docs`
- **PostgreSQL Database**: `localhost:5434`
- **pgAdmin**: `http://localhost:5050`

---

## Phase 4: Customer Screens
- Built real API-connected Explore screen at `frontend/src/app/(customer)/page.tsx`.
- Integrated `listCafes` API endpoint supporting debounced query searches and city filter chips.
- Created reusable components: `frontend/src/components/customer/CafeCard.tsx` and `frontend/src/components/customer/CafeCardSkeleton.tsx`.
- Built real API-connected Café Detail screen at `frontend/src/app/(customer)/cafes/[id]/page.tsx` with photo carousel, verified badge, operating hours, hardware tier specs selector, amenities, and sticky booking action sheet.
- Built 3-step Booking Wizard at `frontend/src/app/(customer)/bookings/new/page.tsx`: Step 1 date picker (14 days, snap scroll), Step 2 time slots (30-min intervals, 4-col grid, disabled past slots) + duration chips, Step 3 review + price breakdown + notes + confirm.
- Built real API-connected Bookings List page at `frontend/src/app/(customer)/bookings/page.tsx`: sticky 50/50 tab bar (Upcoming/Past), client-side status & date filtering, status pills (Confirmed, Pending, Cancelled, Completed, No Show), date/time/duration/price details, View Pass CTA for confirmed bookings, skeletons, empty states with CTA.
- Built real API-connected Owner Bookings page at `frontend/src/app/(owner)/owner/bookings/page.tsx` with ref/notes search filtering, Today/Upcoming/All tabs, live upcoming badge, status indicators, and Mark Complete & No Show quick buttons.
- Built real API-connected Owner Promotions page at `frontend/src/app/(owner)/owner/promotions/page.tsx` with 1-50% discount slider configuration, date pickers, day toggles, start/end hours select, unlimited/max usage capping, active state toggle switches, inline delete confirmations, and bottom sheet overlay modals.
- Built real API-connected Admin Verification Panel at `frontend/src/app/(admin)/admin/page.tsx` with stats indicators, User/Mail/Phone owner info, map location details, submitted timestamp dates, inline rejection reasons, suspension confirmations, re-evaluation options, and admin role layouts.
- Built real API-connected Hardware Tiers page at `frontend/src/app/(owner)/owner/tiers/page.tsx`: two-panel layout featuring a main list view showing existing tiers, spec badge chips, inline ToggleSwitch for quick status changes, and a bottom sheet form modal overlay to seamlessly manage create/edit states.
- Built real API-connected Profile page at `frontend/src/app/(customer)/profile/page.tsx`: profile header card with 80x80px avatar & initial fallback, name, email, role badge, phone row, and member-since date; quick actions grid (Rewards, History, Help & Support); "Become a Café Partner" B2B CTA card (conditionally rendered for `gamer` role only); settings list (Notifications, Privacy, Terms, Logout); and interactive logout confirmation modal.
- All booking business rules enforced client-side (30-min advance window, session date validation).
- Client-side price preview: base × duration → discount (promo) → 2% gateway fee → total.
- Error handling: INVALID_START_TIME, TIER_FULLY_BOOKED auto-navigate to Step 2; PROMOTION_EXHAUSTED stays on Step 3.
- Added `listCafeTiers`, `createTier`, `updateTier`, `TierFormData`, `getMe`, `listGamerBookings`, `ListBookingsParams`, `ListBookingsResponse`, `CreateBookingRequest`, `BookingResponse`, `createBooking`, `updateBookingStatus`, `listPromotions`, `createPromotion`, `updatePromotion`, `deletePromotion`, `PromotionFormData`, `getPendingCafes`, `verifyCafe` to `frontend/src/lib/api.ts`.
- Created `frontend/src/lib/format.ts` with `formatDateLong`, `formatTime12h`, `getDurationLabel`, `addHoursToTime`, `generateTimeSlots`, `isSlotDisabled`, `getTodayString`, `getCurrentTimeString`.
- Added `CafeDetail`, `Promotion`, `Review`, `CafeListItem`, `PaginatedResponse`, `BookingDetail`, `TierSpecs`, `PromotionDetail`, and `AdminCafe` types in `frontend/src/types/index.ts`.

---

## ADR 006: Launch-Ready V2 Core Expansion

- **Context**: Transitioning the platform to be fully launch-ready required resolving backend race conditions, defining standards for hardware tier presets and rating metrics, implementing zero-commission payouts, and adding a low-friction trust-but-verify onboarding flow.
- **Decision**: 
  - **Monetization**: Implemented a flat ₹10 Platform Fee (convenience fee) for gamers and 2% cancellation fee charging logic for café owners.
  - **Database & Services**: Added SQL-level row locks (`SELECT FOR UPDATE`) on the hardware tier booking process to avoid overbooking. Set up unverified venue limits (capped at 15 bookings or ₹5,000 total transaction volume).
  - **Payouts & KYC**: Automated Splits via Razorpay Route. Built bank setup screens and webhooks integration mapping.
  - **QR Check-in**: Integrated mobile-friendly QR scanning mechanics in the Owner Hub.
- **Consequences**: Successfully compiled, built, and statically optimized all 16 Next.js pages with TypeScript validity. Backend starting cleanly and database migrations applying seamlessly.

---

## ADR 007: Role-Based Routing & Hydration Guard Consistency

- **Context**: The `(customer)/layout.tsx` used `isLoading` as its hydration guard while `(owner)/layout.tsx` and `(admin)/layout.tsx` used the more robust `isHydrated` flag from `authStore`. This inconsistency could cause premature redirects to `/login` on page refresh before the store settled.
- **Decision**: Updated `(customer)/layout.tsx` to read `isHydrated` from `authStore` and guard redirects with `isHydrated && !isLoading && !isAuthenticated` — consistent with the owner/admin pattern.
- **Role Routing** (already implemented, verified): Login page correctly routes `cafe_owner → /owner/dashboard`, `admin → /admin`, `gamer → /`. Owner layout blocks non-owner roles. Admin layout blocks non-admin roles.
- **Test Accounts**: `test@example.com` (gamer), `owner@khel-o.test` (cafe_owner), `admin@khel-o.test` (admin) — all share password `testpass123`.
- **Consequences**: All 3 layout groups now use the same `isHydrated`-first hydration guard. Build passes with 0 TypeScript errors. 17 static pages generated.

---

## ADR 008: Deterministic Store Hydration & Deprecation Warning Fix

- **Context**: Hydration error `Hydration failed because the initial UI does not match what was rendered on the server` occurred because `authStore` evaluated `typeof window !== 'undefined'` in `getInitialState()`, causing `isHydrated` to be `true` on client initial render while server initial render was `false`. Additionally, browser logged a deprecation warning for `apple-mobile-web-app-capable`.
- **Decision**:
  - Normalized `getInitialState()` in `authStore.ts` to return deterministic initial state (`isHydrated: false`, `isLoading: true`) on both server and client during initial render.
  - Enhanced `initializeFromStorage()` in `authStore.ts` to load cached user and token on mount before fetching `/me`.
  - Added `mobile-web-app-capable: 'yes'` in `other` metadata of `src/app/layout.tsx`.
  - Replaced residual `any` types in `src/lib/api.ts` with `Record<string, unknown>`.
- **Consequences**: 0 hydration errors. 0 TypeScript errors. Next.js build passes generating 18 static pages.
