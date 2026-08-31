# Phase 2 — Booking Correctness, Concurrency & Time

**Scope (files read end to end unless noted):**
`backend/app/services/booking_service.py`, `backend/app/repositories/booking_repository.py`,
`backend/app/models/booking.py`, `backend/app/schemas/booking.py`, `backend/app/api/v1/bookings.py`,
`backend/app/api/v1/cafes.py`, `backend/app/services/hardware_tier_service.py`,
`backend/app/models/hardware_tier.py`, `backend/app/core/time.py`, `backend/app/constants.py`,
`backend/app/database.py`, `backend/app/services/owner_service.py`,
`backend/app/services/promotion_service.py`, `backend/app/services/payment_service.py`,
`backend/app/api/v1/owner.py` (booking/check-in/QR/cancel sections), `backend/app/api/v1/admin.py` (refund),
`backend/app/background/qr_generator.py`, `backend/scripts/init_local_db.py`,
`backend/migrations/versions/001, 006, 007, 008, 009, 011, 016`,
`frontend/src/app/(customer)/bookings/new/page.tsx`, `frontend/src/components/customer/TimelineRangePicker.tsx`,
`frontend/src/app/(customer)/bookings/[id]/page.tsx` (grepped), `frontend/src/lib/api/bookings.ts`,
`frontend/src/lib/bookingIntent.ts`, `frontend/src/lib/format.ts` (booking helpers),
`frontend/src/app/(owner)/owner/scanner/page.tsx` (grepped).

**Verdict:** The concurrency story is *better* than the prior audit claimed — booking creation really is
serialized by a `SELECT … FOR UPDATE` on the tier row that is held until the insert commits, so
same-tier double-booking is not reachable. The damage is elsewhere: the overlap **math** is wrong in a
way that both blocks legitimate bookings and, separately, oversells checked-in seats; the Alembic
migration chain has drifted out of sync with the ORM models such that a migration-built database cannot
store `checked_in`/`active`/`failed` at all; a captured payment that lands one second past the 15-minute
TTL is voided with no refund while telling the customer a refund was initiated; and several
owner-controlled safety valves (operating hours, `bookable_stations = 0`) are enforced only in the UI.
Timezone handling on the backend is genuinely disciplined (`core/time.py` is used consistently, all
datetimes are aware); the frontend, by contrast, computes "now" and "today" from the device clock with
no IST anchoring at all.

## Findings summary

| ID | Sev | Title | File |
|---|---|---|---|
| 2-1 | P0 | TTL-expired payment voids the booking without refunding the money it just captured | `services/payment_service.py:346-355, 450-464` |
| 2-2 | P1 | Overlap query sums every booking touching the window instead of peak concurrent seats | `repositories/booking_repository.py:129-143` |
| 2-3 | P1 | `checked_in` / `active` bookings are invisible to the occupancy query — seats get oversold | `repositories/booking_repository.py:132-138` |
| 2-4 | P1 | Alembic schema has drifted from the ORM: enum, column type, and a migration that cannot run on Postgres | `migrations/versions/001,006,008,011` |
| 2-5 | P1 | `emergency_close_day` raises `NameError: select` — owner emergency closure is dead | `services/owner_service.py:310` |
| 2-6 | P1 | Booking creation never checks the café's operating hours | `services/booking_service.py:89-121` |
| 2-7 | P1 | `bookable_stations = 0` ("walk-ins only") is not enforced by the booking engine | `services/booking_service.py:77-79` |
| 2-8 | P1 | No idempotency or dedup: repeated abandoned checkouts hold a café's whole inventory | `services/booking_service.py:66-206` |
| 2-9 | P1 | Admin refund endpoint has no state guard and no refund idempotency | `api/v1/admin.py:457-477`, `services/payment_service.py:505-599` |
| 2-10 | P1 | Overnight sessions are built end-to-end in the frontend and hard-rejected by the backend | `services/booking_service.py:116-121` |
| 2-11 | P2 | `/availability` ignores the pending-payment TTL it computes — shows free seats as taken | `api/v1/cafes.py:97-105` |
| 2-12 | P2 | All frontend booking time math uses the device clock, not IST | `lib/format.ts:42-63`, `bookings/new/page.tsx:61-66, 271-276` |
| 2-13 | P2 | Timeline picker's lead time (10 min) and max duration (16 h) contradict the backend (30 min, 8 h) | `components/customer/TimelineRangePicker.tsx:126-133, 296` |
| 2-14 | P2 | `/availability` does not verify the tier belongs to the café, and `remainingSeats` is always a lie | `api/v1/cafes.py:87-131` |
| 2-15 | P3 | Owner dashboard "today"/"this week" counters compare UTC dates against IST-stored session dates | `repositories/booking_repository.py:283-313` |
| 2-16 | P3 | GET endpoints mutate booking state, one commit per row | `services/booking_service.py:290-334`, `services/owner_service.py:124-142` |
| 2-17 | P3 | No index on `bookings(hardware_tier_id, session_date)` and no DB-level overlap constraint | `migrations/versions/001_initial_schema.py:125` |
| 2-18 | P3 | Two divergent auto-transition implementations with different grace periods | `services/booking_service.py:327-333` vs `services/owner_service.py:130-133` |

---

### [P0] Refund the money when a payment lands after the 15-minute TTL

- **Where:** `backend/app/services/payment_service.py:346-355` (client path) and `:450-464` (webhook path)
- **What:** Both paths detect that a captured payment arrived more than 900 s after `booking.created_at`,
  set the booking to `FAILED`, and return. Neither calls `process_refund` or any Razorpay refund API.
  The client path's error message literally says `"Payment session expired after 15 minutes. Auto-refund
  initiated."` and the webhook returns `{"status": "ttl_expired_refunded"}` — both claim a refund that
  the code never performs.
- **Why it's P0:** Razorpay has already captured the customer's money. The customer ends with no booking,
  no seat, no refund, and an explicit on-screen statement that a refund is on its way. There is no
  admin queue or failure record either — the only trace is a log line. Every rupee of this is a
  chargeback or a support escalation.
- **Repro / trigger:** Create a booking, open the Razorpay modal, and complete a UPI collect request or a
  card 3-D-Secure/OTP flow that takes longer than 15 minutes (routine on Indian bank OTP flows and on
  UPI collect, whose default mandate window is longer than 15 minutes). Razorpay captures at T+16 min;
  `payment.captured` webhook fires; line 454 matches; booking → `FAILED`; nothing else happens.
- **Fix sketch:** In both TTL branches call `process_refund` (or record a `pending_manual_refund` row an
  admin dashboard surfaces) before returning, and only claim "refund initiated" once the refund call
  actually succeeded. Consider extending the TTL to match real UPI/3DS timeouts.
- **Confidence:** High

---

### [P1] Count peak concurrent seats, not the sum of every booking touching the window

- **Where:** `backend/app/repositories/booking_repository.py:129-143`
- **What:** `get_overlapping_bookings_count` is `SUM(seats_count)` over every booking whose interval
  intersects `[start_time, end_time)`. That is the total number of *seat-bookings that touch the
  window*, not the maximum number of seats simultaneously occupied. Two bookings that do not overlap
  each other but both overlap the requested window are added together. The half-open comparison itself
  (`start_time < end_time AND end_time > start_time`) is correct — 14:00-end vs 14:00-start is not a
  conflict — the aggregation on top of it is what's wrong.
- **Why it's P1:** It systematically refuses bookings the café can honour. On a 2-seat tier, one
  14:00–15:00 booking plus one 15:00–16:00 booking (1 seat each) makes a 14:00–16:00 request return
  `overlapping_count = 2`, so `2 + 1 > 2` → `SLOT_OVERCAPACITY`, even though at no instant are more than
  1 of the 2 seats used. A busy café with many short bookings becomes effectively unbookable for longer
  sessions. It also disagrees with the frontend, which computes the *correct* peak-occupancy figure
  (`calculateWindowRemainingSeats`, `frontend/src/lib/format.ts:271-291`, `maxOccupied` per 30-min
  bucket) — so the wizard shows "3 seats left", enables the button, and the server rejects the request.
- **Repro / trigger:** Tier with `app_bookable_seats = 2`. Confirm booking A 14:00–15:00 (1 seat) and
  booking B 15:00–16:00 (1 seat). Request 14:00–16:00, 1 seat. Frontend shows available; backend returns
  `SLOT_OVERCAPACITY` with "1 available" when 1 seat genuinely is free the whole time.
- **Fix sketch:** Compute occupancy per time bucket (or with a window function over interval start/end
  events) and take the maximum across the requested window, matching `calculateWindowRemainingSeats`.
  Keep the half-open boundary semantics as they are.
- **Confidence:** High

---

### [P1] Include `checked_in` and `active` bookings in occupancy

- **Where:** `backend/app/repositories/booking_repository.py:132-138`; status set at
  `backend/app/services/owner_service.py:269-279` and `:134-137`
- **What:** The occupancy filter matches only `CONFIRMED`, plus `PENDING_PAYMENT` younger than 15
  minutes. `CHECKED_IN` and `ACTIVE` are excluded. But check-in moves a booking straight from
  `CONFIRMED` → `CHECKED_IN` (and `auto_transition_booking` then moves it to `ACTIVE` once the session
  starts). A customer physically sitting at a rig therefore stops occupying a seat as far as the booking
  engine is concerned. `/availability` (`api/v1/cafes.py:103`) has the identical omission, so the UI
  agrees with the oversell rather than catching it.
- **Why it's P1:** Real oversell of paid seats. Two customers are sold the same physical rig for the
  same minutes, and the café has to turn one of them away at the door.
- **Repro / trigger:** Tier with `app_bookable_seats = 1`. Customer A books and pays for 14:00–18:00.
  At 14:00 staff scan A in → status `CHECKED_IN`, then `ACTIVE`. At 14:05 customer B requests
  15:00–18:00 (start is 55 min out, so the ≥30-min lead-time check passes). The overlap query returns 0.
  B's booking is created and paid. Two bookings, one seat.
- **Fix sketch:** Add `CHECKED_IN` and `ACTIVE` to the status set in `get_overlapping_bookings_count`,
  `get_gamer_daily_seats_count`, and the `/availability` query. Define the occupying set once in a
  shared constant so the three sites cannot drift again.
- **Confidence:** High

---

### [P1] Reconcile the Alembic migrations with the ORM models

- **Where:** `backend/migrations/versions/001_initial_schema.py:116`,
  `006_khelo_v2_schema.py:50-55`, `008_add_booking_controls.py:28-37`,
  `011_add_booking_checkin_fields.py:21-26`; ORM at `backend/app/models/booking.py:9-51`
- **What:** Three concrete divergences, none of which any later migration repairs (verified by grepping
  the whole `migrations/` tree for `ALTER TYPE` / `ADD VALUE` — zero hits):
  1. `001` creates the Postgres enum `bookingstatus` with five labels
     (`pending_payment, confirmed, cancelled, completed, no_show`). `BookingStatus` in the model has
     **eight** — it also defines `checked_in`, `active`, `failed`. Nothing ever adds those three labels.
  2. `011` adds `checked_in_by` as `sa.String(32)`. The model maps it to
     `Mapped[uuid.UUID | None] … ForeignKey("users.id")` (`models/booking.py:49`). A UUID is 36
     characters and asyncpg will not bind a `uuid.UUID` to a `varchar`. No FK is created either.
  3. `006` adds `checkin_method` as a Postgres enum `checkinmethod('qr_scan','manual')`; the model
     declares `String(50)`; `011` would have added it as `String(50)` but is guarded by a column-exists
     check, so on a 006-built database the enum wins. The scanner sends `payload.method` free-form.
  Separately, `008:35` executes `SET … bookings_paused = 0` against a `Boolean` column, which Postgres
  rejects outright (`column is of type boolean but expression is of type integer`) — so the migration
  chain cannot even be replayed from scratch past 007. `backend/scripts/init_local_db.py:15` builds
  dev databases with `Base.metadata.create_all` instead, which is why this has gone unnoticed: dev and
  migration-built environments have different schemas.
- **Why it's P1:** On any database actually built by these migrations, every write of `checked_in`,
  `active`, or `failed` raises `invalid input value for enum bookingstatus`. That is the entire
  check-in flow (`owner_service.checkin_booking:269`), the auto-transition to `ACTIVE`
  (`owner_service:136`), the lazy payment-TTL expiry (`booking_service:313`), and the payment-failure
  path (`payment_service:329-332, 460-463`) — a 500 on each. And no environment can be provisioned
  from scratch at all because of `008`.
- **Repro / trigger:** `alembic upgrade head` against an empty Postgres → fails at revision `008`. Force
  past it, then scan any QR at the scanner → `POST /owner/bookings/{id}/checkin` → 500.
- **Fix sketch:** Add a migration with `ALTER TYPE bookingstatus ADD VALUE` for the three missing
  labels, convert `checked_in_by` to `UUID` with the FK, settle `checkin_method` on one representation,
  and fix `008`'s boolean literal. Then add a CI check that `alembic upgrade head` on an empty DB
  produces a schema matching `Base.metadata` (autogenerate diff must be empty).
- **Confidence:** High on the migration files as written; Medium on the state of the live production
  database, which may have been hand-patched — a human should diff prod's schema against the models.

---

### [P1] Import `select` in `owner_service.emergency_close_day`

- **Where:** `backend/app/services/owner_service.py:310` (statement), module imports at `:1-19`
- **What:** `emergency_close_day` calls `select(Booking)` but `select` is never imported at module scope.
  The two other functions in the file that need it do a local `from sqlalchemy import select`
  (`:30` and `:194`); this one does not. It is an unconditional `NameError` on the first line of real
  work.
- **Why it's P1:** The owner's emergency "close the day" action — the tool for a power cut or a burst
  pipe — 500s every time. Confirmed bookings are neither cancelled nor refunded, and customers keep
  arriving at a closed venue.
- **Repro / trigger:** Any call to the emergency-close endpoint for a café with any bookings on that
  date.
- **Fix sketch:** Add `from sqlalchemy import select` to the module imports and delete the two
  function-local ones. A smoke test over each owner endpoint would have caught this.
- **Confidence:** High

---

### [P1] Validate the requested slot against the café's operating hours server-side

- **Where:** `backend/app/services/booking_service.py:89-121` (all of the time validation);
  `opening_time`/`closing_time` exist at `backend/app/models/cafe.py:33-34`
- **What:** `create_booking` validates only: ≥30 minutes lead time, duration in `[0.5, 8.0]`, and
  no midnight crossing. It never reads `cafe.opening_time` or `cafe.closing_time`. Grepping the whole
  backend for `opening_time` shows it is referenced only in owner CRUD (`api/v1/owner.py`), the café
  repository serializer, and seed data — never in the booking path. The only enforcement is
  `TimelineRangePicker`, which clamps the slider to `[openMin, closeMin]`.
- **Why it's P1:** A request crafted outside the wizard books, pays for, and gets a confirmed QR pass
  for 04:00 at a café that opens at 10:00. Staff will not be there. The customer is owed a refund and
  the café takes the reputational hit. It also fires all the confirmation email/notification machinery
  for a session that cannot exist.
- **Repro / trigger:** `POST /api/v1/bookings` with `startTime: "04:00:00"`, `durationHours: 2` for a
  café whose `opening_time` is 10:00. Accepted, 201.
- **Fix sketch:** After the lead-time check, reject when the requested `[start, end)` is not fully
  inside `[opening_time, closing_time)` for the café (handling the closing-after-midnight case with
  `core/time.py` helpers rather than a new inline constant).
- **Confidence:** High

---

### [P1] Enforce `bookable_stations` in the booking engine

- **Where:** `backend/app/services/booking_service.py:77-79`; capacity actually used at `:126-139` and
  `repositories/booking_repository.py:157-166`
- **What:** `create_booking` computes
  `effective_stations = cafe.bookable_stations if cafe.bookable_stations > 0 else (cafe.total_seats or 10)`
  and then only rejects when `effective_stations <= 0` — a branch that can never be true, because the
  fallback replaces 0 with `total_seats or 10`. The value is then discarded: capacity comes solely from
  `tier.app_bookable_seats` (`booking_repository.py:166`). Meanwhile `/availability`
  (`api/v1/cafes.py:122-125`) *does* apply `min(app_bookable_seats, bookable_stations)` and forces the
  displayed seats to 0 when `bookable_stations == 0`. The read path and the write path disagree.
- **Why it's P1:** "Reserve all stations for walk-ins" is an owner control that the API silently ignores.
  Setting `bookable_stations = 0` greys out the UI but a direct `POST /api/v1/bookings` still succeeds,
  and the venue-wide cap is never applied across tiers at all, so a café whose owner capped online
  inventory at 5 can still sell every tier's full `app_bookable_seats`. The café is then physically
  oversold and eats the refunds.
- **Repro / trigger:** As an owner, set `bookable_stations = 0`. As a customer, call
  `POST /api/v1/bookings` directly (the payload is fully visible in devtools from the normal flow). The
  booking is created and payable.
- **Fix sketch:** Make `bookable_stations = 0` an explicit rejection instead of a fallback, and clamp
  effective capacity to `min(tier.app_bookable_seats, remaining venue-wide bookable_stations)` inside
  the same locked transaction as the tier check.
- **Confidence:** High

---

### [P1] Add idempotency / pending-booking dedup to booking creation

- **Where:** `backend/app/services/booking_service.py:66-206`; frontend guard at
  `frontend/src/app/(customer)/bookings/new/page.tsx:469, 802-807`
- **What:** There is no idempotency key, no request hash, and no "you already have a pending booking for
  this slot" check. Every `POST /api/v1/bookings` creates a fresh row with a fresh `uuid4()` and a fresh
  `PENDING_PAYMENT` hold that counts against capacity for 15 minutes
  (`booking_repository.py:135-137`). The only protections are client-side (`if (isProcessing) return`
  plus a disabled button) and the 60-seat-per-user-per-venue-per-day cap
  (`booking_service.py:141-151`).
- **Why it's P1:** Two failure modes. (a) Benign: the user opens Razorpay, dismisses it, taps
  "Continue to Payment" again — a second booking row now holds a second seat for 15 minutes, and the
  abandoned first one keeps consuming inventory. Retried requests behind a flaky mobile connection do
  the same. (b) Hostile: one authenticated account can fire 60 seats' worth of pending bookings at a
  café per day and never pay, blocking real customers in 15-minute waves at zero cost. A handful of
  free accounts can keep a venue's online inventory at zero indefinitely.
- **Repro / trigger:** Book a slot, dismiss the Razorpay modal, tap "Continue to Payment" again.
  `GET /api/v1/bookings` now lists two `pending_payment` rows for the same slot, and `/availability`
  reports two seats consumed.
- **Fix sketch:** Accept a client-supplied `Idempotency-Key` header (or derive a natural key from
  gamer + tier + date + start + duration) and, on a repeat within the TTL, return the existing pending
  booking instead of creating a new one. Additionally cap concurrent pending-payment bookings per user
  well below 60 seats.
- **Confidence:** High for (a); High for the mechanism of (b), Medium on the practical exploit rate
  since it requires authenticated accounts.

---

### [P1] Guard the admin refund endpoint on booking state and prior refunds

- **Where:** `backend/app/api/v1/admin.py:457-477`; `backend/app/services/payment_service.py:505-599`
- **What:** `process_refund` checks only that a `Payment` row exists and has a `razorpay_payment_id`. It
  does **not** check `payment.status` (so an already-`REFUNDED` payment is refunded again), does not
  check the booking's status, and at `:590` unconditionally sets
  `booking.status = BookingStatus.CANCELLED`. The admin endpoint wraps it with no additional guard. The
  customer-facing path is safe by accident — `cancel_booking:373-377` refuses a booking that is already
  `CANCELLED` — but the admin route has no such gate.
- **Why it's P1:** Calling the admin refund twice issues two full-amount Razorpay refund calls; the only
  thing stopping the second from succeeding is Razorpay's own "refund amount exceeds refundable"
  validation, which this code swallows into a `refund_api_failed` result. Worse and unconditional: an
  admin refunding a `COMPLETED` session (a session the customer actually played) silently rewrites it to
  `CANCELLED`, corrupting revenue reporting and the owner's settlement picture. When Razorpay keys are
  absent the code fabricates a `local_rfnd_…` id and marks the payment refunded with no gateway
  involvement at all (`:587-589`).
- **Repro / trigger:** `POST /api/v1/admin/bookings/{id}/refund` twice on the same booking; or once on a
  booking whose status is `completed`.
- **Fix sketch:** Reject when `payment.status` is already `REFUNDED`, restrict the allowed source
  statuses, and derive the new booking status from the current one rather than hardcoding `CANCELLED`.
  Pass a Razorpay idempotency key on the refund call.
- **Confidence:** High on the missing guards and the state corruption; Medium on real double-refund
  money loss, since the gateway rejects the second attempt.

---

### [P1] Reconcile overnight-session support between frontend and backend

- **Where:** `backend/app/services/booking_service.py:108-121`; frontend support at
  `bookings/new/page.tsx:61-98, 162-194` and `TimelineRangePicker.tsx:120-124, 274`
- **What:** The backend refuses outright any booking whose `end_time <= start_time`, with a documented
  rationale (the overlap query is wall-clock only and cannot see past midnight). The frontend, meanwhile,
  is built end-to-end for overnight venues: `minutesToTimeAndDayOffset`, a `dayOffset` state threaded
  through the URL, `closeMin += 1440` in the picker, and a second availability fetch for the next day
  merged with a +1440 shift. The picker will happily let a user drag 23:00 → 01:00 at a café that closes
  at 02:00.
- **Why it's P1:** Every late-night gaming café — the segment most likely to have demand after
  midnight — loses those bookings. The user completes the whole wizard, sees a price, taps "Continue to
  Payment", and gets `OVERNIGHT_BOOKING_UNSUPPORTED`. Note the backend's refusal is the *correct*
  conservative choice given 2-2/2-3; the defect is that the product ships a UI that promises what the
  API refuses.
- **Repro / trigger:** Any café with `closing_time` earlier than `opening_time`. Drag the slider across
  midnight, tap "Continue to Payment".
- **Fix sketch:** Make the overlap query date-aware (compare full `session_start`/`session_end`
  timestamps rather than bare `time` columns), then lift the restriction; or, short term, clamp the
  picker to `closeMin ≤ 1440` so the UI never offers a slot the API will refuse.
- **Confidence:** High

---

### [P2] Apply the pending-payment TTL in `/availability`

- **Where:** `backend/app/api/v1/cafes.py:97-105`
- **What:** Line 97 computes `payment_window_cutoff = dt.now(timezone.utc) - timedelta(minutes=15)` and
  then never uses it. The query filters on
  `status.in_([PENDING_PAYMENT, CONFIRMED])` with no `created_at` predicate, so every abandoned
  pending booking ever created for that date is still reported as a booked slot. The booking engine, by
  contrast, only counts pending bookings younger than 15 minutes
  (`booking_repository.py:135-137`). The dead variable is direct evidence the filter was intended and
  dropped.
- **Why it's P2:** The wizard shows slots as occupied that the server would happily sell, and
  `calculateWindowRemainingSeats` disables the "Continue to Payment" button accordingly. Every abandoned
  checkout permanently poisons that slot's displayed availability. It's a lost sale, not a
  correctness violation — hence P2 rather than P1.
- **Repro / trigger:** Start a booking for 16:00, abandon the Razorpay modal, wait 20 minutes, reload
  the wizard. The 16:00 slot is still shown as taken even though the hold has long expired.
- **Fix sketch:** Add the same `or_(status == CONFIRMED, and_(status == PENDING_PAYMENT, created_at >= cutoff))`
  predicate the repository uses. Better: have this endpoint call the repository method so the two can
  never diverge.
- **Confidence:** High

---

### [P2] Anchor frontend booking time math to IST instead of the device clock

- **Where:** `frontend/src/lib/format.ts:42-63` (`getTodayString`, `getNext14Days`),
  `frontend/src/app/(customer)/bookings/new/page.tsx:61-66, 271-276`,
  `frontend/src/components/customer/TimelineRangePicker.tsx:126-133, 259-262`
- **What:** Every "now" and "today" on the booking path comes from `new Date()` / `getHours()` /
  `getFullYear()` — the browser's local timezone. The backend interprets every submitted
  `session_date` + `start_time` as IST (`core/time.py:1-18`, `booking_service.py:90-91`). There is no
  IST conversion anywhere on the frontend. The date strip, the "is today" check, the earliest-valid-start
  computation, and the "past slots are greyed out" logic all silently assume the device is on IST.
- **Why it's P2:** For a device on IST (the overwhelming majority) this is correct. For anyone else — an
  NRI booking for a trip home, a traveller, or simply a device with the wrong timezone — the date strip
  starts on the wrong day, past slots aren't greyed out, and the wizard offers slots the backend rejects
  as being in the past. It never corrupts data (the backend is authoritative) so it is bad UX, not a
  correctness failure.
- **Repro / trigger:** Set the browser timezone to `America/New_York` and open the wizard at 22:00 local
  (07:30 IST next day). The date strip's first entry and the earliest valid start are computed for the
  wrong IST day.
- **Fix sketch:** Add an IST-anchored `nowIst()` / `todayIstString()` helper (`Intl.DateTimeFormat` with
  `timeZone: 'Asia/Kolkata'`) and route every booking-path date/time computation through it, mirroring
  the backend's `core/time.py`.
- **Confidence:** High

---

### [P2] Align the picker's lead-time and duration limits with the backend

- **Where:** `frontend/src/components/customer/TimelineRangePicker.tsx:126-133` and `:296, 392`;
  backend limits at `backend/app/services/booking_service.py:93-103` and
  `backend/app/schemas/booking.py:25`
- **What:** The picker's `minValidStart` is `now + 10 minutes` rounded to the next 30-minute mark, while
  the backend requires **30** minutes (`booking_service.py:93`). The duration stepper clamps to
  `Math.min(16, …)` and the "+" button disables only at `durationHours >= 16`, while the backend caps
  at 8.0 hours — enforced by Pydantic (`le=8.0`), so an over-8 request comes back as a raw 422 rather
  than the friendly `INVALID_DURATION` message. The wizard's own auto-select effect
  (`bookings/new/page.tsx:275`) uses yet a third value, `now + 30`.
- **Why it's P2:** The user selects a slot the picker presented as valid and gets an error at the last
  step of checkout — the most expensive possible place to fail. The 16-hour path produces an unstyled
  validation error with no usable message.
- **Repro / trigger:** At 14:05, drag the start handle to 14:30 (allowed: 14:05 + 10 min → 14:30) and
  check out → `INVALID_START_TIME`. Or press "+" on duration up to 10 hours and check out → 422.
- **Fix sketch:** Export the lead-time and duration bounds as shared constants and use them in all three
  places (picker, wizard auto-select, and validation), matching `booking_service.py`.
- **Confidence:** High

---

### [P2] Scope `/availability` to the café and stop reporting a fake `remainingSeats`

- **Where:** `backend/app/api/v1/cafes.py:87-131`
- **What:** Two issues in one endpoint. (a) `tier_id` is looked up with
  `tier_repo.get_by_id(tier_id)` and never checked against the path's `cafe_id` — any tier's schedule
  can be read through any café's URL, and the café-level pause/`bookable_stations` clamp at `:122-125`
  is then applied to a tier belonging to a *different* café. (b) `remainingSeats` is set to
  `app_bookable_seats` verbatim at `:131`, i.e. it never subtracts anything; it is identical to
  `appBookableSeats` in every response. Any client that trusts the field name gets total capacity, not
  remaining. The current frontend happens to ignore it and recompute from `bookedSlots`
  (`bookings/new/page.tsx:199-212`), which is why this hasn't bitten yet.
- **Why it's P2:** No money moves and no booking breaks today, but (a) is a cross-café data mix-up
  waiting to produce a wrong availability grid, and (b) is a field actively lying about its own meaning
  to the next consumer that uses it.
- **Repro / trigger:** `GET /api/v1/cafes/{cafeA}/availability?tier_id={tier_of_cafeB}&date=…` returns
  200 with cafe B's tier schedule under cafe A's pause flags. And compare `appBookableSeats` vs
  `remainingSeats` in any response with existing bookings — always equal.
- **Fix sketch:** Reject when `tier.cafe_id != cafe_id` (the booking service already does exactly this at
  `booking_service.py:86`), and either compute `remainingSeats` properly or remove the field.
- **Confidence:** High

---

### [P3] Compute owner "today" / "this week" counters in IST

- **Where:** `backend/app/repositories/booking_repository.py:283-297` (`count_upcoming_today`),
  `:299-313` (`get_booked_hours_this_week`), `:255-267`, `:269-281`
- **What:** `count_upcoming_today` takes `now = datetime.now(timezone.utc)` and compares `now.date()`
  against `Booking.session_date` and `now.time()` against `Booking.start_time` — but both booking
  columns are naive IST wall-clock values (`core/time.py:1-3`). Between 18:30 and 00:00 IST the UTC date
  is the previous day, so the dashboard counts the wrong day's bookings; and the time comparison is off
  by 5h30m all day. `get_booked_hours_this_week` has the same UTC-vs-IST date boundary issue.
  `count_bookings_this_month` / `sum_revenue_this_month` filter on `created_at`, which is a genuine
  timestamptz, so those are only wrong within 5h30m of a month boundary.
- **Why it's P3:** Owner dashboard numbers only — no booking or payment is affected. It is a
  reporting-accuracy defect, and every evening it reports the wrong day.
- **Repro / trigger:** At 20:00 IST (14:30 UTC), "upcoming bookings today" filters on
  `session_date == <today UTC>` (same day, fine) but `start_time > 14:30`, so it silently drops every
  session between 14:30 and 20:00 IST that is genuinely upcoming and includes none of the evening ones
  correctly. After 00:00 IST the date itself is wrong too.
- **Fix sketch:** Use `now_ist()` from `core/time.py` in these four aggregates, as the service layer
  already does everywhere else.
- **Confidence:** High

---

### [P3] Stop mutating booking state from GET endpoints

- **Where:** `backend/app/services/booking_service.py:290-334` (`_expire_if_past_due`, called from
  `get_booking:232`, `list_gamer_bookings:350`, and `api/v1/bookings.py:105`),
  `backend/app/services/owner_service.py:124-142` (`auto_transition_booking`, called from
  `get_owner_bookings:108`)
- **What:** Status transitions are performed lazily on read because, as the docstring at `:291-294`
  admits, there is no background scheduler. Each transition goes through `booking_repo.update`, which
  commits (`booking_repository.py:368`) — so listing a page of 20 bookings can issue up to 20 separate
  transactions inside a GET, none of them row-locked.
- **Why it's P3:** Correctness is mostly preserved (the writes are idempotent and converge), but a
  read is not safe to retry, a page load can partially commit, and two concurrent readers can both
  attempt the same transition. It is also the reason the two implementations in 2-18 can drift. Not
  user-visible yet.
- **Repro / trigger:** `GET /api/v1/bookings?limit=20` on an account with 20 past confirmed bookings
  issues 20 UPDATE+COMMIT round trips.
- **Fix sketch:** Move expiry/transition into a scheduled job (or a single batched `UPDATE … WHERE`
  statement per request) and make the read paths pure.
- **Confidence:** High

---

### [P3] Index the occupancy query and consider a DB-level overlap constraint

- **Where:** `backend/migrations/versions/001_initial_schema.py:101-125`; queries at
  `backend/app/repositories/booking_repository.py:129-143` and `api/v1/cafes.py:98-105`
- **What:** The `bookings` table has exactly one index — `ix_bookings_reference` on
  `booking_reference` (`001:125`). `002_add_indexes.py` adds indexes to `cafes` and `hardware_tiers`
  but none to `bookings`. The hot occupancy query filters on
  `(hardware_tier_id, session_date, status, start_time, end_time)` and runs inside a `FOR UPDATE`
  transaction on every booking attempt. There is also no `EXCLUDE USING gist` constraint or any other
  database-level guarantee against overlapping oversell — the invariant lives entirely in the
  application's row lock.
- **Why it's P3:** Correctness is currently held by the tier row lock (see "Notes"), and volume is low,
  so nothing is user-visible. But a sequential scan inside a held lock is exactly the thing that turns
  into lock contention as the bookings table grows, and there is no backstop if any future code path
  forgets the lock.
- **Repro / trigger:** `EXPLAIN` the occupancy query on a `bookings` table of any size — seq scan.
- **Fix sketch:** Add a composite index on `(hardware_tier_id, session_date, status)`. Longer term,
  once bookings are stored as real timestamp ranges (see 2-10), an `EXCLUDE` constraint would make
  oversell structurally impossible rather than lock-dependent.
- **Confidence:** High

---

### [P3] Unify the two auto-transition implementations

- **Where:** `backend/app/services/booking_service.py:318-333` vs
  `backend/app/services/owner_service.py:124-142`
- **What:** Two independent implementations of "advance a stale booking". `_expire_if_past_due` moves
  `CONFIRMED → NO_SHOW` only after session end **plus a 15-minute grace**, and also handles
  `PENDING_PAYMENT → FAILED`. `auto_transition_booking` moves `CONFIRMED → NO_SHOW` at session end with
  **no grace**, and additionally handles `CHECKED_IN → ACTIVE` and `ACTIVE → COMPLETED` which the other
  does not.
- **Why it's P3:** For 15 minutes after every session ends, the same booking reads as `NO_SHOW` on the
  owner's list and still `CONFIRMED` on the customer's — and whichever page is loaded first wins,
  permanently. Cosmetic inconsistency rather than lost money, but it is the kind of divergence that
  becomes a real bug the next time someone edits one and not the other. Both files import the shared
  `core/time.py` helpers, so the rollover math at least agrees.
- **Repro / trigger:** Let a confirmed session end without a check-in. Open the owner bookings list
  within 15 minutes → `no_show`. Open the customer's booking detail first instead → still `confirmed`.
- **Fix sketch:** Collapse into one transition function (in `core/` or a dedicated service) with one
  grace-period constant, and have both services call it.
- **Confidence:** High

---

## Prior audit (`LAUNCH_READINESS_AUDIT.md`) — status of overlapping claims

- **P0-2 / "Race condition in booking creation" (`booking_service.py:90-97`, and the summary at
  line 300: *"the lock is released AFTER the query, BEFORE the booking INSERT"*) — **WRONG, not open.**
  I traced the transaction boundary. `get_overlapping_bookings_count_with_lock`
  (`booking_repository.py:147-174`) issues `SELECT … FROM hardware_tiers WHERE id = :tier FOR UPDATE`
  on the request-scoped `AsyncSession` (`database.py:11-27`, `autocommit=False`). Nothing between that
  statement and `booking_repo.create`'s `await self.db.commit()`
  (`booking_repository.py:357`) commits or rolls back: the promo path deliberately does **not** commit
  (`promotion_service.py:254-264` and its comment), and no other call in
  `create_booking:126-206` touches the connection's transaction. Postgres therefore holds the row lock
  for the entire check-then-insert, and a second concurrent request for the same tier blocks on
  `FOR UPDATE` until the first has committed its booking — at which point it re-runs the count and sees
  the new row. The interleaving the prior audit describes is not reachable. (Two requests on *different*
  tiers are not serialized, but they also don't contend for the same seats — the unenforced venue-wide
  cap is finding 2-7, not a race.)
- **P1-7 / "Refund silent failures" — partially fixed, and a worse case is still open.** The specific
  bug is fixed: `process_refund` no longer fabricates a success on API failure and now returns
  `refund_api_failed` with the reason recorded (`payment_service.py:565-582`), and `cancel_booking`
  logs it as needing manual processing (`booking_service.py:411-413`). Still open: nothing *surfaces*
  that failure to an admin (log line only), and the TTL path never attempts a refund at all — that is
  finding 2-1.

---

## Not covered

- `services/payment_service.py` beyond the booking-adjacent paths — the Razorpay Route split, KYC
  gating, webhook signature verification, and the `mock_signature_valid` bypass at
  `payment_service.py:317-344` all belong to the payments phase. I read them for TOCTOU only. The dev-mode
  signature bypass in particular deserves a hard look from whoever owns payments.
- Authorization depth: I verified café-scoping on the check-in/QR paths I read
  (`owner_service._validate_user_cafe_access:187-222`, `api/v1/bookings.py:107-127`) and found them
  sound — staff are correctly restricted to their own café via `UserRoleMapping` rather than the legacy
  `users.role` column. I did not audit `api/deps.py` or the rest of the endpoint surface.
- Notification/email delivery on the booking lifecycle (`NotificationService`) — only noted where it
  fires inside a transaction.
- `admin_service.force_cancel_booking` — I read only the refund endpoint next to it.
- Load/lock behaviour under real concurrency was reasoned about from the source, not measured. No test
  suite was executed.
- I did not inspect the live production database schema, which matters for finding 2-4.
- Seat *allocation* (assigning specific seat numbers) does not exist in this codebase — `Booking` carries
  only `seats_count` (`models/booking.py:27`) with no seat identifier, so "the same seat number handed
  to two bookings" is not a reachable bug class here. Worth knowing; it also means the café decides
  physical seating at the door.

## Notes for the coordinator

- **The single most valuable fix is 2-2.** It is quietly refusing legitimate bookings today, at every
  café with a mix of short sessions, and nobody would see it as a bug — it presents as
  "SLOT_OVERCAPACITY", which looks like correct behaviour. Fixing 2-2 and 2-3 together in one
  well-tested occupancy function retires most of this report's booking-correctness risk.
- **2-4 needs a human with production database access before anything else.** If prod was built by
  `create_all` (as `scripts/init_local_db.py` does) rather than Alembic, check-in works today and the
  finding is a deploy-reproducibility problem. If prod was built by migrations, check-in is currently
  returning 500s and that should be verified against logs immediately.
- 2-1 is the only P0 and is self-contained — the fix is a few lines in two branches of
  `payment_service.py` plus honest error copy. It should not wait on anything.
- Findings 2-6, 2-7, and the tier/café scoping half of 2-14 share a root cause: **the backend trusts the
  wizard to have already validated café-level rules.** Whoever fixes one should sweep for the pattern.
- 2-2, 2-11, and 2-14 are all "the availability read path and the booking write path compute different
  things". Consider making `/availability` call the same repository function the booking engine uses;
  that structurally retires three findings.
- Phase 3 (payments) should pick up the `mock_signature_valid` dev bypass and the Route
  refund/reversal gap flagged in `payment_service.py:510-527`, both of which I saw but deliberately
  left in scope for them.
