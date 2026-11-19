# GTA 6: check-first booking on every hour (fix the dead end)

Date: 2026-11-20. Status: design approved in chat by the founder, awaiting spec review.
Branch: `feat/gta6-check-first` (off `feat/gta6-home-landing` c67eafa). Builds on
`2026-11-19-gta6-slot-requests-design.md` (request mode, already on prod and switched on).

## Problem (verified on prod, 2026-11-20 00:40 IST)
- The AdamsDen GTA 6 drop keeps **both PS5 Pros 10:00-23:00 every day** (`keptForDrops`). The café page therefore
  shows PlayStation 5 Pro as fully taken.
- The 19 Nov "casual" rule makes the drop page **refuse** every normal-hours time and point to the café page.
  Each page sends players to the other, and both are blocked.
- Days 20 and 21 Nov look tappable but `pick()` returns early (`normalOnly`), so no slider, no console picker and no
  phone field appear. 22 Nov onwards shows "Soon" (48-hour limit) with nothing to do.
- Request mode (`/gta6-requests/config` enabled, until 3 Dec) only fires at café checkout, which nobody reaches;
  "No, not GTA" books instantly; requests are priced at the café tier price, not the GTA price.

## Decisions (founder, 2026-11-20)
1. Clicking anything GTA 6 lands on a page that says the café runs GTA 6 at its GTA price and lets the player pick
   **any hour**, including normal hours.
2. On GTA-capable consoles, **every** booking (GTA or not) goes through "we check with the café first" while request
   mode is on. PCs and other non-GTA setups stay instant.
3. Price: GTA 6 players pay the drop's GTA price (₹250/hr at AdamsDen, owner's time prices apply); non-GTA players
   on the same console pay the normal tier price (₹199).
4. After the founder confirms with the café and taps Allow, the player pays the **full amount** online. No fee-only
   option for normal hours. Mobile number is required.
5. Normal-hours days are bookable **7 days ahead** (not 48 hours).
6. Request mode ends automatically after **Thu 27 Nov 2026** (set `gta6_requests_until = 2026-11-27`).
7. Keep 2 PS5 Pros in data until the founder confirms a third with AdamsDen.

## Design

### 1. One ledger in normal hours
- `drop_service.dedicated_windows` (normal-booking side): for a **casual** drop, return no blanket hold for the
  parts of its daily hours that fall inside the café's opening hours. Outside them (late-night / early-morning
  sessions) behaviour is unchanged.
- Instead, the drop's **actual live reservations** (confirmed / checked_in / pending_payment, including ones the
  owner entered offline) that overlap normal hours are returned as busy intervals on their exact console, so a
  normal booking can never take a console the drop already sold. Same shape the callers already consume.
- Drop side: the drop page's per-console busy data (`byConsole`) for normal hours additionally includes normal
  bookings on that tier, so both pages show the same picture.

### 2. GTA 6 page (`/drops/[slug]`, casual drop)
- Remove the normal-hours refusal in the picker (`normalOnly`, `normalSlots` greying, `touchesNormal` filter) and
  the "Book a normal slot instead" box. Day buttons that cannot be picked are disabled with a reason, never
  silently inert.
- Flow: day → PS5 Pro 1 / PS5 Pro 2 with busy times → slider priced at the drop's GTA time prices → mobile number
  (required) → **Ask for this slot**.
- When the chosen window is inside normal hours and request mode is effective, the button opens a sheet:
  "GTA 6 is in high demand. We'll confirm with <café> in 5-10 minutes, then you pay in full and it's booked."
  Confirm → `POST /gta6-requests` with `game: "gta6"`, the exact console, and opens WhatsApp to the founder with
  café, console, time and reference pre-filled → `/gta6-requests/[id]` status screen (exists).
- Late-night / early-morning windows keep today's fee reservation flow unchanged.
- Booking horizon: normal-hours starts may be up to 7 days ahead; the late-night 48-hour limit stays for those
  sessions. "Soon" days say when they open instead.

### 3. Café checkout (`bookings/new`) on a `runsGta6` tier
- "Playing GTA 6?" **Yes** → request at the GTA price; **No** → still a request (high-demand note) at the tier price.
  Both only while request mode is effective; otherwise the current instant booking.

### 4. Requests: price and Allow
- `gta6_slot_requests` gains `game` (`gta6` | `other`) and `console_key` (nullable; exact console when chosen).
  New alembic migration after the current head.
- Price is computed **server-side** at Allow time: `gta6` → drop GTA price for that window (drop time prices);
  `other` → normal tier price. Never trusted from the client.
- Allow (existing transaction) re-checks the exact console against both ledgers, then creates the
  `PENDING_PAYMENT` booking at that price with the existing 15-minute hold; the player pays the full amount.
  If the console is gone, Allow fails with a clear message and nothing is held.

### 5. Switch
- Set `gta6_requests_until = 2026-11-27` (admin setting; done on prod by the founder or via admin page).
  After that: no sheet, normal-hours times on the GTA 6 page book instantly at the GTA price via normal checkout,
  PS5 checkout books instantly.

## Out of scope
Late-night fee flow changes, PCs/racing, owner-side screens, a 3rd PS5, Home, WhatsApp automation.

## Errors and edge cases
- Two players request the same console/time: both saved; first Allow wins, second Allow errors.
- Owner enters an offline slot after a request: Allow's re-check catches it.
- Request mode off mid-request: in-flight requests still resolve.
- Café without opening hours set: treat the whole drop window as late-night (current behaviour).
- Player not signed in: the existing sign-in sheet keeps all picks and continues to the request.

## Testing
Backend: casual drop no longer holds normal hours; its reservations still block normal booking on the exact
console; normal bookings show in drop `byConsole`; request price gta6 vs other; Allow re-check on both ledgers;
7-day horizon; switch end date. Frontend: vitest for the picker rules; real-browser click-through on dev at 400px
(GTA banner → AdamsDen → 20 Nov 2 PM → PS5 Pro 2 → request → admin Allow → pay screen). Dev first; the founder
runs the prod deploy.
