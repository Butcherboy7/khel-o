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

## ADR 005 to ADR 012 Summary Reference

*(Previous ADRs 005-012 retained for historical context and architectural reference)*
