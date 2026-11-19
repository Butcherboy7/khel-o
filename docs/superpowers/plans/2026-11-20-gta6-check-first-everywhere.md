# GTA 6 check-first booking on every hour Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline). Steps use checkbox syntax.

**Goal:** A player who taps GTA 6 can ask for any hour (normal hours included) on a named PS5 Pro, the founder confirms with the café and taps Allow, and the player pays the full amount.

**Architecture:** Casual drops stop holding normal hours (only their real reservations still count). In normal hours the GTA 6 page and the café PS5 checkout both create a `gta6_slot_request` (check-first); Allow creates an ordinary pending-payment booking priced by the server (GTA price from the drop for `game=gta6`, tier price for `game=other`). Capacity stays count-based per setup, so nothing is double sold.

**Tech Stack:** FastAPI + SQLAlchemy + Alembic (backend/), Next.js 15 + React Query (frontend/), pytest, vitest.

**Spec:** docs/superpowers/specs/2026-11-20-gta6-check-first-everywhere-design.md

## Global Constraints
- Request mode ends after 2026-11-27 (`gta6_requests_until`, admin setting; no code constant).
- Normal-hours days bookable 7 days ahead; late-night sessions keep the drop's `advance_hours`.
- GTA 6 price = drop `seat_price` (₹250 base, time/length prices apply); non-GTA on the same console = tier price.
- Phone number required on every request. Player pays full amount after Allow (no booking-fee-only path in normal hours).
- Server computes price; the client never sends one.
- Late-night/early-morning fee reservations unchanged. PCs/racing stay instant.
- No change to Home.

---

### Task 1: Casual drops stop holding normal hours

**Files:** Modify `backend/app/services/drop_service.py` (`dedicated_windows`, new `_casual_windows`); Test `backend/tests/test_drops_casual.py`

**Interfaces:** Produces `dedicated_windows(db, tier_id, day)` unchanged signature. For a casual drop it returns (a) its daily hours **minus** the café's normal hours as blanket seats, and (b) each holding reservation window overlapping normal hours as `(start, end, seats, title)`.

- [ ] Write failing tests: a casual drop (café 10-23, drop daily 10-23, 2 seats) holds nothing for a normal booking at 14:00; a confirmed drop reservation 14:00-16:00 with 1 seat does hold 1 seat at 15:00; a late-night drop 23:00-05:00 still holds blanket.
- [ ] Run, confirm fail.
- [ ] Implement `dedicated_windows`: for casual drops, intersect each interval with the complement of `normal_windows(cafe)`, and add holding reservations (status in `HOLDING`) of the drop's blocks on `day` via `res_window`.
- [ ] Run test_drops_casual + test_drops, confirm pass. Commit.

### Task 2: Request carries game + console; 7-day horizon; server price at Allow

**Files:** Create `backend/migrations/versions/095_gta6_request_game.py`; Modify `backend/app/models/gta6_request.py`, `backend/app/api/v1/gta6_requests.py`, `backend/app/services/booking_service.py` (`create_booking(..., base_amount_override=None)`), `backend/app/services/drop_service.py` (`gta6_price_for`); Test `backend/tests/test_gta6_requests.py`

**Interfaces:** `RequestIn` gains `game: Literal["gta6","other"]="gta6"`, `console_label: Optional[str]`. `Gta6SlotRequest.game`, `.console_label`. `drop_service.gta6_price_for(db, cafe_id, tier_id, session_date, start_time, hours, seats) -> Optional[Decimal]`. `BookingService.create_booking(gamer_id, booking_in, base_amount_override: Optional[Decimal] = None)`.

- [ ] Failing tests: request date 9 days out is refused (`TOO_FAR_AHEAD`), 3 days out ok; Allow on `game=gta6` makes a booking with `base_amount` = drop price (250 x hours), `game=other` = tier price; request response includes `game` and `consoleLabel`.
- [ ] Migration 095 (down 094): add `game` String(8) not null default 'gta6', `console_label` String(60) null.
- [ ] Implement model fields, `_out` fields, `create_request` horizon check (IST today + 7), pass `game`/`console_label`.
- [ ] Implement `gta6_price_for` (live casual drop for café whose tiers include tier_id; `seat_price(drop, begin_minutes, length_minutes, day) * seats`; None if no drop).
- [ ] `allow`: if `req.game == "gta6"` use override from `gta6_price_for`; pass `game="GTA 6"` for gta6, `None` otherwise.
- [ ] Run, confirm pass. Commit.

### Task 3: Drop page data for casual drops (7 days, normal bookings visible)

**Files:** Modify `backend/app/api/v1/drops.py` (`get_drop`, `_out`); Test `backend/tests/test_drops_casual.py`

- [ ] Failing test: GET drop for a casual drop returns `bookableUntil` about 7 days ahead and, in a block's `bookedSlots`, a normal confirmed booking on the tier in normal hours; also `requestsOn` is not here (client reads /gta6-requests/config).
- [ ] Implement: casual drops send `bookableUntil = now + 7d`; `bookedSlots` for casual drops also include seat-holding normal `Booking` rows of the drop's tiers on the block date as `{startTime,endTime,seatsCount}`.
- [ ] Run, confirm pass. Commit.

### Task 4: GTA 6 page books any hour via the request

**Files:** Modify `frontend/src/lib/api/gta6Requests.ts`, `frontend/src/app/drops/[slug]/DropClient.tsx`, `frontend/src/components/gta6/Gta6RequestSheet.tsx`; Test `frontend/src/lib/drops.test.ts`

**Interfaces:** `Gta6RequestBody` gains `game?: 'gta6' | 'other'`, `consoleLabel?: string`. `Gta6Request` gains `game`, `consoleLabel`.

- [ ] Remove the normal-hours refusal in DropClient: delete `normalSlots` greying from `booked`, `normalOnly` in `pick`/day chips, the `touchesNormal` filter in `pick`'s `ok`, and the "Book a normal slot instead" box.
- [ ] When `casual && gta6Cfg.enabled` and the picked window touches normal hours: the main button reads "Ask for this slot" and opens `Gta6RequestSheet` (variant `direct`: no "Are you playing" question, high-demand copy with 5-10 minutes, phone field required, hands `game:'gta6'` and `consoleLabel: pickedNames`); on sent route to `/gta6-requests/<id>`. Windows wholly outside normal hours keep the fee reserve flow.
- [ ] Days that cannot be picked show a plain reason ("Opens <date>" / "Full" / "Started") instead of silent disable.
- [ ] Vitest for helper `touchesNormalHours` unchanged; add a test that `requestNeeded(casual, cfg, touches)` is true only when all three hold.
- [ ] Commit.

### Task 5: Café checkout asks both ways, WhatsApp text, status screen

**Files:** Modify `frontend/src/app/(customer)/bookings/new/page.tsx`, `frontend/src/components/gta6/Gta6RequestSheet.tsx`, `frontend/src/lib/api/gta6Requests.ts` (`founderWhatsAppUrl`), `frontend/src/app/(customer)/gta6-requests/[id]/page.tsx`

- [ ] Sheet: "No, something else" now moves to the same high-demand step with `game:'other'` (copy "GTA 6 is in high demand so consoles can be busy. We check with the café first") instead of `onNotPlaying`; PCs never see it (gate already `runsGta6`).
- [ ] WhatsApp text: names the game ("play GTA 6" vs "book") and the console label.
- [ ] Status screen shows console and "Pay the full amount after the café says yes".
- [ ] Commit.

### Task 6: Verify on dev in a real browser

- [ ] Run backend suite subset (`tests/test_drops*.py tests/test_gta6_requests.py`), `npx tsc --noEmit`, `npx next build`, vitest.
- [ ] Deploy to dev (qaN via scripts/ops/deploy_dev... per memory) and click through at 400px with puppeteer: GTA banner → AdamsDen → 21 Nov 2 PM → PS5 Pro 2 → Ask → request page → admin Allow → pay screen amount.
- [ ] Report; the founder runs the prod deploy and sets `gta6_requests_until` to 2026-11-27.
