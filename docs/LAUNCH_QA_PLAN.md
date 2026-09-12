# KHELO — Launch QA Execution Plan

**For:** the executing agent (Sonnet) · **Written:** 2026-09-08
**Worktree:** `E:\KHEL-O\.claude\worktrees\manual-cafe-payouts` — run everything from here. Never `cd` to `E:\KHEL-O`.
**Context:** Real café owners onboard TODAY.

---

## ⚑ STATUS: Phases 0, 1 COMPLETE. Phase 2 PARTLY complete. Start at §5 "remaining".

Executed 2026-09-08. Do not redo Phase 0, Phase 1, or the Phase 2 items marked ✅ below.

### Phase 2 progress — 23 invariants written, all passing; full suite 270 passed / 0 failed

Two new test files (run: `& "C:/Program Files/Python313/python.exe" -m pytest tests/test_launch_invariants.py tests/test_launch_invariants_ops.py -q`):
- `backend/tests/test_launch_invariants.py` — money + permissions
- `backend/tests/test_launch_invariants_ops.py` — suspension + payout safety

**🔧 F-1 and F-2 are FIXED** in `backend/app/repositories/booking_repository.py`:
- Added `_EARNED_STATUSES` (confirmed/checked_in/active/completed), now shared by all three owner-facing figures — previously the monthly queries omitted checked_in/active while the daily one included them.
- Added `_owner_settlement_expr()`: sums `PlatformFee.owner_settlement_amount` (via `outerjoin`, coalescing to `base_amount - discount_amount` for legacy rows) instead of `Booking.total_amount`.
- Blast radius was verified contained first: `sum_revenue_today`/`sum_revenue_this_month` are called **only** by `owner_service.get_dashboard_stats` — no admin or analytics consumer. Reproduced before the fix as ₹100 booking → owner shown **₹104**; now ₹100. All 247 pre-existing tests still pass.

| ✅ Done | Result |
|---|---|
| M-01 earnings exclude unpaid/released | PASS — no leakage from pending/failed/cancelled/released/no-show |
| M-02 earnings are settlement not gross | **WAS FAILING (F-1) → FIXED → PASS** |
| M-03 today vs month consistency | **WAS FAILING (F-2) → FIXED → PASS** |
| L-01 fee snapshot immutability | PASS — admin rate change does not rewrite past bookings |
| B-01 cross-owner IDOR, 12 `{cafe_id}` routes | **PASS on all 12** — no data exposure found |
| Owner dashboard isolation | PASS — Owner B sees ₹0 of Owner A's revenue |
| Gamer → owner dashboard | PASS — blocked |
| Owner → `PATCH /admin/settings` | PASS — blocked (cannot zero the platform fee) |
| D-01/D-02 suspended café | PASS — vanishes from discovery, booking rejected `CAFE_NOT_AVAILABLE` |
| D-03/D-04 suspend/resume | PASS — idempotent, non-destructive, restores VERIFIED (not PENDING) |
| AE-02 double payout | PASS — UNIQUE on `platform_fee_id` blocks it |

### M-04 refund path — DONE. New file `backend/tests/test_launch_invariants_refund.py`

Refund mechanics (`payment_service.process_refund`): success → payment `REFUNDED` + booking `CANCELLED`; Razorpay API error → payment stays `CAPTURED`, returns `refund_api_failed`, booking left alone; no `razorpay_payment_id` → returns `no_payment_id`, nothing mutated.

| ✅ | Result |
|---|---|
| M-04a refunded booking leaves earnings | PASS — happy path correct (`CANCELLED` is outside `_EARNED_STATUSES`) |
| M-04b out-of-band refund | **WAS FAILING (F-8) → FIXED → PASS** |
| M-04c unrefundable payment | PASS — stays `CAPTURED`, no fabricated refund id, no false "refunded" claim |
| M-04d record preservation | PASS — booking, payment, platform_fee all survive; settlement unmutated |

**🔧 F-8 FIXED (new finding).** The owner dashboard ignored `Payment.status` entirely: a payment refunded **directly in the Razorpay dashboard** (the normal route for a disputed session) left the booking on a paid status, so the café kept seeing that money as earnings — reproduced as ₹1000 shown where ₹100 was earned. Worse, `/owner/payouts/summary` and `/owner/analytics` *already* exclude refunded payments, so the dashboard reported a **higher** figure than either for the same café. Added `_not_refunded_clause()` + a `Payment` outerjoin to both revenue sums (`Payment.booking_id` is unique, so no row fan-out). Applied to the **money sums only**, not `count_bookings_this_month` — a refunded session still happened, it just did not earn.

**⚠ P2 not fixed — misleading admin refund message.** In `process_refund`'s `refund_api_failed` branch (`payment_service.py` ~line 705) the returned message says *"The booking is cancelled but the customer has NOT been refunded"*, but that branch returns **before** the `status = CANCELLED` update. The claim is true when called from the cancellation flow (the caller cancelled first) and **false** when called from `POST /admin/bookings/{id}/refund`. Operational risk: an admin reads "cancelled", believes the slot is freed, but the customer still holds it. Fix is a message string only — deliberately left alone as it sits in the highest-risk payment file; decide before launch.

### V-01 promotions — DONE. `backend/tests/test_launch_invariants_promotions.py`

**Answer to "can an owner create a 100%-off offer?" — no.** `PromotionBase.discount_percentage` is `Field(..., ge=1, le=50)`, so the API rejects 0, −10, 51, 100 and 150, and accepts 1/5/10/15/50. Free-booking-by-offer is not reachable.

Proved who funds a discount: 10% off ₹100 → café receives **₹90**, KHELO keeps **₹3.60**, customer pays **₹93.60**. The café absorbs the entire ₹10; KHELO gives up only ₹0.40 of fee. Owners must understand this before they create offers.

**🔧 FIXED (defence in depth) — `promotion_service.apply_promotion_to_booking`.** The 1..50 bound lives only in Pydantic; promotion rows are also written by seeds, migrations and admin scripts that bypass it. `apply_promotion_to_booking` multiplied out whatever percentage it found with no clamp, so a row holding >100 produced a discount larger than the booking — **negative subtotal, negative café settlement, negative customer total**. Added a clamp to `base_amount` plus a warning log. Cannot affect any valid promotion (≤50% is always well under base), only stops money going negative on bad data.

### B-01 remainder — DONE. `backend/tests/test_launch_invariants_isolation.py`

**All remaining IDOR surfaces pass. No cross-café data exposure was found anywhere in the API.**

| ✅ Attack attempted by Owner B against Owner A | Result |
|---|---|
| `PATCH/POST /owner/bookings/{id}/status｜checkin｜cancel｜release` | all blocked |
| `GET /bookings/{id}` (read another café's booking detail) | blocked |
| `DELETE /owner/cafes/{cafe_id}/tiers/{tier_id}` | blocked |
| `PATCH /owner/tiers/{tier_id}/confirm-platform` | blocked |
| `GET /owner/bookings?cafeId=<foreign>` (query-param IDOR) | blocked |
| `DELETE /owner/staff/{staff_id}` | blocked |
| `DELETE /owner/staff/invitations/{invitation_id}` | blocked |

Note: `POST /owner/staff/invitations` derives the café from the authenticated owner rather than accepting a `cafeId`, so it has no tamperable surface by construction.

### 🔴 O-01 / N-01 webhook — P0 FOUND AND FIXED. `backend/tests/test_launch_invariants_webhook.py`

N-01's primary race was **already covered** by `test_booking_release.py` (`test_late_verify_payment_after_release_refunds_not_confirms`, `test_late_webhook_after_release_refunds_not_confirms`, `test_released_booking_stops_counting_toward_capacity`, plus release IDOR) — all passing. The gap was the **next** delivery.

**The bug:** `handle_webhook` guarded only `already_confirmed` (payment CAPTURED or booking CONFIRMED), `RELEASED_BY_OWNER`, and TTL expiry (which only tests `PENDING_PAYMENT`). **Every other state fell through to the confirmation block.** Reproduced two ways:

1. **Duplicate webhook after a release-refund** → booking is `CANCELLED` + payment `REFUNDED`, so no guard matched → booking moved back to **CONFIRMED**. The customer had been refunded and the slot released to someone else. This is exactly the "late webhook resurrects a released slot" failure the brief forbids, and it can leave **two valid bookings on one slot**.
2. **Late `payment.captured` on a customer-cancelled booking** → also moved to **CONFIRMED**. This is the everyday version: customer cancels, payment settles a second later, slot was already back on sale.

Razorpay delivers `payment.captured` at-least-once and retries on any non-2xx, so both are normal operation, not edge cases.

**Fix:** in `payment_service.handle_webhook`, refuse to confirm any booking not in `PENDING_PAYMENT`; record the capture and route to the existing (idempotent) refund path, returning `not_confirmable_refunded`. If the payment is already `REFUNDED`, return `already_refunded` without re-marking it CAPTURED — otherwise it would look refundable a second time. This brings the webhook path in line with `verify_payment`, which already rejected these states. All 18 existing payment/release/expiry/uniqueness tests still pass.

### AE-01 ledger + B-03/B-05 role guards — DONE. `backend/tests/test_launch_invariants_ledger.py`

- **Ledger reconciles exactly:** ₹100 session at 4% → customer pays **₹104**, café payable **₹100**, KHELO commission **₹4**; `gross == settlement + fee`, and `settlement < gross` — **no processing cost is counted as café earnings**. Paid vs outstanding tracked separately. Refunded bookings excluded from café payable (so KHELO never pays out money it gave back).
- **All 8 admin routes** (dashboard, cafés, users, bookings, payments, payouts, audit-log, settings) blocked for gamers **and** owners, and reachable by admins — guards are tight without locking real admins out.

### L-03 customer/owner fee wording — PASS

- Customer checkout shows a **"Platform Fee"** line with the rate fetched live from `GET /bookings/platform-fee`. No hardcoded "4% convenience fee" anywhere. ✅
- Owner UI never renders a Razorpay/processing fee — `totalGatewayFees` exists only as a TypeScript type, never displayed. ✅
- **⚠ Flag (business messaging, not code):** `frontend/src/app/(customer)/partner/page.tsx:12` tells prospective owners *"Pay only 3-5% convenience fee on successful bookings."* The implementation charges the **customer** on top and settles the café at the full subtotal — the café pays nothing. Owners who price to absorb a fee that doesn't exist will make KHELO look expensive. Worth correcting before onboarding.

**AE-03 partial refund:** confirmed unrepresentable — `PaymentStatus` has no `partially_refunded` state and `process_refund` always refunds `payment.amount` in full. Documented, not changed.

**Genuinely remaining:** L-02 (covered in substance by L-01), B-06 (browser-side `localStorage.activeRole` tamper — API half proven by B-03/B-04). **N-01/O-01 remain `LOGIC-PASS / CONCURRENCY-UNVERIFIED`** — see §1.6.

---

## ⚑ PHASE 3 STATUS: substantially complete. 5 fixes shipped, 1 test-methodology bug fixed, full regression clean (324/324 backend, project-wide `tsc --noEmit` clean).

### 🔧 Fixture bug found and fixed first — READ BEFORE USING SEEDED OWNER ACCOUNTS

`.test` is an IANA-reserved TLD (RFC 2606). Pydantic's `EmailStr` correctly **rejects** it at `POST /auth/login` with "special-use or reserved name" — so `ownera@khelo.test` etc. could be inserted directly via SQLAlchemy (bypassing Pydantic) but could **never log in through the real API or browser**. Backend pytest fixtures were unaffected (they mint JWTs directly via `auth_headers()`, never calling `/auth/login`), but this silently blocked ALL browser testing with these accounts.

**Fixed:** `backend/scripts/seed_qa_fixture.py` now uses `@example.com`. Re-seed if your local emails still end in `.test`:
```
& "C:/Program Files/Python313/python.exe" -m scripts.seed_qa_fixture
```

| Account | Role | Owns |
|---|---|---|
| `qa.ownera@example.com` | CAFE_OWNER | Café A, Café C, Stress café (all `testpass123`) |
| `qa.ownerb@example.com` | CAFE_OWNER | Café B |
| `qa.gamer2@example.com` | GAMER | — |

**Also:** Chrome autofill on `/login` aggressively re-injects a stale saved credential (`testowner@khelo.com`) on click/focus/fresh-navigate, silently overwriting typed text. **Always verify field contents via screenshot/JS before clicking submit** — this cost real time until caught. Reliable pattern: `click → ctrl+a → type → Tab → ctrl+a → type`, then screenshot to confirm, THEN submit. Do not use `Escape` mid-sequence — it reverts the field to empty.

### B-10 — H-1 role-switch bug: **DOES NOT REPRODUCE.** All three suspect paths are safe.

Tested directly: logged in as owner via `/login`, `localStorage.activeRole` came back `cafe_owner` correctly, both directions of the switcher worked (`Owner→Gamer` and back), confirmed via `find()` on the actual button labels ("Click to switch to Gamer Mode" / "...to Owner Portal").

**Root cause of the false lead:** all three paths I'd flagged as unfixed (`login/page.tsx:70`, `GoogleSignInButton.tsx:59`, `accept-invitation/page.tsx:68`) call `setAuth(res.user, ...)`, which does a **fresh** `activeRole = user.role` write (`authStore.ts:59-70`) — structurally different from the stale-session bug the profile-page fix addressed (navigating to `/owner/*` from an *already-open* session without calling `switchActiveRole`). A fresh login can't have a stale `activeRole` to begin with.

Also read `RoleSyncProvider.tsx`: it correctly updates the `roles` array in the background when a gamer's application is approved, but **deliberately** leaves `activeRole` untouched until the user clicks the switcher — which always calls the authenticated `switchActiveRole()`. This is correct design, not a bug.

**Verdict: the previously-reported regression appears fully fixed.** No further action needed unless you know of a specific remaining trigger path.

### B-11 — switcher under stress: **PASS**, tested twice with real content

100+ char emoji/symbol café name (`Ultra Mega Super Long Café Name For Layout Stress Testing 🎮🕹️👾...`) renders in the page body only — never touches the header — so the switcher, bell, and breadcrumb stay fully intact at both the owner dashboard and the customer detail page. Confirmed via screenshot with real seeded content, not a placeholder.

**⚠ Environment limitation — could not test true narrow viewports.** `resize_window` reports success but the viewport stays fixed at 1920×889 regardless of target (tried 1440×900 → rejected outright; 375×812 and 800×700 → silently no-op). **All of C-01, most of AG (responsive matrix), and any 320/375/390/412px-specific check are BLOCKED, not passed.** Do not report these as PASS from this session. If Sonnet's environment has working resize, redo B-11/C-01 at 320px specifically — the header layout logic looked robust in the DOM but was never visually confirmed below ~1920px.

### 🔧 G-01 — gallery scroll-jump: **P1 FOUND AND FIXED.** Real bug, not fully covered by prior fixes.

**Root cause:** `jumpToPhoto()` in `CafeDetailClient.tsx` called `heroRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })` on every thumbnail tap — confirmed via instrumented `scrollY` reads (1404 → 993, a 357px involuntary scroll on one click). No modal/lightbox existed anywhere in the component: zero `[role="dialog"]`, zero close button, zero swipe support, zero body-scroll-lock. This does not fully match "hard jump to y=0" (smooth-scrolls to the hero, which sits near but not at the top), but it reproduces the core complaint — tap a thumbnail, get yanked away from your scroll position — and meets none of the brief's explicit acceptance criteria (open in place / swipe / close / back-button-safe / no scroll-lock bug).

**Fix — `frontend/src/app/(customer)/cafe/[id]/CafeDetailClient.tsx`:** added a real fixed-position lightbox (new `lightbox` state, `openLightbox/closeLightbox/lightboxNext/lightboxPrev`), wired both the Photos grid (3 thumbnails + "+N More") and the previously **non-interactive** Menu photos section into it. Includes: Escape-to-close, body-scroll-lock via `useEffect` (restores `document.body.style.overflow` on close/unmount), touch swipe (`onTouchStart`/`onTouchEnd`, 40px threshold), prev/next arrows, index counter ("N / total"), backdrop-click-to-close. Hero carousel itself untouched — zero regression risk there.

**Verified in browser, not just code:**
- scrollY unchanged (1404 → 1404) across open/close ✓
- `document.body.style.overflow` → `"hidden"` while open, restored to `""` on close ✓
- Prev arrow correctly wrapped 4→3 ✓
- Escape closed cleanly, lightbox DOM node removed ✓
- Menu photo (previously unclickable) now opens the same lightbox, shows "1/1" (no prev/next arrows for a single image — correct) ✓

**Manual-test flag:** touch swipe is implemented and code-reviewed but only verified via desktop mouse interaction — the `computer` tool has no touch-gesture action. Physical-device swipe testing still belongs in the manual dossier (item 15).

**Test data note:** none of the seeded QA cafés had photos (photo upload needs `AWS_S3_BUCKET`/`AWS_ACCESS_KEY_ID`, which — like SES — are absent from this `.env`). Seeded 4 placeholder photo URLs + 1 menu photo directly onto Café A via a one-off script (not committed, ran once against the dev DB) to get real interactive elements to test against.

### H-01 — menu photos visible to customer: **PASS**

Menu photo rendered correctly on the customer café page after seeding (`Menu` section, real image). Confirms photos surface to customers, not just owner-side storage.

### 🔧 T-01 — leading-zero corruption: **P1 FOUND AND FIXED on the offers page. Reproduced exactly as described** — typed "10" after a clear, field showed "010".

Root cause matched the pattern already documented (and fixed) in `PlatformTierConfigurator.tsx`'s private `NumericField` — but that component was never exported, so the fix never reached `owner/offers/page.tsx` or `owner/onboarding/page.tsx`, both of which still bound raw `<Input type="number">` to numeric state.

**Fix:** extracted `NumericField` into `frontend/src/components/ui/NumericField.tsx` (added to the `ui` barrel export), added a `disabled` prop it didn't have before (needed to preserve `PlatformTierConfigurator`'s existing edit-lock behavior). Rewired:
- `PlatformTierConfigurator.tsx` — now imports the shared version instead of defining its own (behavior-identical, just de-duplicated)
- `owner/offers/page.tsx` — Discount %, Start Hour, End Hour now use `NumericField` (Max Redemptions left as-is: it's stored as a raw string in form state, never round-tripped through `Number()`, so it was never affected by this bug)
- `owner/onboarding/page.tsx` — Total Station Capacity now uses `NumericField`

**Verified in browser:** clear+type "10" → shows "10" (was "010"). Typed "100" against a max=50 field → correctly clamped to "50", confirming the fix didn't break min/max clamping. Full project `tsc --noEmit` clean after the change.

**Note:** two pre-existing, unrelated `gray-on-color` design-lint findings surfaced in `onboarding/page.tsx` (lines ~414, ~902) during editing. Left untouched — out of scope per "do not make broad UI redesigns or unrelated refactors."

### U-01 — Add Tier UX: **PASS**, fully verified live

Single `+` icon on "Add Tier" (no duplicate). Selecting an activity (tested: Arcade) immediately expands its detail fields inline — no second click on the activity selector needed, matching the brief's expected flow exactly. Submitted a real tier: toast "Hardware tier created," new tier appeared at the **top** of the list with a highlighted border (the existing `justAddedId` affordance), existing "Standard" tier pushed to second — no page refresh involved.

### F-01 — Google Maps external link: **PASS, clean**

Despite the misleading name, `GoogleLocationDisplay.tsx` is a plain `<a href={googleMapsUrl} target="_blank">` — explicit code comment: *"Deliberately does not load the Google Maps JavaScript API, Places API, or any geocoding."* Confirmed via `read_network_requests` on a fresh page load: **zero requests to any `google` domain.** Blank `googleMapsUrl` degrades gracefully (button simply doesn't render, `{googleMapsUrl && (...)}`). The booking detail page's "Get Directions" (`bookings/[id]/page.tsx:211`) reads the same `cafeDetail.googleMapsUrl` and additionally validates it against `GOOGLE_MAPS_URL_PATTERN` before rendering — a malformed URL degrades safely rather than opening a broken/unsafe link. No code changes needed.

### 🔧 V-02 / F-3 — offer display + visibility: **P2 FOUND AND ACTUALLY FIXED THIS TIME.**

**Correction to my own earlier report:** an earlier turn in this session (before Phase 2) *identified* F-3 (`<Percent/>` icon + text reading as "% 15% OFF") and reported it as "fix is one line," but the plan's Phase 2 execution stayed entirely backend-side and the frontend edit was never actually applied. I caught this only because I verified the live-rendered badge rather than trusting the earlier note — it still showed "% 15% OFF" when I checked. **Lesson applied: verify claimed fixes against actual rendered/compiled output, not just against what a plan document says was done.**

**Fixed now, for real:** removed the `<Percent/>` icon from the offer card badge in `owner/offers/page.tsx` (and the now-unused `Percent` import). Confirmed the other two `% OFF` render sites (`CafeDetailClient.tsx:372`, `HardwareTierCard.tsx:76`) use a `Tag` icon, not a percent glyph — visually distinct, not the same bug, left alone.

**End-to-end verified live**, not just the icon fix in isolation: created a real offer (15% off, all tiers, every day, 0:00–24:00) as `qa.ownera@example.com`. Owner list now shows clean "15% OFF" (was "% 15% OFF"). **Discovered my offer initially landed on the wrong café** (the stress café, since that was the active owner-portal café context at creation time, not Café A as I'd assumed) — corrected the verification target rather than mis-reporting a false negative. On the correct café's customer page: tier card shows "🏷 15% OFF · QA Test Offer" with **correctly computed strikethrough pricing** (₹100 → ₹85/hr, i.e. exactly 15% off). Confirms the full owner-creates → customer-sees → price-applies pipeline works. Redemption-count-on-booking was not tested (would need a full paid booking) — remains open if time allows.

### Regression safety

- Full backend suite: **324 passed, 0 failed** (unchanged from Phase 2 — frontend-only changes this round).
- Full-project `npx tsc --noEmit`: **zero errors**, checked after every file change, not just at the end.
- DB baseline re-snapshotted at `backend/khel_o.db.baseline` (368KB) to include the new photos + offer fixtures for continued testing.

### 🔧 W-01 — analytics: **NO dummy data, but 3 REAL bugs found and fixed.** `backend/tests/test_launch_invariants_analytics.py` (9 tests)

**The dummy-data question is settled: there is none.** The grep for `mockData|dummy|placeholder|TODO|hardcoded|1.2 km|Math.random|fake` over the analytics page returns nothing, and `analytics/page.tsx` is 100% API-bound — all 7 metrics come from `getOwnerAnalytics()`, with honest empty states ("No paid bookings yet", "No game data recorded on bookings yet") rather than invented samples. Pinned by tests so it can't regress: a café with no bookings returns zeros/empty arrays, and `topGames` stays empty when no booking records a game.

But "not fabricated" is not the same as "correct". Auditing each metric against its DB source found three genuine defects:

**🔴 1. F-1 RECURS IN ANALYTICS (P1, money).** `get_owner_analytics` summed `Booking.total_amount` — the **customer's** bill, KHELO's platform fee included — into both "Revenue by Hardware Tier" and "Revenue Trend". Reproduced: a ₹100 session at 4% displayed as **₹104**.

Phase 2's blast-radius check was right that `sum_revenue_today`/`sum_revenue_this_month` have no analytics consumer — but analytics computes revenue **independently**, so the F-1 fix never reached it. Net effect: three owner-facing screens disagreed about the same booking — dashboard ₹100 (fixed), payouts/summary ₹100 net (correct), analytics ₹104. `/owner/payouts/summary` gets this right **in the same file** at line ~1183 (`gross` vs `net = fee.owner_settlement_amount`), which is what made the outlier obvious.

**Fix:** outer-joined `PlatformFee` and added `_owner_settlement()`, coalescing to `base_amount − discount_amount` for legacy rows — same contract as `booking_repository`. `Payment.booking_id` is `unique=True` (verified) so neither join fans rows out.

**🔴 2. Occupancy counted only the start hour (P2, accuracy).** `seats_by_hour[b.start_time.hour] += b.seats_count` — an 18:00–21:00 booking registered at 18:00 only. A café fully booked 18:00–21:00 reported **"No booking activity"** for 19:00 and 20:00, while the UI labels the metric "Busiest Operating Hours" / "Peak Occupancy" — the number owners would staff against. Overnight sessions lost every hour past midnight. **Fix:** `_hours_touched()` walks `duration_hours` forward from the start hour mod 24, which also handles rollover (22:00 + 4h → 22, 23, 0, 1) without end_time math.

**🔴 3. Revenue trend window anchored on UTC (P2).** Line 1383 used `datetime.now(timezone.utc).date()` while `session_date` is an **IST** wall-clock date. `app/core/time.py` opens by forbidding exactly this ("must be interpreted as IST, never as UTC ... can never define their own IST constant and drift apart"), and **five other sites in the same file** already use `datetime.now(IST).date()` — 1383 was the lone outlier. For the 5.5h nightly window where IST is a date ahead, the whole 7-day chart shifted back a day and silently dropped the current day's revenue — during 00:00–05:29 IST, prime time for a gaming café. **Fix:** anchored on `IST`.

**Test methodology note:** the IST test initially *passed* against the buggy code, because UTC and IST happened to share a date when the suite ran — a test that would only have caught the bug at night. Rewritten to freeze the clock at 02:00 IST on 2026-03-15 (still 2026-03-14 UTC), it now reproduces deterministically. Verified by reverting the one line: `trend ends at 2026-03-14, but 'today' in IST is 2026-03-15`. All three fixes were confirmed fail-before/pass-after.

**Regression:** full backend suite **333 passed / 0 failed** (324 + 9 new).

### R-01 — notifications: **PASS** on all four mechanics. Two gaps reported, not fixed.

Verified live as `qa.ownera@example.com` against 4 seeded rows (2 unread):

| Check | Result |
|---|---|
| Clear All at 0 / 1 / many | PASS — button is hidden entirely when the list is empty; cleared 4 → 0 |
| Unread counts | PASS — badge "1 unread" matched `GET /notifications/unread-count` exactly; decremented 2 → 1 on read |
| Click-through routing (owner→owner) | PASS — `/owner/notifications` → `/owner/bookings?ref=…`, stayed inside the owner shell |
| No dead links | PASS — a nonexistent ref renders "No Bookings Found", no crash |

Routing is correct **by construction**, which is stronger than the click proves: all five in-app `Notification` writes in the backend target `cafe.owner_id` with `/owner/bookings?ref=…`, except the staff invite, which targets the invitee with the shell-agnostic `/accept-invitation?token=…` (guarded by `if target_user:`, so no orphan row). Backend queries are all scoped by `user_id` — no IDOR — and `DELETE /clear-all` is declared **before** `DELETE /{notification_id}`, so it isn't swallowed as a UUID.

**⚠ Gap 1 (P1, product) — customers never receive an in-app notification at all.** Every `Notification` row created anywhere in the backend goes to an owner or a staff invitee; **zero** are created for a gamer. Yet the customer ships `(customer)/notifications/page.tsx` (267 lines) and `NotificationCenter.tsx` (153 lines). Those surfaces are permanently empty for a real customer. Combined with the **email P0** (SES silently disabled), a customer who books and pays today receives **no confirmation through any channel** — only the on-screen success state and QR pass. Not fixed: wiring this is feature work with product decisions (which events, what copy, what links) and it touches `payment_service.py`, the highest-risk file. Recommend mirroring the existing `_notify_owner` call sites for the gamer with a `/bookings/{id}` link.

**⚠ Gap 2 (P2, UX) — "Clear all" has no confirmation.** `onClick={() => clearAllMutation.mutate()}` fires an irreversible hard delete (`db.delete`, not a soft flag). Confirmed empirically: 4 rows went to 0 in ~1.5s with no interstitial. One mis-tap destroys the owner's whole notification history.

**⚠ Dev-environment only, needs staging check — notification timestamps read 5h30m stale.** The API returned `"2026-09-08T14:05:24.332161"` with **no timezone suffix** for a row created at 19:36 IST, so the browser's `new Date()` read the UTC instant as local and displayed **2:05 PM**. Root cause is SQLite dropping tzinfo from `DateTime(timezone=True)`; on production **Postgres `TIMESTAMPTZ` this should serialize as `+00:00` and render correctly**, so per §1.6 this is reported, not "fixed" — a naive frontend correction would double-correct and *introduce* a production bug. Verify on Postgres staging; if it reproduces there, the fix is to force an explicit offset in `NotificationResponse`.

### I-01 — booking flow totals: **PASS**, UI and backend agree exactly

Checkout for 2 hr × 1 seat on a ₹100/hr tier displayed **₹200 base · Platform Fee ₹8.00 · Total ₹208**, and the same figure rendered identically in both the summary and the confirm bar. The API, called independently with the same parameters, returned `baseAmount 200, gatewayFee 8, totalAmount 208` — **the customer is charged exactly what they are shown.** A second combination (1.5 hr × 3 seats → 450 / 18 / 468) and a third (0.5 hr × 6 seats → 300 / 12 / 312) confirm the §1.1 formula generalizes rather than coinciding on round numbers. Fee is labelled **"Platform Fee"** with no hardcoded percentage, satisfying L-03. Seats correctly cap at 6, matching the API's `seatsCount` bound. All test bookings were cancelled afterwards; 0 pending remain.

### 🔧 J-01 — timeline drag: **P1 FOUND AND FIXED (UI allowed unbookable sessions).** Drag mechanics themselves PASS.

The drag behaviour is well-engineered and passes every criterion: 3 pointer handles (pan/start/end) using `onPointerDown` (one code path for mouse *and* touch), `touchAction: 'none'` on the handles so **dragging does not scroll the page** (verified: `scrollY` unchanged across an 1800px drag), `touchAction: 'pan-x'` on the container so **normal page scroll still works** (verified: 0 → 52), and 44px (`h-11 w-11`) touch targets.

**The bug was the duration ceiling.** `TimelineRangePicker` capped duration at **16 hours** while the API enforces `duration_hours: Field(..., ge=0.5, le=8.0)` — re-checked in `booking_service.py:99`. Nothing but the café's closing time stopped a customer going past 8.

Reproduced end to end on Café A (open 09:00–23:00): clicking "+" built an **840-minute (14 hr)** session and the UI quoted **₹8,400 + ₹336 = ₹8,736**. Posting that exact selection returned **`422 VALIDATION_ERROR — "Input should be less than or equal to 8"`**. A customer could be quoted a price for a session the server will always refuse — a hard dead end in the primary revenue flow.

**Fix — `frontend/src/components/customer/TimelineRangePicker.tsx`:** added `MAX_DURATION_HOURS = 8` / `MAX_DURATION_MIN`, documented as mirroring the API contract, and applied it at **all four** places duration could grow — the stepper clamp (`Math.min(16,…)`), the "+" disable condition, **and both drag handles**, which had *no* upper clamp at all (only the stepper was obvious; the handles would have kept the bug alive). Verified after the fix: "+" stops at exactly **480 min = 8 hr**, dragging the end handle 1800px right holds at 480, and the API returns **201** for the UI's new maximum — the two limits now agree. Money still correct at the cap (8 hr → ₹800 + ₹32 = ₹832).

**Not verified:** "booked/unavailable slots unselectable" — the component computes segment states from `bookedSlots` with a legend and per-segment `aria-label`, but exercising it needs a confirmed booking on that tier/time; belongs in the manual dossier.

### Y-01 — sticky bar occlusion: **PASS** (an earlier in-session claim of a bug was wrong)

At full scroll-bottom the sticky "Book now" bar occupies 857–945px. The last content leaf ends at **856px** — 1px above it — with **zero** occluded text leaves and **zero** occluded controls, including the Reviews section's "Submit Review" button. The deliberate `pb-20 md:pb-12` clearance on `CafeDetailClient` is correctly sized and its explanatory comment is accurate.

**Methodology note:** a first pass using `document.elementsFromPoint` reported the Reviews section as occluded. That was a **false positive** — `elementsFromPoint` also returns large ancestor containers whose `innerText` includes text located elsewhere on the page. Re-measuring with leaf elements only (`children.length === 0`) and comparing bounding rects against the bar overturned it. Recording this because the same mistake would have shipped a bogus P1.

### Regression safety (this round)

- Full backend suite: **333 passed / 0 failed** (324 + 9 new analytics invariants).
- Full-project `npx tsc --noEmit`: **zero errors** after the TimelineRangePicker change.
- Playwright: **17 passed / 7 failed / 1 skipped** — up from 16 passed. All 7 failures are the pre-existing known set (4 `e2e/manual-only/` visual specs, `emergency_mode`, `owner_onboarding:36`, `ticket7:10`'s stale post-register assertion). **None are in the booking flow.**

### Still open for Phase 3

- **Booked/unavailable slot selection** (J-01 sub-item) — needs a real confirmed booking on the tier; manual dossier
- **Redemption-count-on-booking** for offers (V-02 remainder) — needs a completed paid booking
- All narrow-viewport work (320/375/390/412px) — blocked by the resize_window environment issue above; needs re-attempting in an environment where window resize actually works

---

**Phase 0 — environment (DONE)**
- Frontend (PID from `next start-server`) and backend both confirmed serving **this worktree**. The backend originally on :8000 was serving the **main checkout**; it was killed and restarted from here. `BASE_DIR` and `DATABASE_URL` verified to resolve to `…/manual-cafe-payouts/backend/khel_o.db`.
- Backend now runs **without `--reload`**. If you want your fixes to hot-apply, restart it with `--reload`. Note: `--reload` spawns a `multiprocessing-fork` child that keeps port 8000 bound after you kill the parent — kill the child too.
- Baseline snapshot exists at `backend/khel_o.db.baseline` (taken **after** seeding). Restore: `Copy-Item backend/khel_o.db.baseline backend/khel_o.db -Force`.
- **Fixture seeded** via new idempotent script `backend/scripts/seed_qa_fixture.py` (re-run: `& "C:/Program Files/Python313/python.exe" -m scripts.seed_qa_fixture`). All passwords `testpass123`:

| Account | Role | Owns |
|---|---|---|
| `ownera@khelo.test` | CAFE_OWNER | Café A `7e369990-0d8b-485a-a7af-181edef084fb`, Café C `bef4f1f5-19e1-4bcc-b46a-c5f39321e5dd`, Stress café `1122f403-7903-42d5-a2bd-f70b965d0776` |
| `ownerb@khelo.test` | CAFE_OWNER | Café B `7c689f33-2c9f-4df9-8e95-16e6eca47d3b` ← **suspend target for D-tests** |
| `gamer2@khelo.test` | GAMER | — |

> **B-01 setup is ready:** Owner B must NOT be able to reach Café A. Every café has a `Standard` tier at ₹100/hr, `google_maps_url` set, opening 09:00–23:00.

**Phase 1 — existing suites (DONE)**
- **Backend pytest: 247 passed, 0 failed (82s).** Entirely green. Your blocker list is NOT in the backend suite — which means **F-1 and F-2 are genuine coverage gaps**. `test_owner_dashboard_earnings_bugfix.py` cannot catch F-1 because its fixture sets `gateway_fee=0.0`, making `total_amount == base_amount`.
- **Playwright was completely broken and ran ZERO tests** — a `test.use({browserName})` inside a `describe` in `ticket7.spec.ts` failed collection for the whole suite. **Fixed** (removed; the config's `chromium` project already sets it). Suite now collects 25 tests in 10 files.
- Playwright after fix: **16 passed / 8 failed / 1 skipped**. 4 failures were in `e2e/manual-only/` (visual specs). Of the 4 real ones:
  - `admin_approval.spec.ts` — **was stale, now FIXED and PASSING.** It navigated to `/admin`, but the queue moved to `/admin/verification-queue`. **Admin café approval is confirmed working.**
  - `ticket7.spec.ts` — **stale by design.** Asserts `waitForURL('**/login')` after registering, but `register/page.tsx:84-94` now redirects to `redirectPath`/`returnPath`/`/` (auto-login). Update the assertion; not a product bug.
  - `emergency_mode.spec.ts` — **STILL OPEN.** `TypeError: Cannot read properties of null (reading 'cafe')` — test-side null deref, likely its setup call returned null. Triage this.
  - `owner_onboarding.spec.ts:36` — **STILL OPEN.** `page.waitForURL` timeout for a pending owner. Triage this.
- **Do not pipe Playwright through `tail`** — the pipe buffers and you see nothing until it exits. Redirect to a file instead.

**Prior audit (`LAUNCH_READINESS_AUDIT.md`) triage — its line numbers are STALE; the code moved. Verdicts:**

| Item | Verdict |
|---|---|
| P0-1 scanner cache invalidation | **FIXED** — `invalidateQueries` on owner + bookings keys, `scanner/page.tsx:531-532` |
| P0-2 booking race condition | **FIXED in design** — `get_overlapping_bookings_count_with_lock` uses `with_for_update()` on Café + Tier. **⚠ `with_for_update()` is a silent NO-OP on SQLite** — correct for Postgres, *unverifiable locally*. See §1.6. |
| P0-3 dead Google OAuth | **FIXED** — real `GoogleSignInButton` wired |
| P0-4 dead Edit Café button | **LIKELY FIXED** — settings page has working Edit Profile; confirm at runtime |
| P0-5 silent error swallowing | **FIXED** — errors propagate via `normaliseError` |
| P1-1 hardcoded 1.2 km distance | **FIXED** — no occurrences remain |
| P1-3 mock rewards | **FIXED** — fake voucher codes replaced |
| P1-5 no delete-tier API | **FIXED** — `DELETE /owner/cafes/{cafe_id}/tiers/{tier_id}` exists |
| P1-6 RoleSync doesn't poll | **FIXED** — `setInterval(syncRoles, 30_000)` |
| P1-7 refund silent failures | **FIXED** — returns `refund_api_failed` + "process this manually" message |
| P1-8 audit logging incomplete | **LARGELY FIXED** — 15 write sites (was "only staff.revoke") |
| P1-4 owner notifications missing | **STILL OPEN** — `notification_service.py` has only customer emails + staff invite + password reset. **No owner-facing email notifications.** |

**🔴 NEW P0 (config, not code) — EMAIL IS SILENTLY DISABLED**
`notification_service._send_resend_email` is a legacy name that **sends via AWS SES**, and returns `False` with only a warning when AWS credentials are absent. **This `.env` has NO `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `SES_SENDER_EMAIL`, or `AWS_REGION`** — only a now-unused `RESEND_API_KEY`. So **every email silently no-ops here**: booking confirmations, password resets, staff invitations. Verify production `.env` has real SES config before onboarding, or no owner or customer receives anything. Also resolves the plan's earlier SES-vs-Resend ambiguity: **SES is live.**

---

## 0. Quota discipline — read first, obey throughout

This document contains every fact you need. **It was written by an agent that already read the codebase so you don't have to.** Rediscovering anything in §1 is wasted budget.

**Hard rules:**

1. **Do not re-explore.** §1 has the money model, enums, full endpoint tables, credentials, and file:line references. Trust them.
2. **Never read a file whole.** Every file reference below has a line number — read with `offset`/`limit` (±40 lines). `owner.py` is 2400+ lines; `LAUNCH_READINESS_AUDIT.md` is 1111.
3. **Screenshots only on failure.** For content checks use `get_page_text`. For state checks use `javascript_tool`. A screenshot costs ~100× a text read.
4. **Prefer API over browser.** If a property is observable via `curl` or pytest, it does not belong in the browser phase.
5. **Batch tool calls.** Independent commands go in one message. Load all Chrome tools in ONE `ToolSearch` call.
6. **Stop after 3 failed attempts** at any single action. Record as BLOCKED, move on, report it.
7. **Write results to the matrix as you go.** Do not hold them in context.

**Stop and escalate — do not attempt:** any schema migration, any change to the `PaymentStatus`/`BookingStatus` enums, any deletion of booking/payment/platform_fee/payout rows, any fix requiring redesign of a page.

**Fix authority (owner-granted):** fix anything you're confident about, **including financial logic**, report after. Every financial fix ships with a test that fails before and passes after. Never mutate historical financial records to make a test pass.

**Priority order:** money correctness → permission isolation → named UX bugs → cosmetic. Stop and report a P0 the moment you find one.

---

## 1. Reference facts (do not rediscover)

### 1.1 Money model — `backend/app/services/booking_service.py:150-240`

```
base_amount   = tier.price_per_hour × duration_hours × seats_count
discount      = promotion discount (0 if none)
subtotal      = base_amount − discount
gateway_fee   = round(subtotal × PlatformSetting.platform_fee_percentage / 100, 2)
convenience_fee = 0.00                              (retired; kept at 0)
total_amount  = subtotal + gateway_fee              ← customer pays
owner_settlement_amount = subtotal                  ← café receives
```

**Naming trap:** `gateway_fee` holds **KHELO's platform revenue**, NOT Razorpay's cost. Code treating it as a processing cost is wrong.

Derived truths you must test, not re-derive:
- The **café absorbs 100% of every promo discount** (`owner_settlement = base − discount`).
- A **100% discount** ⇒ `subtotal = 0`, `total = 0`, café paid ₹0, seat still consumed.
- **No field records Razorpay's actual processing cost.** §AE's "Razorpay Cost" is uncomputable today. Report; do not add schema.
- `tds_amount` is hardcoded `0.00`.

### 1.2 Enums — use these exact strings

| Enum | Values | File |
|---|---|---|
| `BookingStatus` | `pending_payment`, `confirmed`, `checked_in`, `active`, `cancelled`, `completed`, `no_show`, `failed`, `released_by_owner` | `app/models/booking.py` |
| `PaymentStatus` | `created`, `captured`, `failed`, `refunded` | `app/models/payment.py` |
| `CafePayoutStatus` | `pending`, `processing`, `paid`, `failed`, `cancelled` | `app/models/cafe_payout.py` |

**`PaymentStatus` has no `partially_refunded`.** §M's partial-refund test is unrepresentable. Report as a gap; do not add an enum value today.

### 1.3 Endpoint inventory

All paths prefixed `/api/v1`. **Pydantic schemas use `alias_generator=to_camel, populate_by_name=True` — requests accept BOTH `camelCase` and `snake_case`.**

**Auth** — `POST /auth/register`, `/auth/login`, `/auth/google`, `/auth/refresh`, `/auth/switch-role`, `/auth/accept-invitation` · `GET /auth/me` · `PATCH /auth/me`

**Booking / payment**
- `POST /bookings` — body: `cafeId, hardwareTierId, sessionDate, startTime, durationHours (0.5–8.0), seatsCount (1–6), game?, promotionId?, promoCode?, notes?`
- `GET /bookings` · `GET /bookings/{id}` · `POST /bookings/{id}/cancel` · `GET /bookings/{id}/qr-pass`
- `GET /bookings/platform-fee` ← **customer-facing fee endpoint; check §L wording here**
- `POST /payments/create-order` · `POST /payments/verify` · `POST /payments/webhook`

**Admin (fee config + suspend/resume + refund)**
- `GET /admin/settings` · **`PATCH /admin/settings`** ← changes `platformFeePercentage`
- `PATCH /admin/cafes/{cafe_id}/suspend` · `PATCH /admin/cafes/{cafe_id}/reactivate`
- `POST /admin/bookings/{booking_id}/refund` · `PATCH /admin/bookings/{booking_id}/force-cancel` · `PATCH /admin/bookings/{booking_id}/release`
- `GET /admin/dashboard` · `/admin/cafes` · `/admin/users` · `/admin/bookings` · `/admin/payments` · `/admin/payouts` · `/admin/audit-log`
- `PATCH /admin/users/{user_id}/role` · `/deactivate` · `/activate`

**Owner** — `GET /owner/dashboard`, `/owner/bookings`, `/owner/analytics`, `/owner/settings`, `/owner/status`, `/owner/occupancy`, `/owner/availability-timeline`, `/owner/payouts/summary`, `/owner/payouts/status`, `/owner/payouts/cafe-payouts`, `/owner/staff`

**⚠ Cross-owner IDOR attack surface — these 20 take a resource id. This IS test B-01. Copy this list; do not re-derive it.**

```
POST   /owner/cafes/{cafe_id}/emergency-close
PATCH  /owner/cafes/{cafe_id}/emergency-mode
PATCH  /owner/cafes/{cafe_id}/booking-controls
POST   /owner/cafes/{cafe_id}/pause-bookings
POST   /owner/cafes/{cafe_id}/resume-bookings
PATCH  /owner/cafes/{cafe_id}/hours
PATCH  /owner/cafes/{cafe_id}/pricing
PATCH  /owner/cafes/{cafe_id}/details
DELETE /owner/cafes/{cafe_id}/tiers/{tier_id}
POST   /owner/cafes/{cafe_id}/photos/presign
DELETE /owner/cafes/{cafe_id}/photos
POST   /owner/cafes/{cafe_id}/menu-photos/presign
DELETE /owner/cafes/{cafe_id}/menu-photos
PATCH  /owner/bookings/{booking_id}/status
POST   /owner/bookings/{booking_id}/checkin
POST   /owner/bookings/{booking_id}/cancel
PATCH  /owner/bookings/{booking_id}/release
PATCH  /owner/tiers/{tier_id}/confirm-platform
DELETE /owner/staff/invitations/{invitation_id}
DELETE /owner/staff/{staff_id}
```

### 1.4 Credentials & environment

All seeded passwords: **`testpass123`** (`backend/scripts/seed_test_accounts.py`)

| Email | Role |
|---|---|
| `test@example.com` | GAMER |
| `pending@example.com` | GAMER (owner application pending) |
| `owner@example.com` | CAFE_OWNER |
| `staff@example.com` | STAFF |
| `admin@example.com` | ADMIN |

- Backend deps are on **system Python**: `"C:/Program Files/Python313/python.exe"`. **No venv exists** in this worktree or in `E:\KHEL-O\backend`.
- Dev DB: `backend/khel_o.db` (SQLite). Pytest uses a **separate** `backend/test_khel_o.db` (`tests/conftest.py`) — Phase 2 will not disturb browser data.
- `ENVIRONMENT=development`, Razorpay `rzp_test`.
- Frontend auth state lives in **plain localStorage keys**: `accessToken`, `refreshToken`, `user`, `activeRole`, `roles` (`frontend/src/store/authStore.ts:63-98`).

### 1.5 Test fixtures — `backend/tests/conftest.py`

- `db_session` (fixture) · `async_client` (fixture, httpx ASGITransport)
- `create_test_user(db, email=None, role=UserRole.GAMER, full_name=..., password="password123", cafe_id=None)` — **does not commit; caller must.** Always adds a `gamer` role mapping.
- `auth_headers(user, is_admin=False)` → `{"Authorization": "Bearer ..."}`

### 1.6 The environment limit you must not paper over

**Local is SQLite; production is PostgreSQL.** Every concurrency scenario — double-booking, simultaneous bookings, duplicate webhooks, release/late-payment (§N) — depends on row-locking semantics that **differ**.

Report all such results as **`LOGIC-PASS / CONCURRENCY-UNVERIFIED`**, never plain PASS, and escalate each into the manual dossier as a required Postgres staging test.

---

## 2. Findings already filed

### 2.1 CONFIRMED by source reading — verify, then fix

| ID | Sev | Finding |
|---|---|---|
| **F-1** | **P0 cand.** | Owner revenue sums `Booking.total_amount`, which **includes KHELO's platform fee** — `backend/app/repositories/booking_repository.py:345-385` (`sum_revenue_today`, `sum_revenue_this_month`). Owners are shown money they will never receive. Correct source: `PlatformFee.owner_settlement_amount`. Test **M-02**. |
| **F-2** | P1 | Same file: `sum_revenue_today` counts `confirmed, checked_in, active, completed`; `sum_revenue_this_month` and `count_bookings_this_month` count only `confirmed, completed`. A live session inflates "today" but vanishes from "this month". Test **M-03**. |
| **F-3** | P2 | `% 15% OFF` is real — a `<Percent/>` icon at `frontend/src/app/(owner)/owner/offers/page.tsx:317` precedes `{p.discountPercentage}% OFF` on line 318. **Fix: delete the icon on 317.** |
| **F-4** | P1 | Only **one** owner is seeded. Cross-owner isolation is untestable until you create **Owner B + Café B**. Mandatory for B-01. |
| **F-5** | P2 | `PlatformSetting.commission_percentage` (default 10.0) is documented in-code as "not-yet-wired"; `platform_fee_percentage` (default 4.0) is live. Grep: `grep -rn "commission_percentage" backend/app/` — any analytics/report reading it is silently wrong. |
| **F-6** | P1 | Leading-zero fix (`NumericField`) covers only `PlatformTierConfigurator.tsx`. Raw `<input type="number">` remains at `owner/offers/page.tsx:458,503,513,549` and `owner/onboarding/page.tsx:734`. Test **T-01** there. |
| **F-7** | Infra | `frontend/playwright.config.ts` webServer points at `..\backend\venv\Scripts\python`, **which does not exist**. Playwright works only while the backend is already running (`reuseExistingServer: true`). Do not misread this as a test failure. |

### 2.2 Already FIXED — verify only, do not "re-fix"

- **Leading-zero `010`/`0010`**: `NumericField` in `frontend/src/components/owner/PlatformTierConfigurator.tsx:16-40` keeps a text buffer specifically for this.
- **Duplicate `+ + Add Tier`**: `owner/tiers/page.tsx:325` shows a single `<Plus/>` + label. May already be fixed, or `Button` injects a second icon — **verify visually before editing**.
- **Fee snapshot**: `PlatformFee.fee_percentage_applied` exists and is documented as authoritative for historical bookings.
- **Double-payout**: `CafePayoutItem.platform_fee_id` is **UNIQUE**.
- **Release frees capacity**: `released_by_owner` is excluded from `get_overlapping_bookings_count`.

### 2.3 HYPOTHESES — test these first in Phase 3

**H-1 — the reported role-switch regression (highest value).**
`RoleSwitcher` (`frontend/src/components/layout/RoleSwitcher.tsx`) returns `null` unless the user holds 2+ of `[gamer, cafe_owner, staff]`. It renders in **both** shells (CustomerShell:105, OwnerShell:174/286/377) — so it is not missing.

Mechanism, documented at `frontend/src/app/(customer)/profile/page.tsx:50-62`: navigating to `/owner/*` **without** `switchActiveRole` leaves `activeRole='gamer'`. The owner AuthGuard lets `gamer` through (onboarding funnel), so the portal renders — but `RoleSwitcher` reads `activeRole`, thinks it's in Gamer Mode, and offers to switch **to** Owner (a no-op) instead of back. That is exactly "worked one way, reverse control disappeared."

Profile page was fixed. **Still-unfixed suspects doing bare `router.push`:**
- `frontend/src/app/(auth)/login/page.tsx:70` ← **prime suspect: an owner simply logging in**
- `frontend/src/components/auth/GoogleSignInButton.tsx:59`
- `frontend/src/app/(auth)/accept-invitation/page.tsx:68`

**Fix pattern:** `await switchActiveRole('cafe_owner')` before `router.push`, mirroring `handleGoToOwnerPortal` in `profile/page.tsx:63-73`.

**H-2** — seeded/real owner accounts may lack `gamer` in `roles`, hiding the switcher entirely. (Test-created users always get it, so pytest will not reveal this.) Check `GET /auth/me` for `owner@example.com`.

**H-3** — `activeRole` is client-tamperable. `authStore.ts:16-19` notes `localStorage.activeRole='admin'` would render the admin shell. Shell rendering is cosmetic; **the backend must still 403**. Test **B-06**.

---

## 3. Phase 0 — Environment truth (≤15 min, blocking)

**0.1 — Confirm the running servers serve THIS worktree.** `:3000`/`:8000` were already up and may be serving the **main checkout** — if so, every fix appears not to work.

```powershell
# from worktree root
curl -s -o NUL -w "fe:%{http_code} " http://localhost:3000; curl -s -o NUL -w "be:%{http_code}`n" http://localhost:8000/docs
```
Restart both from this worktree:
```powershell
# backend/  →
& "C:/Program Files/Python313/python.exe" -m uvicorn app.main:app --port 8000 --reload
# frontend/ →
npm run dev
```
Verify by making a trivial visible change and reverting it. **Do not proceed until confirmed.**

**0.2 — Snapshot the DB.** This is your one-second restore between destructive scenarios. Use it liberally.
```powershell
Copy-Item backend/khel_o.db backend/khel_o.db.baseline -Force     # save
Copy-Item backend/khel_o.db.baseline backend/khel_o.db -Force     # restore
```

**0.3 — Seed.** Existing accounts in §1.4. You must **additionally** create:
- **Owner B + Café B** — mandatory for B-01 (F-4).
- **Cafés A, B, C** under known owners for the suspend/resume matrix.
- **A stress café**: 100+ char name with emoji and symbols (for C-01/B-11).

Reuse `backend/scripts/`: `seed_test_accounts.py`, `seed_test_cafes.py`, `create_cafe_owner.py`, `purge_and_reseed.py`. **Re-snapshot the baseline after seeding.**

---

## 4. Phase 1 — Run existing suites (≤20 min, highest signal per minute)

**Do this before writing or fixing anything.** 55 backend test files and 9 Playwright specs already cover much of the brief. If they're red, that IS the blocker list.

```powershell
# backend/
& "C:/Program Files/Python313/python.exe" -m pytest tests/ -q --tb=line
# frontend/  (backend must already be running — F-7)
npx playwright test
```

Use `--tb=line` first. Only re-run individual failures with `--tb=short`.

Directly relevant existing tests: `test_payment_uniqueness`, `test_payment_signature_security`, `test_payment_flow_bugs`, `test_payment_expiry_refund`, `test_privilege_escalation`, `test_role_guards`, `test_role_switcher`, `test_booking_release`, `test_google_maps_url_validation`, `test_menu_photos`, `test_overnight_rollover_fix`, `test_owner_dashboard_earnings_bugfix`, `test_owner_payout_summary_bugfix`, `test_refund_already_paid_out_warning`, `test_cafe_payout_repository`, `test_checkin_window`, `test_khelo_promo_codes`.

**Triage each failure:** real regression vs stale/environmental. Payment/permission regressions are automatic P0.

**Also triage the prior audit** — `LAUNCH_READINESS_AUDIT.md` lists 5 P0s and 8 P1s. **Read only §1 (Executive Summary, ~lines 24-60) via offset/limit** — do not read all 1111 lines. Several appear already fixed. Mark each fixed / still-open.

---

## 5. Phase 2 — Money & permission invariants (~90 min, the core)

Create **one** file: `backend/tests/test_launch_invariants.py`.

### 5.1 Copy-paste scaffold (verbatim from a passing test — do not re-derive)

```python
"""Launch-day invariants: money correctness and permission isolation."""
import pytest
from datetime import date, time
from uuid import uuid4

from app.models.user import User, UserRole
from app.models.user_role import UserRoleMapping
from app.models.cafe import Cafe, VerificationStatus
from app.models.hardware_tier import HardwareTier
from app.models.booking import Booking, BookingStatus
from app.models.payment import Payment, PaymentStatus
from app.models.platform_fee import PlatformFee
from app.core.security import get_password_hash
from tests.conftest import auth_headers


async def _make_owner_and_cafe(db_session, suffix: str):
    owner = User(
        id=uuid4(), email=f"own_{suffix}_{uuid4().hex[:8]}@test.com",
        full_name="Owner", password_hash=get_password_hash("testpass123"),
        role=UserRole.CAFE_OWNER, is_active=True,
    )
    db_session.add(owner)
    await db_session.flush()
    db_session.add(UserRoleMapping(id=uuid4(), user_id=owner.id, role=UserRole.CAFE_OWNER))

    cafe = Cafe(
        id=uuid4(), owner_id=owner.id, name=f"Café {suffix}", address_line1="1 Test St",
        city="Bengaluru", state="Karnataka", pincode="560001", phone_number="+919876543210",
        verification_status=VerificationStatus.VERIFIED, is_active=True,
        opening_time=time(9, 0), closing_time=time(23, 0), bookable_stations=10,
    )
    db_session.add(cafe)

    tier = HardwareTier(
        id=uuid4(), cafe_id=cafe.id, name="Standard", specs={"gpu": "RTX 3060"},
        price_per_hour=100.0, total_seats=10, app_bookable_seats=10,
        active_seats_count=10, is_active=True,
    )
    db_session.add(tier)
    await db_session.commit()
    return owner, cafe, tier


def _make_booking(cafe, tier, gamer_id, status, session_date, base=100.0, fee_pct=4.0):
    """base = subtotal (café's settlement). gateway_fee = KHELO revenue."""
    gw = round(base * fee_pct / 100, 2)
    return Booking(
        id=uuid4(), booking_reference=f"GC-{uuid4().hex[:8].upper()}", gamer_id=gamer_id,
        cafe_id=cafe.id, hardware_tier_id=tier.id, session_date=session_date,
        start_time=time(18, 0), end_time=time(19, 0), duration_hours=1.0,
        base_amount=base, discount_amount=0.0, gateway_fee=gw,
        total_amount=base + gw, convenience_fee=0.0, status=status,
    )


def _make_platform_fee(booking, fee_pct=4.0):
    """REQUIRED for any earnings/payout assertion — settlement lives here."""
    return PlatformFee(
        id=uuid4(), booking_id=booking.id, convenience_fee=0.0,
        gateway_fee=float(booking.gateway_fee), fee_percentage_applied=fee_pct,
        tds_amount=0.0, owner_settlement_amount=float(booking.base_amount),
    )
```

> Booking rows alone are not enough for money tests — **always create the matching `PlatformFee` row**, since `owner_settlement_amount` lives there.

### 5.2 Money invariants

| ID | Assertion |
|---|---|
| **L-01** | Book at `platform_fee_percentage=4.0`; `PATCH /admin/settings` to `5.0`. Assert booking #1's `total_amount`, `gateway_fee`, and `PlatformFee.fee_percentage_applied` are **unchanged**; booking #2 uses 5.0. |
| **L-02** | Set rate `7.5`, create booking, assert `gateway_fee == round(subtotal*0.075, 2)`. Proves no hardcoded 4%. |
| **L-03** | Inspect `GET /bookings/platform-fee` response and customer UI wording. §L forbids showing "4% convenience fee" to customers. |
| **M-01** | One booking in each of `pending_payment`, `failed`, `cancelled`, `released_by_owner` + one `confirmed`. Assert `GET /owner/dashboard` earnings == the confirmed one alone. |
| **M-02** | **Tests F-1.** Assert owner-facing earnings == Σ `PlatformFee.owner_settlement_amount`, NOT Σ `Booking.total_amount`. **This must FAIL first — the failure is the bug.** |
| **M-03** | **Tests F-2.** Create `checked_in` + `active` bookings dated today. Assert `sum_revenue_today` and `sum_revenue_this_month` treat them consistently. |
| **M-04** | `POST /admin/bookings/{id}/refund` on a confirmed booking. Assert it leaves earnings and café payable. **Check the resulting status of a refunded `completed` booking — if it stays `completed`, revenue is still counted ⇒ P0.** |
| **AE-01** | GMV, customer payment, KHELO commission, café payable, café paid, café outstanding each from distinct sources; `gateway_fee` never lands in café payable. |
| **AE-02** | Include one `platform_fee_id` in two payouts ⇒ second must fail (UNIQUE constraint). |
| **AE-03** | Attempt partial refund ⇒ expected unrepresentable. Record as documented gap. |
| **V-01** | 100%-off promotion ⇒ record whether permitted, `total_amount == 0`, settlement 0. **Escalate the policy question; don't decide it alone.** |
| **N-01** | `pending_payment` → owner releases → customer B books the slot → customer A's webhook arrives `captured`. Assert **never two valid bookings** for one tier/time. Report `LOGIC-PASS / CONCURRENCY-UNVERIFIED`. |
| **O-01** | Same webhook payload twice ⇒ one payment row, one ledger entry, no duplicate booking. `test_payment_uniqueness` may cover this — **extend, don't duplicate**. |

### 5.3 Permission invariants

**B-01 — cross-owner IDOR. Write as a parametrized loop over the 20 endpoints in §1.3, not 20 hand-written tests.**

```python
FOREIGN_CAFE_ROUTES = [
    ("POST",   "/api/v1/owner/cafes/{cafe_id}/emergency-close"),
    ("PATCH",  "/api/v1/owner/cafes/{cafe_id}/emergency-mode"),
    # ... all 13 {cafe_id} routes from §1.3
]

@pytest.mark.parametrize("method,path", FOREIGN_CAFE_ROUTES)
@pytest.mark.asyncio
async def test_owner_b_cannot_touch_cafe_a(db_session, async_client, method, path):
    owner_a, cafe_a, _ = await _make_owner_and_cafe(db_session, "a")
    owner_b, _, _      = await _make_owner_and_cafe(db_session, "b")
    url = path.format(cafe_id=cafe_a.id)
    r = await async_client.request(method, url, headers=auth_headers(owner_b), json={})
    assert r.status_code in (403, 404), f"IDOR: {method} {path} returned {r.status_code}"
```

**Any 200 here is an automatic P0.** Repeat the same shape for the `{booking_id}` routes with a booking owned by Café A.

| ID | Assertion |
|---|---|
| **B-02** | Gamer token on owner endpoints ⇒ 403 |
| **B-03** | Gamer token on admin endpoints ⇒ 403 |
| **B-04** | Owner token on admin endpoints ⇒ 403 — **especially `PATCH /admin/settings`**; an owner who can set the platform fee can set it to 0 |
| **B-05** | Admin token succeeds across admin routes |
| **B-06** | **Tests H-3.** Set `localStorage.activeRole='admin'`, reload. Shell may render (cosmetic), but admin API calls **must** 403. |
| **D-01** | `PATCH /admin/cafes/{id}/suspend` ⇒ café absent from discovery/search/listing |
| **D-02** | Booking creation against suspended café ⇒ rejected |
| **D-03** | Suspend→resume preserves bookings, photos, tiers, offers, reviews; no duplicate café row; suspend twice / resume twice are idempotent |
| **D-04** | Admin listing still shows the suspended café with clear status |

> `owner_service.get_dashboard_stats` (`app/services/owner_service.py:26-45`) falls back to cafés where the user holds a **STAFF** mapping when they own none. Confirm a removed staff member cannot still read that café.

---

## 6. Phase 3 — Browser pass (~60 min, narrow)

Load Chrome tools in **one** call:
```
ToolSearch "select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__get_page_text,mcp__claude-in-chrome__javascript_tool,mcp__claude-in-chrome__read_network_requests,mcp__claude-in-chrome__resize_window,mcp__claude-in-chrome__tabs_create_mcp"
```

Viewports: **320 / 390 / 1440** (add 375/412/768 only if time remains).

### 6.1 B-10 — Role switch (do this first; cheapest high-value test)

**Use one JS eval, not screenshots:**
```js
JSON.stringify({role: localStorage.activeRole, roles: localStorage.roles, path: location.pathname})
```

Procedure per entry path — (a) `/login` as `owner@example.com`, (b) Google sign-in, (c) accept-invitation:
1. Log in, land in owner portal, run the eval.
2. **If `role !== 'cafe_owner'` ⇒ H-1 CONFIRMED** at that path. Fix per §2.3 and retest.
3. Then confirm the switcher renders and Owner→Gamer works, and Gamer→Owner back.

**B-11:** repeat at 320px with the 100-char stress café — switcher must not be pushed off-screen by name/avatar/bell.

### 6.2 Remaining browser tests

| ID | Test | Cheap method |
|---|---|---|
| **C-01** | Sign-out reachable at 320px with 100-char café name | `get_page_text` + one screenshot only if broken |
| **G-01** | **Gallery scroll-jump**: scroll down, tap photo → must open in place, NOT jump to top | Record `window.scrollY` before/after via JS; compare. Then swipe, next/prev, close, back button, and confirm no leftover `body` scroll-lock |
| **H-01** | Owner-uploaded menu image appears on customer café page | `get_page_text` / img src check |
| **J-01** | Timeline drag: handles grabbable, drag doesn't scroll page, page scroll still works, booked/unavailable unselectable, min/max duration | `computer` drag; verify start/end via JS |
| **Y-01** | Sticky bar must not cover reviews/menu/amenities/photos/tiers at full scroll-bottom | JS: compare sticky bar `getBoundingClientRect().top` vs last content element bottom |
| **T-01** | **F-6 paths only**: `owner/offers` (4 inputs), `owner/onboarding:734`. Type/delete/replace/arrows/paste for 0,1,5,10,100,1000 | Read input `.value` via JS |
| **U-01** | Verify H-3 duplicate `+`; new tier appears at **top**, immediately, no refresh; activity → details without re-clicking | `get_page_text` |
| **V-02** | Confirm F-3, fix line 317, retest. Then owner creates offer → customer sees it → checkout applies → redemption count increments | text + API |
| **F-01** | Owner pastes Maps URL → customer "Directions" opens that exact URL. Test malformed + blank. **Confirm no Maps JS API loads** | `read_network_requests` with pattern `maps.googleapis.com` — must be **empty** on customer pages |
| **R-01** | Clear All with 0 / 1 / many; unread counts; clicking opens correct destination (owner→owner, customer→customer); no dead links | text + network |
| **W-01** | **Analytics dummy data.** **Grep first**, browser second: `grep -rn "1\.2 km\|mockData\|dummy\|TODO\|hardcoded" frontend/src/app/\(owner\)/owner/analytics frontend/src/components/owner` | Flag every metric not DB-backed: bookings, revenue, utilization, repeat customers, avg session duration, peak hours, hardware performance, top games. Prior audit flagged hardcoded distance (1.2 km), amenities/games, and a mock rewards system — check if still present |
| **I-01** | Full booking flow; verify totals at every step against §1.1 | Compare UI total to `subtotal + round(subtotal×rate/100,2)` |

**Cut list if short on time**, in order: exports (AF), staff/volunteer depth (Q), sharing (AC), calendar (Z — manual anyway), extra viewports.

---

## 7. Phase 4 — Manual dossier (~20 min)

For **each** item give: **account · data to create · action · expected · what failure looks like.**

1. Razorpay success · 2. Razorpay failure · 3. Cancellation (user closes modal) · 4. Webhook arrival + **delayed** webhook · 5. Refund; partial refund (**unrepresentable — AE-03**) · 6. Café payout / manual bank transfer + acknowledgement · 7. QR scan on a physical phone · 8. Calendar on Android + iPhone · 9. `tel:` on a real handset · 10. Maps link on Android + iPhone · 11. **Email — `.env` has `RESEND_API_KEY`; the brief says Amazon SES. Confirm which is actually wired before testing** · 12. Owner + customer email notifications · 13. Mobile camera/gallery upload · 14. Physical touch/swipe · 15. **PostgreSQL concurrency suite (§1.6)** — re-run N-01/O-01 against real Postgres on staging. **Highest-value manual item; local SQLite cannot prove it.**

---

## 8. Matrix & required output

| TEST ID | FLOW | EXPECTED | ACTUAL | PASS/FAIL | SEVERITY | SCREENSHOT | FIX STATUS |
|---|---|---|---|---|---|---|---|

Severity: **P0** blocks booking/onboarding/payment · **P1** serious business/UX · **P2** cosmetic.

**Deliver:** 1. EXECUTIVE RESULT READY/NOT READY · 2. P0 · 3. P1 · 4. P2 · 5. Fixes made · 6. Passed · 7. Failed · 8. Manual required · 9. Risks remaining · 10. Exact pre-onboarding steps for the owner.

Per bug: **page · repro steps · root cause · fix · retest result.**

**Do not declare READY unless** auth, role permissions, booking flow, payment states, earnings excluding pending/failed, safe slot release, QR (or explicit manual-pass), suspend/resume, Maps external link, photos/menu, notifications, and offers all pass — with no dummy analytics, no critical mobile defect, no incorrectly exposed financial data.

**Honesty requirement:** concurrency results read `LOGIC-PASS / CONCURRENCY-UNVERIFIED`, never PASS. State anything skipped. A truthful NOT READY beats an optimistic READY.

---

## 9. Challenge pass — answer with evidence

- **Most likely day-one failure?** Candidates: (a) owner logs in, `activeRole` desyncs, cannot return to Gamer mode (**H-1**); (b) owner reads inflated earnings including KHELO's fee and disputes their first payout (**F-1**).
- **What financial bug loses money?** F-1; café absorbing 100% of discounts; 100%-off offers producing free bookings (V-01); untracked Razorpay cost making true margin unknown (§1.1).
- **What permission bug leaks café data?** Run **B-01** over the 20 routes in §1.3. Watch the STAFF-mapping fallback in `owner_service.py:26-45`.
- **What mobile bug reads as "broken"?** G-01 scroll-jump · J-01 drag handles · Y-01 sticky bar · B-11 switcher off-screen.
