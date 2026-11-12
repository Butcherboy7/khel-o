# Owner Revamp: Production-Readiness Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:executing-plans` (or `superpowers:subagent-driven-development`) to work through this plan task by task. Tick each `- [ ]` as you finish it. Use `superpowers:test-driven-development` for every backend task and `superpowers:verification-before-completion` before you call anything done.

**Goal:** Make the owner portal revamp (cabins, refresh rate and FPS, broken machines, plain words) safe and clear enough to promote from dev to prod.

**Where things stand (2026-11-13):**

- Worktree `E:\KHEL-O\.claude\worktrees\owner-revamp`, branch `feat/owner-revamp`, head `cf6a320`.
- `origin/main` = `origin/dev` = `d5b3924` = prod133. Dev runs qa214 (`f7a0978`), alembic 085.
- `cf6a320` (FPS boxes stacked) is committed but not on dev yet.
- Prod is untouched. Migration 085 only adds columns.

**Stack:** Next.js 15, React 19, Tailwind, vitest. FastAPI, SQLAlchemy async, alembic, pytest.

**Commands (run from the worktree root):**

| What | Command |
|---|---|
| Backend tests, one file | `cd backend && python -m pytest tests/<file> -q` |
| Backend tests, all | `cd backend && python -m pytest -q` |
| Frontend unit tests | `cd frontend && npm test` |
| Types | `cd frontend && npx tsc --noEmit` |
| Lint | `cd frontend && npm run lint` |
| Build (must pass before any deploy) | `cd frontend && npm run build` |
| Deploy to dev | `bash scripts/ops/deploy_dev.sh 215` (Git Bash, repo root) |

**Rules that always apply:**

1. Dev first. Never run `deploy_prod.sh`; the user runs it (Task 16).
2. Never type a password into a browser. Never print credentials.
3. Plain words on every owner screen. No "tier", "station", "pod", "gamer", "venue", "slot", "hardware". Say "setup", "machine", "customer", "café", "time".
4. Sentence case for every button, label and heading ("Copy link", not "Copy Link").
5. No em dashes in any text an owner or customer reads.
6. Do not commit `frontend/public/fallback-*.js` or `frontend/public/worker-*.js` (build leftovers). Add both patterns to `frontend/.gitignore` in Task 1.
7. Commit after each task. End each commit message with the attribution lines your session gives you.
8. If a step's "expected" result does not happen, stop and use `superpowers:systematic-debugging`. Do not skip ahead.

**Decisions already made (do not ask the user again):**

- A cabin booking is one room. The group size is stored in `players_count`; `seats_count` stays 1.
- A fixed-price offer on a cabin covers only the group size it was priced for (Task 2).
- Staff, not only owners, may mark a machine broken or fixed (Task 9).
- A café whose only shared setup is a cabin does not get the "Co-op" badge (Task 4).

---

## What is wrong today

Found by reading the running code on `cf6a320`. Severity: **P0** blocks prod, **P1** fix before prod, **P2** fix if time allows in this pass.

| # | Sev | Where | What is wrong | Fixed in |
|---|---|---|---|---|
| 1 | P0 | `backend/app/services/promotion_service.py:1071-1083` | A fixed-price offer ("3 hours for ₹400") with mode "any" is charged as `price × seats_count`. A cabin is always 1 seat, so 5 PCs for 3 hours (normally ₹3,150) would cost ₹400. | Task 2 |
| 2 | P0 | `backend/app/api/v1/owner.py:1243-1260`, owner Bookings, Scan, Dashboard | The owner is never told the group size. A cabin booked for 5 PCs shows as "1 Seat(s)". The owner cannot know how many PCs to switch on. Same for 4 friends sharing one console. | Task 3 |
| 3 | P1 | `frontend/src/app/(customer)/bookings/[id]/page.tsx:298` | A cabin booking's ticket says "Co-op, 5 players". It should say "Private cabin, 5 PCs". | Task 4 |
| 4 | P1 | `backend/app/repositories/cafe_repository.py:346` | `has_coop` is true for any setup with `coop_enabled`, so a cabin-only café shows a "Co-op" badge on its card. | Task 4 |
| 5 | P1 | `frontend/src/app/(customer)/bookings/new/page.tsx:1364-1379` | When cabins are full the button says "Only N Seats Left". Never tested in a browser with a cabin. | Tasks 4, 5 |
| 6 | P1 | Owner Setups card and customer café page | The refresh-rate line only shows when the setup has a `model`. A setup with 144 Hz and no model shows nothing. | Task 6 |
| 7 | P1 | `owner/bookings/page.tsx:99` | Uses the browser's `confirm()` pop-up, with the word "slot". Every "Check in" button spins when one is tapped. No end time shown. No "Never showed up" button although the API supports it. A failed "Free the seat" shows no error. | Task 7 |
| 8 | P1 | `owner/staff/page.tsx` | The invite window says the email is "sent via Resend" (a vendor name). If the staff list fails to load, the page says "Nobody yet", which is false. Cancel-invite is a 28px icon with no second tap. Title Case labels. | Task 8 |
| 9 | P1 | `backend/app/api/v1/cafes.py:487-541` | Only the owner can mark a machine broken. The person at the desk is usually staff. | Task 9 |
| 10 | P1 | Dashboard, Scan, Reviews, Offers, Setups, Insights, Alerts, Settings | Left-over jargon and Title Case: "Gamer Booking Details", "Standard Pod", "Gamer checked in successfully!", "All hardware tiers", "Lookup Exact Reference", "Which stations earn most", "Couldn’t create tier". Full list in Task 10. | Task 10 |
| 11 | P2 | `owner/onboarding/page.tsx` | "Venue Name", "Venue Photos", "Admin reviews venue coordinates, legal documents & payout details", default house rule mentions "station pods". | Task 11 |
| 12 | P2 | Backend test suite | One order-dependent test fails per full run on SQLite. Not yet identified. | Task 12 |
| 13 | P1 | Process | `cf6a320` not on dev. No logged-in click-through on dev has ever been done for this revamp. | Tasks 14, 15 |

Pages read and found in good shape (no task): Payouts, Challenges, Insights page shell, Alerts (one heading only), Settings (one line only), Free slots, Setups (after the revamp).

---

## Task 1: Housekeeping

**Files:** `frontend/.gitignore`

- [ ] Run `git status --short`. Expected: only the two untracked `frontend/public/*.js` files.
- [ ] Append to `frontend/.gitignore`:

```
public/fallback-*.js
public/worker-*.js
```

- [ ] Run `git status --short`. Expected: only `.gitignore` modified.
- [ ] Run the baseline so later failures are yours, not old ones: `cd frontend && npm test && npx tsc --noEmit`. Expected: both pass. Then `cd backend && python -m pytest tests/test_cabin_booking.py tests/test_fps_estimate.py tests/test_broken_machine.py tests/test_coop_booking.py tests/test_fixed_price_promotions.py -q`. Expected: all pass.
- [ ] Commit: `chore: ignore service-worker build leftovers`.

---

## Task 2 (P0): A fixed-price offer must not make a full cabin nearly free

**Files:**
- Test: `backend/tests/test_cabin_booking.py` (add tests)
- Modify: `backend/app/services/promotion_service.py` (the fixed-price branch near line 1071, and the functions that call it near lines 955, 1042, 1138, 1163)
- Modify: `backend/app/services/booking_service.py` (pass the group size where it calls the promotion service)

**Rule to build:** on a setup with `is_room = True`, a fixed-price offer applies only when the group is the size the deal was priced for: 1 PC for mode `any` or `solo`, 2 PCs for mode `coop`. Any other group size gets the normal price with no error at checkout (the offer simply is not offered or applied). Percentage and flat-amount offers are unchanged. Setups that are not rooms are unchanged.

- [ ] **Step 1: read first.** Read `backend/tests/test_fixed_price_promotions.py` and `backend/tests/test_coop_booking.py` to learn the helpers that create an offer and book (`_setup`, `_book`). Read `promotion_service.py` lines 940-1180.
- [ ] **Step 2: write the failing tests** in `test_cabin_booking.py`. Use the existing `CABIN` dict and the offer-creation helper you found in Step 1. Three tests:

```python
@pytest.mark.asyncio
async def test_fixed_price_deal_does_not_apply_to_a_five_pc_cabin(db_session, monkeypatch):
    """'3 hours for 400' is priced for one PC. Five PCs for 3 hours is 3150, not 400."""
    cafe, tier, gamer = await _setup(db_session, monkeypatch, **CABIN)
    await _make_fixed_price_offer(db_session, cafe, tier, hours=3, price=400, play_mode='any')
    resp = await _book(tier, cafe, gamer, durationHours=3, seatsCount=1, playersCount=5)
    assert resp.status_code == 201, resp.json()
    body = resp.json()["data"]["booking"]
    assert float(body["baseAmount"]) == 3150.0
    assert float(body.get("discountAmount") or 0) == 0.0


@pytest.mark.asyncio
async def test_fixed_price_deal_still_applies_to_one_pc_in_a_cabin(db_session, monkeypatch):
    cafe, tier, gamer = await _setup(db_session, monkeypatch, **CABIN)
    await _make_fixed_price_offer(db_session, cafe, tier, hours=3, price=400, play_mode='any')
    resp = await _book(tier, cafe, gamer, durationHours=3, seatsCount=1, playersCount=1)
    assert resp.status_code == 201, resp.json()
    body = resp.json()["data"]["booking"]
    assert float(body["baseAmount"]) - float(body["discountAmount"]) == 400.0


@pytest.mark.asyncio
async def test_percentage_offer_still_applies_to_a_full_cabin(db_session, monkeypatch):
    cafe, tier, gamer = await _setup(db_session, monkeypatch, **CABIN)
    await _make_percentage_offer(db_session, cafe, tier, percent=10)
    resp = await _book(tier, cafe, gamer, durationHours=1, seatsCount=1, playersCount=5)
    assert resp.status_code == 201, resp.json()
    assert float(resp.json()["data"]["booking"]["discountAmount"]) == 105.0  # 10% of 1050
```

`_make_fixed_price_offer` and `_make_percentage_offer` are thin wrappers you write at the top of the test file around whatever the existing offer tests use. Match the real field names (`discountAmount` may be named differently in the response; check one existing test and use that name).

- [ ] **Step 3: run them.** `cd backend && python -m pytest tests/test_cabin_booking.py -q`. Expected: the first test FAILS (discount applied), the other two pass. If the first test passes already, the bug does not exist as read: keep the three tests as protection, skip Step 4, and say so in the commit message.
- [ ] **Step 4: fix.** Thread a `players_count: int = 1` argument from `booking_service` down to the function holding the fixed-price branch. In that branch, before `deal_total` is computed, add:

```python
            tier_row = await self.tier_repo.get_by_id(tier_id)  # use whatever tier lookup this service already has
            if getattr(tier_row, 'is_room', False):
                priced_for = 2 if mode == 'coop' else 1
                if players_count != priced_for:
                    raise ValidationException(
                        message=f"This deal is for {priced_for} PC{'s' if priced_for > 1 else ''} in the cabin",
                        error_code="PROMOTION_GROUP_SIZE_MISMATCH",
                    )
```

Check how auto-apply treats a `ValidationException` from this function (it already does so for `PROMOTION_DURATION_MISMATCH`): the offer must be skipped silently, not fail the booking. The quote endpoint must pass `players_count` too, so checkout shows the same price the booking charges.

- [ ] **Step 5: run.** `python -m pytest tests/test_cabin_booking.py tests/test_fixed_price_promotions.py tests/test_offers_auto_apply.py tests/test_coop_booking.py tests/test_coop_price_30m.py tests/test_duration_pricing_offer_safety.py -q`. Expected: all pass.
- [ ] **Step 6: commit.** `fix(offers): a fixed-price deal on a cabin only covers the group size it was priced for`.

**Note for the final report, not for fixing now:** the same shape exists for consoles (a mode-"any" fixed-price deal applied to 4 friends sharing one console). It is live behaviour on prod, so it is left alone. Report it to the user as an open question.

---

## Task 3 (P0): Tell the owner how many PCs or players a booking is for

**Files:**
- Modify: `backend/app/schemas/booking.py` (`BookingResponse`, near line 84-103)
- Modify: wherever `tier_name` is filled on the booking response (run `grep -rn "tier_name" backend/app --include=*.py` and follow it)
- Modify: `backend/app/api/v1/owner.py` (verify-QR payload near line 1250, the search-checkin payload below line 1264, and any other dict that has `"seatsCount"`)
- Create: `frontend/src/lib/bookingLabels.ts`, `frontend/src/lib/bookingLabels.test.ts`
- Modify: `frontend/src/types/booking.ts`, `frontend/src/lib/api/owner.ts`
- Modify: `frontend/src/app/(owner)/owner/bookings/page.tsx` (line 292), `owner/scanner/page.tsx` (lines 437, 1046-1048), `owner/dashboard/page.tsx` (lines 647, 952-956)
- Test: `backend/tests/test_cabin_booking.py`

- [ ] **Step 1: failing backend test.**

```python
@pytest.mark.asyncio
async def test_owner_is_told_how_many_pcs_a_cabin_booking_needs(db_session, monkeypatch):
    cafe, tier, gamer = await _setup(db_session, monkeypatch, **CABIN)
    resp = await _book(tier, cafe, gamer, durationHours=1, seatsCount=1, playersCount=4)
    body = resp.json()["data"]["booking"]
    assert body["playersCount"] == 4
    assert body["isRoom"] is True
```

Run it. Expected: FAIL on `isRoom` (KeyError).

- [ ] **Step 2: backend.** Add `is_room: bool = False` to `BookingResponse` and fill it from the booking's setup everywhere `tier_name` is filled. Make sure `players_count` is in the response (fall back to `seats_count` when it is null). In `owner.py`, add to every booking dict that has `"seatsCount"`:

```python
                "playersCount": booking.players_count or booking.seats_count,
                "isRoom": bool(getattr(tier, "is_room", False)) if tier else False,
```

Run the test. Expected: PASS.

- [ ] **Step 3: failing frontend test.** Create `frontend/src/lib/bookingLabels.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { groupLabel } from './bookingLabels';

describe('groupLabel', () => {
  it('says how many PCs a cabin booking needs', () => {
    expect(groupLabel({ seatsCount: 1, playersCount: 5, isRoom: true })).toBe('Cabin · 5 PCs');
    expect(groupLabel({ seatsCount: 1, playersCount: 1, isRoom: true })).toBe('Cabin · 1 PC');
  });
  it('says when friends share one console', () => {
    expect(groupLabel({ seatsCount: 1, playersCount: 4 })).toBe('4 players sharing 1 console');
  });
  it('says how many machines when each player has their own', () => {
    expect(groupLabel({ seatsCount: 3, playersCount: 3 })).toBe('3 machines');
  });
  it('says nothing for one player on one machine', () => {
    expect(groupLabel({ seatsCount: 1, playersCount: 1 })).toBeNull();
    expect(groupLabel({})).toBeNull();
  });
});
```

Run `npm test -- bookingLabels`. Expected: FAIL (module not found).

- [ ] **Step 4: implement** `frontend/src/lib/bookingLabels.ts`:

```ts
/** What the person at the desk needs to get ready for a booking, in plain words. */
export function groupLabel(b: { seatsCount?: number | null; playersCount?: number | null; isRoom?: boolean }): string | null {
  const seats = b.seatsCount ?? 1;
  const players = b.playersCount ?? seats;
  if (b.isRoom) return `Cabin · ${players} PC${players === 1 ? '' : 's'}`;
  if (players > seats) return `${players} players sharing ${seats} console${seats === 1 ? '' : 's'}`;
  if (seats > 1) return `${seats} machines`;
  return null;
}
```

Run the test. Expected: PASS.

- [ ] **Step 5: show it.** Add `playersCount?: number | null; isRoom?: boolean;` to the booking types. Then:
  - Bookings page, after the setup name at line 292: `{groupLabel(booking) && <span className="font-semibold text-text-primary">{groupLabel(booking)}</span>}`.
  - Scan page lines 1046-1048: replace the "Seats / N Seat(s)" row with a row labelled "Get ready" whose value is `groupLabel(overlayBooking) ?? '1 machine'`. Line 437: replace `${r.seats} seats` with the same label if the search result carries the fields (add them to that payload in Step 2 if it does not).
  - Dashboard line 647 and the detail sheet at 952-956: same label; delete the `as unknown as Record<string, unknown>` casts and use the typed fields.
- [ ] **Step 6: verify.** `npm test && npx tsc --noEmit`. Expected: pass.
- [ ] **Step 7: commit.** `feat(owner): bookings, scan and dashboard say how many PCs or players to get ready`.

---

## Task 4 (P1): Customer wording for a cabin

**Files:**
- Modify: `frontend/src/app/(customer)/bookings/[id]/page.tsx` (line 298)
- Modify: `frontend/src/components/customer/BookingCard.tsx` (lines 15-30)
- Modify: `frontend/src/app/(customer)/bookings/new/page.tsx` (lines 1364-1379 and the price summary)
- Modify: `backend/app/repositories/cafe_repository.py` (line 346)
- Test: `backend/tests/test_cabin_booking.py`

- [ ] Ticket page line 298: when `booking.isRoom`, show `` ` · Private cabin, ${booking.playersCount} PC${booking.playersCount === 1 ? '' : 's'}` ``. Keep the co-op wording for consoles. Also replace the fallback `'Hardware Tier'` on line 297 with `'Your booking'`.
- [ ] `BookingCard.tsx`: "Book again" for a cabin must rebuild the same booking. Read lines 10-35. For `isRoom`, send `seats` = the PC count and do not set `coop=1` (the booking page forces the cabin price itself). Confirm by reading how `bookings/new/page.tsx` reads `seats` and `coop` from the URL.
- [ ] Booking page lines 1364-1379: when `isRoom`, the full-state texts become "Cabins full at this time" (0 left). The "Only N Seats Left" branch cannot happen for a cabin (`consolesCount` is 1), so no change there. For non-rooms change "Seat(s) Left" to sentence case: `Only ${n} left`.
- [ ] Booking page line 1018: for a cabin show "Price is for the cabin and the PCs you use" instead of "Price is per …".
- [ ] Backend test, then fix line 346 so a cabin does not count as co-op:

```python
@pytest.mark.asyncio
async def test_a_cabin_only_cafe_is_not_badged_co_op(db_session, monkeypatch):
    cafe, tier, gamer = await _setup(db_session, monkeypatch, **CABIN)
    # call the same list endpoint test_cafe_list_open_first_sort.py uses, find this café
    row = await _cafe_row_from_list(cafe)
    assert row["hasCoop"] is False
```

```python
                "has_coop": any(getattr(t, 'coop_enabled', False) and not getattr(t, 'is_room', False) and t.is_active for t in cafe_tiers),
```

- [ ] Run `python -m pytest tests/test_cabin_booking.py tests/test_cafe_list_open_first_sort.py -q`, `npm test`, `npx tsc --noEmit`. Expected: pass.
- [ ] Commit: `fix(customer): a cabin reads as a private cabin on the ticket, card and checkout`.

---

## Task 5 (P1): Click through a cabin booking in a real browser

This has never been done. Use the local rig, not dev.

**Files:** scratchpad only (nothing committed). The earlier rig lives in the session scratchpad if it still exists: `mock.js` (fake API on :8000), `lib.js` (puppeteer helpers). If it is gone, rebuild it: a Node HTTP server that answers the calls the page makes, plus `puppeteer-core@23` driving `C:/Program Files/Google/Chrome/Application/chrome.exe`. In Git Bash set `MSYS_NO_PATHCONV=1` before passing the Chrome path. Start Next with `cd frontend && npx next dev -p 3100` and `NEXT_PUBLIC_API_URL=http://localhost:8000`.

- [ ] Mock one café with two setups: a cabin (`isRoom: true, coopEnabled: true, coopMaxPlayers: 5, coopExtraPlayerPrice: 150, pricePerHour: 450, totalSeats: 2, minBookingMinutes: 30`) and a hall PC (`pricePerHour: 150`).
- [ ] Open `/bookings/new?cafeId=…&tierId=<cabin>` at 390×844 and at 1440×900. Check and screenshot each:
  1. The stepper is labelled "PCs in the cabin" and stops at 5.
  2. No "Co-op / Own consoles" choice appears at 2 or more PCs.
  3. The price shown for 1 hour is ₹450, ₹600, ₹750, ₹900, ₹1,050 for 1 to 5 PCs (before fees; note the "₹149" rule may show ₹449 and so on, which is correct).
  4. At 30 minutes with 2 PCs the price is ₹300.
  5. The booking request the page sends has `seatsCount: 1` and `playersCount` = the PC count. Capture it with `page.on('request')`.
  6. With both cabins booked for the chosen time (mock `bookedSlots`), the button is disabled and reads "Cabins full at this time".
  7. Switch to the hall PC: the label goes back to "Players" and the price is per PC.
- [ ] Any check that fails: fix it in `bookings/new/page.tsx`, re-run all seven, commit `fix(checkout): <what>`.
- [ ] Read every screenshot with the Read tool before ticking this task. No console errors allowed (`page.on('pageerror')` and `console.error`).

---

## Task 6 (P1): Refresh rate shows even when the PC model is blank

**Files:** `frontend/src/app/(owner)/owner/tiers/page.tsx`, `frontend/src/app/(customer)/cafe/[id]/CafeDetailClient.tsx` (around lines 700-765)

- [ ] In both files find where the Hz line is rendered (`grep -n "refreshRateHz" <file>`). It sits inside a block guarded by `tier.model`. Move the Hz line and the FPS chips out of that guard so they render whenever `tier.refreshRateHz` or `tier.expectedFps` has a value.
- [ ] Check in the Task 5 rig with a setup that has `refreshRateHz: 144` and `model: null`. Expected: "144 Hz" shows on both pages.
- [ ] `npm test && npx tsc --noEmit`. Commit: `fix(setups): show refresh rate even when the PC model is blank`.

---

## Task 7 (P1): Owner Bookings page

**Files:** `frontend/src/app/(owner)/owner/bookings/page.tsx`

- [ ] **No browser pop-up.** Delete `handleRelease` and its `confirm()` (line 98-102). Use the two-tap pattern already used on the Staff page (`confirmRemoveId`): first tap on "Free the seat" swaps the button for the text "Free this booking's time for other customers?" with two buttons, "Free it" (destructive) and "Keep". Rename the button itself to "Free this time".
- [ ] **One spinner, not all.** Line 306: `isLoading={checkinMutation.isPending && checkinMutation.variables === booking.id}`. Do the same for the "Finished" button with `updateStatusMutation.variables?.bookingId`.
- [ ] **Show a failed release.** Add `(releaseMutation.error as Error | null)?.message` to `actionError`.
- [ ] **End time.** Line 290: show `{formatTime(booking.startTime)} to {formatTime(booking.endTime)}` and drop the bare `2.5h`. If `endTime` is not on the list item type, add it (the API returns it; check `BookingResponse.end_time`).
- [ ] **Never showed up.** For a booking with status `confirmed` whose `sessionDate` is today or earlier, add a quiet text button "Never showed up" next to "Check in" that calls `updateStatusMutation.mutate({ bookingId: booking.id, status: 'no_show' })` behind the same two-tap pattern ("Mark as never showed up?" / "Yes" / "Keep"). Read the backend handler for `updateOwnerBookingStatus` first; if it rejects `no_show` before the booking's start time, only show the button after the start time.
- [ ] **Words.** Header description becomes "Find a booking, check someone in, or free up a time nobody paid for." Error fallback line 242 becomes "Check your connection and try again."
- [ ] Check at 390px and 1440px in the rig with five mock bookings in different statuses. Read the screenshots.
- [ ] `npm test && npx tsc --noEmit && npm run lint`. Commit: `fix(owner): bookings page shows end time and group size, drops the browser pop-up, adds Never showed up`.

---

## Task 8 (P1): Your team page

**Files:** `frontend/src/app/(owner)/owner/staff/page.tsx`

- [ ] **Do not lie when loading fails.** In `loadData`, remove the two `.catch(() => ({ … }))` fallbacks. Add `const [loadError, setLoadError] = useState(false)`; set it in the `catch`. When `loadError`, render `<OwnerLoadError title="Couldn’t load your team" message="Check your connection and try again." onRetry={loadData} />` instead of the lists.
- [ ] **Invite window words.**

| Now | Change to |
|---|---|
| "Invite Venue Staff Member" | "Invite someone to your team" |
| "An invitation email with setup instructions will be sent via Resend. You can also copy the invitation link directly." | "We’ll email them a link to set their own password. You can also copy the link and send it yourself." |
| "Staff Full Name *" | "Their name" |
| "Staff Email Address *" | "Their email" |
| "Phone Number (Optional)" | "Their phone (optional)" |
| placeholder "staff@esportsarena.in" | "name@example.com" |
| success: "Invitation sent to X! Link copied to clipboard or ready to copy below." | "Invite sent to X. The link is below if you want to send it yourself." |
| "Copy Link" | "Copy link" |
| badge "Pending" | "Waiting" |
| badge "Check-In Staff" | "Can check customers in" |
| "Expires: {date}" | "Link works until {date}" using `toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })` |

- [ ] **Cancel invite.** Replace the bare icon button with a text button "Cancel invite" (min height 40px) using the same two-tap confirm as "Remove".
- [ ] **Expired invite.** Next to the "Expired" badge add a button "Invite again" that opens the invite window with that person's name and email filled in.
- [ ] **Close the window properly.** The ✕ button gets `aria-label="Close"` and `type="button"`. Pressing Escape closes it (a `keydown` listener while open). Clicking the dark backdrop closes it.
- [ ] Replace `any` on `staffList` with a small `{ id: string; fullName: string; email: string }` type.
- [ ] Check at 390px and 1440px in the rig. `npm test && npx tsc --noEmit && npm run lint`. Commit: `fix(owner): team page uses plain words, shows load failures, safer invite cancel`.

---

## Task 9 (P1): Staff can mark a machine broken

**Files:**
- Modify: `backend/app/api/v1/cafes.py:487-541` (both broken endpoints and the list endpoint that feeds `BrokenMachines.tsx`)
- Test: `backend/tests/test_broken_machine.py`
- Modify: `frontend/src/components/owner/BrokenMachines.tsx`

- [ ] **Step 1: read** how a staff member's café is checked elsewhere: `backend/app/api/deps.py` (`require_staff`) and `search_checkin_candidates` in `owner.py:1264`. Reuse that exact check.
- [ ] **Step 2: failing tests** in `test_broken_machine.py`: (a) a staff member of the café can POST and DELETE broken; (b) a staff member of a *different* café gets 403; (c) a plain customer gets 403. Run. Expected: (a) fails with 403.
- [ ] **Step 3:** swap `require_cafe_owner` for `require_staff_or_owner` on the three endpoints and replace the `cafe.owner_id == current_owner.id` check with the helper from Step 1 (owner of this café, or staff of this café). Run the tests. Expected: all pass, including the older ones in the file.
- [ ] **Step 4: words for a cabin.** `BrokenMachines.tsx` takes the setup; when `isRoom`, the prompt reads "Is a cabin closed?" and the hint reads "Type its name, like Blue cabin." The button stays "Mark broken".
- [ ] **Step 5: clearer refusal.** In `cafes.py` the conflict message becomes: `f"{label} is needed for booking {ref} on {date}. Call that customer first, or mark it broken after their booking."` Format the date as `%a %d %b`.
- [ ] **Step 6:** confirm the Setups page is reachable for the staff role (`OwnerShell.tsx` nav). If staff cannot open Setups, add the `BrokenMachines` panel for each setup to the Free slots page for staff only, and say so in the commit.
- [ ] `python -m pytest tests/test_broken_machine.py -q`, `npm test`, `npx tsc --noEmit`. Commit: `feat(owner): staff can mark a machine broken or fixed`.

---

## Task 10 (P1): Remaining jargon and Title Case on owner pages

Exact replacements. Change the visible string only, never a variable or API field name.

| File:line | Now | Change to |
|---|---|---|
| `owner/dashboard/page.tsx:639` | `'Gamer'` | `'Customer'` |
| `owner/dashboard/page.tsx:647, 929` | `'Standard Pod'` | `'Setup'` |
| `owner/dashboard/page.tsx:647` | `{b.durationHours \|\| 2}h` | `{b.durationHours}h` (no invented 2) |
| `owner/dashboard/page.tsx:660` | `'this gamer'` | `'this customer'` |
| `owner/dashboard/page.tsx:908` | "Gamer Booking Details" | "Booking details" |
| `owner/dashboard/page.tsx:714-838` | "online seats", "One fewer seat bookable online", "One more seat bookable online" | "machines on the app", "One fewer on the app", "One more on the app" |
| `owner/scanner/page.tsx:274` | "Scanner library loading, please wait..." | "The scanner is still loading. Try again in a moment." |
| `owner/scanner/page.tsx:281` | "Camera viewport container not ready." | "The camera isn’t ready yet. Try again." |
| `owner/scanner/page.tsx:550` | "Gamer checked in successfully!" | "Checked in." |
| `owner/scanner/page.tsx:820` | "Scanning..." | "Scanning" |
| `owner/scanner/page.tsx:833` | "Name, Phone, or Booking Reference *" | "Name, phone or booking code" |
| `owner/scanner/page.tsx:844` | "Searching Booking..." | "Searching" |
| `owner/scanner/page.tsx:848` | "Lookup Exact Reference" | "Find this booking code" |
| `owner/scanner/page.tsx:1089` | "Try Again" | "Try again" |
| `owner/reviews/page.tsx:92` | `'Gamer'` | `'Customer'` |
| `owner/reviews/page.tsx:127` | "Write your public response to the gamer..." | "Write your reply. Everyone can read it." |
| `owner/reviews/page.tsx` buttons | "Reply to Review", "Edit Reply", "Post Reply", "Posting..." | "Reply", "Edit reply", "Post reply", "Posting" |
| `owner/reviews/page.tsx` error | "Couldn't post your reply — please try again." | "Couldn’t post your reply. Please try again." |
| `owner/offers/page.tsx:768` | "Offer Title *" | "Offer name" |
| `owner/offers/page.tsx:775` | "Description (shown to gamers)" | "Description (customers see this)" |
| `owner/offers/page.tsx:784` | "Discount % (1-50) *" | "Discount % (1 to 50)" |
| `owner/offers/page.tsx:798, 832` | "Amount off (₹) *", "Deal Price (₹) *" | "Amount off (₹)", "Deal price (₹)" |
| `owner/offers/page.tsx:870` | "All hardware tiers" | "All setups" |
| `owner/offers/page.tsx:908, 915` | "Start Date *", "End Date *" | "Starts", "Ends" |
| `owner/offers/page.tsx:1027` | "Max Redemptions (optional)" | "Stop after this many uses (optional)" |
| `owner/offers/page.tsx:482, 724` | sentences with " — " | same sentences, split into two with a full stop |
| `owner/tiers/page.tsx:147, 194` | "Couldn’t create tier…", "Couldn’t update tier…" | "Couldn’t add this setup. Please try again.", "Couldn’t save this setup. Please try again." |
| `components/owner/InsightsPanels.tsx:321` | "See your stations" | "See your setups" |
| `components/owner/InsightsPanels.tsx:715` | "Which stations earn most" | "Which setups earn most" |
| `components/owner/PlatformTierConfigurator.tsx:270` | `'units' : 'capacity'` | `'units' : 'people at once'` |
| `components/owner/PlatformTierConfigurator.tsx:433` | "e.g. VR Arcade Pod" | "e.g. VR arcade" |
| `components/owner/ProspectiveOwnerView.tsx:86` | "Operating Hours & Hardware Tiers" | "Opening hours and your setups" |
| `owner/notifications/page.tsx` | "Unable to load notifications" | "Couldn’t load your alerts" |
| `owner/settings/page.tsx` | "No café configuration found for this account." | "We couldn’t find a café on this account. Contact KHEL-O support." |
| `backend/app/services/promotion_service.py:1062` | "Promotion does not apply to the selected hardware tier" | "This offer isn’t for the setup you picked" |
| `backend/app/api/v1/owner.py:1250` | `"Standard Tier"` | `"Setup"` |

- [ ] Make every change in the table. Line numbers may have moved by a few lines after earlier tasks; find the string with Grep.
- [ ] On the Offers form, required fields lose the `*`; keep `required` on the inputs, and add "(optional)" only to the optional ones (already done).
- [ ] Offers play-mode picker (near line 885): when the chosen setup `isRoom`, hide the "How they play" picker and send `playMode: 'any'`. A cabin has no solo or co-op.
- [ ] Sweep for anything missed. Each of these must return no owner-visible string (comments, variable names, imports and `className` do not count):

```bash
cd frontend/src
grep -rnE ">[^<{]*\b(Gamer|gamer|Venue|venue|Pod|Station|station|Hardware|hardware [Tt]ier|slot)\b[^<{]*<" "app/(owner)" components/owner
grep -rnE "(label|title|placeholder|description)=\"[^\"]*\b(Gamer|gamer|Venue|venue|Pod|Station|Hardware|Tier|tier)\b" "app/(owner)" components/owner
grep -rn "confirm(\|alert(" "app/(owner)" components/owner
grep -rnE "(>|=\")[^<\"]* — " "app/(owner)" components/owner
```

Onboarding hits are handled in Task 11; ignore them here.

- [ ] If any test asserts an old string, update the test to the new string.
- [ ] `npm test && npx tsc --noEmit && npm run lint`, and `python -m pytest tests/test_fixed_price_promotions.py tests/test_offers_auto_apply.py -q`. Commit: `copy(owner): last jargon and Title Case out of dashboard, scan, reviews, offers, insights`.

---

## Task 11 (P2): Onboarding words

**Files:** `frontend/src/app/(owner)/owner/onboarding/page.tsx`

| Line | Now | Change to |
|---|---|---|
| 112 | "No outside food or beverages permitted inside station pods." | "No outside food or drinks at the gaming seats." |
| 590 | "Admin reviews venue coordinates, legal documents & payout details." | "KHEL-O checks your location, documents and payout details." |
| 594 | "Upon verification, your account automatically unlocks the full Live Owner Portal." | "Once we approve it, your owner portal opens fully." |
| 598 | "You will receive notification when your venue goes live to gamers." | "We’ll tell you the moment customers can book your café." |
| 662 | "Café Onboarding Setup" | "Set up your café" |
| 708 | "1. Café Identity & Location Pin" | "1. Your café and where it is" |
| 858 | "2. Business Verification & Legal Documents" | "2. Business details and documents" |
| 986 | "Trade License / Registration Document URL (Optional)" | "Link to your trade licence or registration (optional)" |
| 1280, 1463 | "Venue Photos" | "Café photos" |
| 1333 | "Menu Photos (Optional)" | "Menu photos (optional)" |
| 1393 | "6. Policies & Review Application" | "6. Rules, then check everything" |
| 1406 | "Venue Name" | "Café name" |

- [ ] Make the changes. Do not touch validation, field names or step logic; this page was hardened earlier.
- [ ] For the remaining labels on this page, convert Title Case to sentence case and "(Optional)" to "(optional)". Remove trailing " *" from labels only if the `Input` component shows required another way; if it does not, leave the stars.
- [ ] `npm test && npx tsc --noEmit`. Commit: `copy(onboarding): café words, sentence case`.

---

## Task 12 (P2): The flaky backend test

- [ ] Run the full suite three times, saving output: `cd backend && for i in 1 2 3; do python -m pytest -q -p no:cacheprovider 2>&1 | tail -15 > ../flaky-$i.txt; done`. Read the three files.
- [ ] If the same test fails each time: use `superpowers:systematic-debugging`. The earlier fix in `test_cafe_list_open_first_sort.py` (commit `f7a0978`) is the model: a test that assumed an empty shared SQLite DB. Fix the test's assumption, not the product code, unless the product is wrong.
- [ ] If a different test fails each run, or nothing fails: time-box to 30 minutes, then write what you saw in the final report and move on. It does not block prod as long as each failing test passes when run alone (`python -m pytest tests/<file>::<name> -q`). Verify that for every failure you saw.
- [ ] Delete the `flaky-*.txt` files. Commit any fix: `test: <what the test wrongly assumed>`.

---

## Task 13: Full check before dev

All must pass. Paste the last lines of each output into your notes; do not claim a pass you did not see.

- [ ] `cd backend && python -m pytest -q`. Expected: all pass, or only failures explained in Task 12.
- [ ] `cd frontend && npm test`. Expected: pass.
- [ ] `cd frontend && npx tsc --noEmit`. Expected: no output.
- [ ] `cd frontend && npm run lint`. Expected: no errors.
- [ ] `cd frontend && npm run build`. Expected: "Compiled successfully". This catches server/client boundary errors that `tsc` misses.
- [ ] **Every owner page in the rig, 390×844 and 1440×900:** dashboard, bookings, scanner, tiers, availability, offers, payouts, reviews, analytics, notifications, staff, settings, challenges, support. For each: no page error, no `console.error`, no sideways scroll (`document.documentElement.scrollWidth <= window.innerWidth`), no clipped text. Save and read 28 screenshots.
- [ ] Customer pages in the rig at both sizes: café page (cabin, hall PC, console with co-op), booking page (Task 5 list), ticket page for a cabin booking.
- [ ] Run `/code-review` at effort `high` on `git diff d5b3924..HEAD`. Fix every confirmed finding, then re-run this whole task.
- [ ] `git status` is clean. `git push origin feat/owner-revamp`.

---

## Task 14: Deploy to dev

- [ ] No new migration since qa214, so no DB backup is needed. Confirm: `git diff f7a0978..HEAD --stat -- backend/migrations` prints nothing. If it prints anything, take a dev DB backup first (see `docs/DEPLOY-RUNBOOK.md`).
- [ ] In Git Bash from the worktree root, with `TMPDIR` set to the session scratchpad using forward slashes: `bash scripts/ops/deploy_dev.sh 215`.
- [ ] `git tag deploy/qa215 && git push origin deploy/qa215`.
- [ ] Checks that need no login:
  - `curl -s -o /dev/null -w "%{http_code}" https://<dev-host>/` returns 200 (host is in `docs/DEPLOY-RUNBOOK.md`).
  - The public café list API returns 200 and each setup has `isRoom`, `refreshRateHz`, `expectedFps` keys.
  - `bash scripts/ops/dev_sql.sh "select version_num from alembic_version"` returns `085`.
- [ ] Seed one cabin on dev for QA, on the test café named in memory `reference_dev_qa_accounts` (Matrix Cyber Lounge), with `dev_sql.sh`: one PC setup with `is_room=true, coop_enabled=true, coop_max_players=5, coop_extra_player_price=150, price_per_hour=450, total_seats=2, app_bookable_seats=2, refresh_rate_hz=144`. Check the column list with `\d hardware_tiers` first.

---

## Task 15: Logged-in check on dev (needs the user for one minute)

Claude cannot type passwords. Ask the user once: "Please log in to the dev site in Chrome as the test owner, then tell me." Then drive that session with the Chrome tools (`claude-in-chrome` skill). If the user would rather do it by hand, give them this same list.

Owner, as the test café owner:

- [ ] Setups: edit the cabin, change the cabin fee, save, reopen. The value stuck and the live example matches.
- [ ] Setups: mark "PC 7" broken, see it listed, mark it fixed.
- [ ] Setups: set 240 Hz and a Valorant FPS of 300. Open the public café page: "240 Hz" and "300" with no "estimated" on Valorant, "estimated" on the others.
- [ ] Bookings: a cabin booking row reads "Cabin · N PCs" and shows start and end time.
- [ ] Bookings: "Free this time" asks in the page, not in a browser pop-up.
- [ ] Your team: invite window uses the new words; cancel an invite with two taps.
- [ ] Every sidebar page opens with no error banner.

Customer, as `test@example.com` only (see memory `reference_dev_qa_accounts`; Razorpay test flow):

- [ ] Book the cabin for 3 PCs, 1 hour. Checkout shows ₹750 before fees. Pay with the test flow.
- [ ] The ticket says "Private cabin, 3 PCs".
- [ ] The owner Scan page, on that ticket's QR or by name search, says "Cabin · 3 PCs".
- [ ] Try to book the cabin at the same time twice more: the third attempt is refused ("Cabins full at this time").

- [ ] Anything that fails: fix on the branch, re-run Task 13, deploy `qa216`, re-check the failed item and its neighbours.
- [ ] Update `C:\Users\ADMIN\.claude\projects\E--KHEL-O\memory\project_owner_revamp.md` with the new dev build number, what was verified, and what is still open.

---

## Task 16: Promote to prod (the user runs the deploy)

Only after every box in Tasks 13 to 15 is ticked. Give the user these steps in one message and wait.

1. **User:** back up the prod database (migration 085 adds columns). Command is in `docs/DEPLOY-RUNBOOK.md`. Confirm the dump file exists and is not empty.
2. **User:** from the worktree root in Git Bash: `bash scripts/ops/deploy_prod.sh 134`.
3. **Claude, after the user says it finished:**
   - [ ] `bash scripts/ops/prod_sql.sh "select version_num from alembic_version"` returns `085`.
   - [ ] `bash scripts/ops/prod_sql.sh "select count(*) from hardware_tiers where is_room"` returns `0` (nothing changed for existing cafés).
   - [ ] The prod home page and one café page return 200. One existing café's setups still show the same prices as before (compare with a `prod_sql.sh` read taken before the deploy).
   - [ ] `git tag deploy/prod134 && git push origin deploy/prod134`.
   - [ ] Fast-forward both branches: `git push origin feat/owner-revamp:main feat/owner-revamp:dev`. If either refuses (not a fast-forward), stop and tell the user; do not force.
   - [ ] Update memory `project_owner_revamp.md` and the `MEMORY.md` line: LIVE prod134, commit hash, date.
4. **Rollback, if a check fails:** redeploy the previous commit (`d5b3924`) the same way as a new build number. The new columns can stay; old code ignores them. Do not downgrade the migration unless the user asks.

After prod is live, tell the user to set up Wild Gaming's two cabins for real (cabin fee ₹300, each PC ₹150, 5 PCs per cabin, 2 cabins), since no prod data is created by this deploy.

---

## Not in this plan

- The owner tutorial video (parked by the user).
- Marking one PC inside a cabin as broken (today a cabin is open or closed as a whole).
- Fixed-price offers on shared consoles (same shape as Task 2, but live behaviour on prod; needs the user's call).
- Showing the customer's phone number on the owner Bookings page.
- A star-rating summary at the top of Reviews.

## Final report to the user

Short, plain words: what was fixed, what was checked and how, what is still open (the list above plus anything from Task 12), and the exact two things they must do for prod (backup, deploy command).
