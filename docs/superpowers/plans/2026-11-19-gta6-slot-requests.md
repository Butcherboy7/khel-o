# GTA 6 slot requests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** During the GTA 6 launch, a player booking a GTA 6-capable console is asked "Are you playing GTA 6?"; on Yes they send a request that the founder checks with the café and allows in admin, which creates a held (pending-payment) booking the player pays within 15 minutes.

**Architecture:** One new table + FastAPI module (`gta6_requests.py`) reusing `BookingService.create_booking` for the hold, `PlatformSetting` for the switch, `PushService` + `NotificationService` for alerts. Frontend: checkout question, status page, admin queue, café chips and a home strip.

**Tech Stack:** FastAPI + SQLAlchemy async + Alembic; Next.js 15 / React Query; pytest, vitest.

**Spec:** `docs/superpowers/specs/2026-11-19-gta6-slot-requests-design.md`

## Global Constraints
- Request unanswered for 60 minutes becomes `expired` (founder, 2026-11-19).
- Approved hold = the existing 15-minute PENDING_PAYMENT booking TTL.
- Founder WhatsApp number: 918142128389 (digits, country code). Strip end date default: 2026-12-03.
- Applies only to GTA 6 on consoles where `game_platforms.fit` is `yes` or `check`; PCs/VR/racing rigs never.
- Switch is `platform_settings.gta6_requests_on`; effective = on AND (until is null OR today IST <= until).
- Changes to Home are subtle: one slim strip, everything else untouched. "Plays GTA 6" chip on cafés that have it.
- Use utf-8 when writing files with non-ASCII; dev-first, founder runs deploy scripts.

## File structure
- Create `backend/migrations/versions/094_gta6_slot_requests.py`, `backend/app/models/gta6_request.py`, `backend/app/api/v1/gta6_requests.py`, `backend/tests/test_gta6_requests.py`
- Modify `backend/app/models/platform_setting.py`, `models/__init__.py`, `api/v1/router.py`, `core/game_platforms.py` (`tier_runs_gta6`), `schemas/hardware_tier.py` (`runs_gta6`), `repositories/cafe_repository.py` + `schemas/cafe.py` (`has_gta6`), `services/notification_service.py` (email)
- Create `frontend/src/lib/api/gta6Requests.ts`, `frontend/src/components/gta6/Gta6RequestSheet.tsx`, `frontend/src/app/(customer)/gta6-requests/[id]/page.tsx`, `frontend/src/app/(admin)/admin/gta6-requests/page.tsx`, `frontend/src/components/gta6/Gta6HomeStrip.tsx`
- Modify checkout `bookings/new/page.tsx`, `CafeCard.tsx`, `(home)/page.tsx`, `AdminShell.tsx`, tier/café TS types.

### Task 1: Data + gate
Interfaces produced: `Gta6SlotRequest` model; `PlatformSetting.gta6_requests_on/until/whatsapp`; `effective(settings) -> bool`; `game_platforms.tier_runs_gta6(tier) -> bool`.
- [ ] Failing tests: gate on/off/until, `tier_runs_gta6` for PS5/Xbox yes, PC/VR no.
- [ ] Migration 094, model, settings columns, helpers. Tests pass.

### Task 2: Player API
Produces: `GET /gta6-requests/config`, `POST /gta6-requests`, `GET /gta6-requests/mine`, `GET /gta6-requests/{id}`; lazy 60-min expiry; admin push+email on create.
- [ ] Tests: refused when gate off / non-GTA tier; creates once per slot; expiry; owner-only read.
- [ ] Implement.

### Task 3: Admin API (allow / decline / suggest / settings)
Produces: `GET /admin/gta6-requests`, `POST .../{id}/allow|decline|suggest`, `GET|PUT /admin/gta6-requests/settings`.
- [ ] Tests: allow creates PENDING_PAYMENT booking for the player and links it; second allow on a full slot fails and creates nothing; decline/suggest set status and note.
- [ ] Implement; player gets in-app notification + push + email.

### Task 4: Flags
Produces: tier `runsGta6`, café list/detail `hasGta6`.
- [ ] Tests then implement via computed field / list dict.

### Task 5: Frontend player
- [ ] API client + types, checkout question sheet (Yes → request + wa.me; No → continue), status page.

### Task 6: Frontend admin
- [ ] Queue page with WhatsApp-the-café/player, Allow, Decline, Suggest, and settings; add to AdminShell.

### Task 7: Chips + home strip
- [ ] "Plays GTA 6" chip on CafeCard/café page; slim strip on Home (until the date / while effective).

### Task 8: Verify and ship
- [ ] Full drop + new backend tests, vitest, tsc, eslint, real-browser check (mocked API), commit on the branch, report; founder runs deploy.
