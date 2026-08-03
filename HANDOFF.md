# KHEL-O Project Handoff & Architecture Decision Records (ADRs)

## Overview
KHEL-O is a mobile-first PWA and desktop-responsive gaming café marketplace in India built with Next.js 14, Tailwind CSS, FastAPI, PostgreSQL (SQLite locally), and Docker.

- **Design System**: Official Google Stitch "Elevated Precision" (`#10B981` Vibrant Emerald badge & CTA, `#006c49` Primary Emerald, `#1F2937` Dark Slate, `#FC7C78` Coral, `#F8F9FB` Neutral surface, Space Grotesk headline scale, Plus Jakarta Sans body scale, JetBrains Mono label caps & specs).

---

## ADR 013: Non-Docker Local Testing Environment & SQLite Cross-Compatibility

- **Context**: The user requires running and testing frontend and backend user flows locally on a Windows host machine without Docker or virtualization software, and without automated browser controls.
- **Decision**:
  - **Cross-Database Compatibility**: Updated SQLAlchemy models (`Cafe`, `HardwareTier`, `Promotion`, `OwnerPayoutAccount`) to replace PostgreSQL-specific `JSONB` column types with standard SQLAlchemy `JSON` types. This enables full compatibility with SQLite for zero-setup local dev while maintaining 100% PostgreSQL production compatibility.
  - **Local Python Venv & SQLite Setup**: Set up backend virtual environment at `backend/venv` and configured local environment variables `.env` using SQLite driver `sqlite+aiosqlite:///./khel_o.db`.
  - **Database Seeding**: Initialized database tables and seeded demo users & verified demo gaming cafes (`LXG Esports Arena`, `Respawn Gaming Lounge`) into `khel_o.db`.
  - **Local Frontend Environment**: Configured `frontend/.env.local` pointing `NEXT_PUBLIC_API_URL` to `http://localhost:8000/api/v1`.
- **Consequences**: Backend and Frontend run natively on Windows via standard Uvicorn and Next.js dev servers without requiring Docker.

---

## How to Run & Test Locally Without Docker

### 1. Launch the Backend API Server
Open a terminal in `backend/` and run:
```powershell
cd backend
.\venv\Scripts\uvicorn app.main:app --reload --port 8000
```
- **Backend API Base**: `http://localhost:8000`
- **Swagger Interactive API Documentation**: `http://localhost:8000/docs`
- **Health Check**: `http://localhost:8000/health`

### 2. Launch the Frontend Application
Open a second terminal in `frontend/` and run:
```powershell
cd frontend
npm run dev
```
- **Customer Web App**: `http://localhost:3000`
- **Café Owner Portal**: `http://localhost:3000/owner/dashboard`
- **Admin Panel**: `http://localhost:3000/admin`

---

## Demo Accounts & Test Credentials

| Role | Email | Password | Access / Flow to Test |
|---|---|---|---|
| **Gamer (Customer)** | `test@example.com` | `testpass123` | Explore cafes, select slots, create bookings, view bookings & pass |
| **Café Owner** | `owner@example.com` | `testpass123` | Cafe dashboard, tier management, promotions, owner bookings |
| **Platform Admin** | `admin@example.com` | `testpass123` | Admin verification dashboard & cafe approval portal |
| **Venue Staff** | `staff@example.com` | `testpass123` | Quick QR pass check-in scanning |

---

## Recommended Manual User Flow Testing Matrix

1. **Gamer Flow**:
   - Go to `http://localhost:3000/login` -> Sign in with `test@example.com` / `testpass123`.
   - Explore listed cafes (`LXG Esports Arena`, `Respawn Gaming Lounge`), use intent chips, open cafe details.
   - Pick date, time slot, duration, and confirm booking.
   - View booking details and QR pass in `/bookings`.

2. **Café Owner Flow**:
   - Log out or use incognito tab -> Sign in with `owner@example.com` / `testpass123`.
   - Navigate to `/owner/dashboard`, `/owner/owner/tiers`, `/owner/owner/promotions`, and `/owner/owner/bookings`.
   - Verify hardware tier seat counts, active promos, and incoming gamer bookings.

3. **Admin Flow**:
   - Sign in with `admin@example.com` / `testpass123`.
   - Navigate to `/admin` to verify pending cafe approvals and system statistics.

---

## ADR 013: Satvik Repo Synchronization & Strict Port 3000 Local Workflow

- **Context**: Pulled the latest features from `https://github.com/sathvikreddy27/KHELO-SATVIK` (Google Maps integration, Search suggestions, Notification center, Share modal, Rewards page, Lovable design parity). Needed a clean local workflow with Docker PostgreSQL while guaranteeing Next.js runs strictly on port `3000`.
- **Decision**:
  - **Repo Sync**: Merged `satvik/main` into local `main` branch. Installed updated dependencies including `@react-google-maps/api`.
  - **Port 3000 Enforcement**: Identified and stopped a stale background container (`mrufesto-frontend-1`) occupying port 3000. Configured `"dev": "next dev -p 3000"` in `frontend/package.json` and updated `docker-compose.yml` frontend service mapping to `3000:3000`.
  - **Local Dev Stack**: Running Docker for PostgreSQL container (`khel_o_postgres` on port `5434`), backend FastAPI via local virtual environment (`backend/.venv`), and frontend Next.js directly.
  - **Database Seeding**: Created tables and seeded multi-city cafes (Mumbai, Pune, Bengaluru) and demo accounts (`test@example.com`, `owner@example.com`, `admin@example.com`, `staff@example.com` with `testpass123`).
  - **Type & Export Fixes**: Resolved missing `getTodayString` export and type definitions in `src/lib/format.ts` and `bookings/new/page.tsx`.
- **Consequences**: Next.js production build succeeded with 15 static/dynamic pages compiled cleanly. Frontend strictly runs on `http://localhost:3000` with direct local hot-reloading.

---


---

## ADR 014: Customer Experience Audit & Sprint 1 Verification

- **Context**: The user requested execution of `front end implementation_plan.md` using `ui-ux-pro-max` design recommendations, server health verification, and zero color palette changes while preserving exact layout and typography standards.
- **Decision**:
  - **Server Verification**: Verified FastAPI backend on `http://localhost:8000/health` (status 200) and Next.js frontend dev server running on `http://localhost:3000` (status 200).
  - **Design & Layout Parity**: Confirmed Space Grotesk headline typography, Plus Jakarta Sans body typography, JetBrains Mono technical caps, and off-white/slate theme structure.
  - **Production Build Verification**: Ran `npm run build` cleanly compiling all 15 static/dynamic routes with full type-safety.
- **Consequences**: Customer app frontend sprint implementation plan verified end-to-end with all dev servers active.

---

## ADR 015: Multi-City 30+ Cafes Seeding & Customer Home Page Layout Sequence

- **Context**: The user requested populating 30+ gaming cafes with realistic hardware tiers, photos, and amenities to test features end-to-end. Additionally, requested a strict homepage layout order:
  1. Featured Café Spotlight on top
  2. Auto-changing Promotional Banner Carousel
  3. Nearby Gaming Cafés Grid
  4. Recommended For You Based On Interests
  5. Own a Gaming Café CTA at the very bottom.
- **Decision**:
  - **30+ Cafes Seeded**: Updated `backend/scripts/seed_extra.py` to seed 30 verified gaming cafes across Mumbai, Delhi, Bengaluru, Hyderabad, Pune, Chennai, Kolkata, Kochi, and Ahmedabad with hardware tiers ranging from budget RTX 3070 to RTX 4090 extreme pods, VR sim bays, and PS5 lounges.
  - **Customer Home Page Restructure**: Reorganized `frontend/src/app/(customer)/page.tsx` to match the exact requested sequence. Added auto-sliding banner carousel with 4-second interval and updated `CafeListItem` TypeScript interface with `amenities` and `description` fields.
- **Consequences**: Next.js production build (`npm run build`) compiled 100% cleanly across all 15 static/dynamic routes.

---

## ADR 016: Phase 2 End-to-End Functional QA & Data-Driven Refactor

- **Context**: The user requested Phase 2 End-to-End Functional QA & Browser Automation. Focus on functionality without changing the design, systematically logging errors and solutions in real time into `QA_AUDIT_LOG.md`.
- **Decision**:
  - **Time Slot Truncation Fix**: Removed hardcoded `timeSlots.slice(0, 16)` in `frontend/src/app/(customer)/bookings/new/page.tsx` so all slots (e.g., up to 2:00 AM for overnight cafés) are displayed. Updated `generateTimeSlots` and `isSlotInPast` in `frontend/src/lib/format.ts` to support overnight operating hours.
  - **Booking Session Persistence**: Added `localStorage.setItem('pending_booking', ...)` in `bookings/new/page.tsx` to persist booking choices when an unauthenticated user attempts checkout, restoring selections automatically upon return after login.
  - **HTTP 422 Fix**: Added automatic selection of the earliest available future slot for today's date, preventing submission of past/expired time slots that triggered backend 422 validation errors.
  - **Google Maps API Key Error Modal Fix**: Enhanced `GoogleLocationDisplay.tsx` to detect missing `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` and display an interactive location preview card with latitude/longitude coordinates and a direct "View on Google Maps" button, eliminating Google's JS error modal. Fixed React hook ordering to conform to `rules-of-hooks`.
  - **Data-Driven State Refactor**: Derived café opening/closing hours dynamically using `formatTime()`, derived amenities and recent reviews from backend responses in `cafe/[id]/page.tsx`, and wired router navigation in `NotificationCenter.tsx`.
  - **Production Build & Test Verification**: Executed `npm run build` cleanly compiling all 15 static and dynamic routes. Verified E2E customer booking flow with dev servers active.
- **Consequences**: Customer booking flow, location previews, and account pages operate cleanly with 100% backend-driven state and zero build/type errors.
