# GTA 6 slot requests (launch-period "check with the café first")

Date: 2026-11-19. Status: design, awaiting founder review. Builds on branch `feat/gta6-casual-booking`.

## Problem
GTA 6 is out. We want every café with a PS5 / PS5 Pro / Xbox Series tagged as available, but café owners also sell
seats offline and do not update the app, so online and offline sell the same console. Until owners keep a calendar
updated, a human has to cross-check high-demand GTA 6 slots with the café before the player pays.

## Decisions already made (founder, 2026-11-19)
- Cafés reply on WhatsApp within ~10 minutes, so a manual check is workable at launch volume.
- The player **pays only after** the café has said yes. A "no" never involves money.
- The trigger is a **question at checkout**: on a GTA 6-capable console the player is asked "Are you playing GTA 6?".
  Yes → request flow. No → normal instant booking (honour system; accepted).
- The founder is the switchboard: the player sends the founder a WhatsApp message, the founder asks the café, then
  taps **Allow** in the admin. No café-side software, no WhatsApp Business API.
- A request is **saved in the app** (not only a WhatsApp message) and the founder gets a push + email.
- **Allow creates a held seat** (a PENDING_PAYMENT booking), it is not just a message.
- One-tap **Allow / Decline / Suggest another slot** in admin.
- Applies only to GTA 6 on supported consoles. PCs, VR, racing rigs and non-GTA play stay instant.
- Easy to turn **off** in admin, and it should end by itself when the hype is over; normal booking then resumes.
- Home page: subtly say GTA 6 is live and book cafés; a banner/chip on every café that has GTA 6. Change little else.

## Scope
In: request mode (setting + data + player flow + admin queue + notifications), GTA 6 café chips, subtle home strip.
Out: automating WhatsApp, an owner-side screen, changing FIFA/other-game booking, tournaments, the drops engine.

## Design

### 1. Gate and switch
Add to `platform_settings` (singleton, already admin-controlled): `gta6_requests_on` (bool, default false),
`gta6_requests_until` (date, nullable), `gta6_whatsapp` (string, founder number, digits with country code).
Effective = `on AND (until is null OR today(IST) <= until)`. When not effective: checkout never asks, requests page
shows only history, banners/chips stay (they are discovery, not the request gate).
A tier "runs GTA 6" via the existing `game_platforms.fit(rule_for("GTA 6"), ...)` == `yes` (or `check` for an
unidentified PlayStation/Xbox). Server computes `runsGta6` on each tier and `hasGta6` on each café
(any tier that runs it, or `supported_games` mentions GTA 6). Public endpoint `GET /api/v1/gta6-requests/config`
returns `{enabled, whatsapp}`.

### 2. Data: `gta6_slot_requests`
id, reference (`GR-` + 5 chars), user_id, cafe_id, tier_id, session_date, start_time, hours, seats, phone,
status (`requested | approved | booked | declined | expired | cancelled`), admin_note, suggestion (text),
booking_id (FK, set on Allow), decided_by, decided_at, created_at. New alembic migration (next number after main's head).
No PII beyond what the account already holds; the phone is required (we must be able to WhatsApp the player).

### 3. Player flow
1. Checkout (`bookings/new`) on a `runsGta6` tier while effective: sheet "Are you playing GTA 6?".
   No → continue as today. Yes → message: "Due to high demand we check with the café first" + **Request this slot**.
2. `POST /gta6-requests` (auth required, one open request per user+slot) saves it, notifies admins (push to admin
   users + email), and the app opens `wa.me/<founder>` pre-filled with café, date, time, console, reference.
3. Status screen `/gta6-requests/[id]` (polls): Waiting → **Approved: pay in 15 min** (links to the held booking's
   normal payment screen) / **Declined** (note + suggested slot + other GTA 6 cafés) / Expired.
4. Requests unanswered after 60 minutes become `expired` (cron already exists for reminders; reuse it).

### 4. Admin: `/admin/gta6-requests`
Tabs Waiting / Allowed / Declined. Each card: player name + phone, café, console, slot, age.
Buttons: **WhatsApp the café** (pre-filled with the slot, café phone), **WhatsApp the player**, **Allow**,
**Decline**, **Suggest another slot** (free-text + optional date/time; sent to the player, status `declined`).
Top of the page: the on/off switch, "stop automatically on" date, WhatsApp number.
**Allow** (transaction): re-check capacity through the normal booking service and create the booking as
`PENDING_PAYMENT` with the existing 15-minute TTL, link it (`booking_id`), status `approved`, push + email the
player. If capacity is gone (two players, last console) Allow fails with a clear message and nothing is created.
If the hold lapses unpaid, the status becomes `expired` and the slot frees by the existing mechanism.
Paying turns it into `booked` (status follows the booking).

### 5. Home page and cafés (subtle)
- Café card / café page: a small "Plays GTA 6" chip when `hasGta6`.
- Home: one slim strip near the top, "GTA 6 is live. Pick a café and book" → `/drops?game=gta6`; shown while request
  mode is effective or until a fixed end date; everything else on Home is untouched.

### 6. Sunset
Admin flips the switch (or the end date passes): no more question, no new requests, in-flight requests still work
until resolved, normal instant booking resumes everywhere. The strip disappears; chips stay.

## Errors and edge cases
- Player abandons the WhatsApp step: the request still exists and shows in the queue.
- Two players, same last console: the first Allow wins, the second Allow errors (not silently double-held).
- Player answers "No" but plays GTA 6: accepted risk (honour system, founder's call).
- Founder number unset: the request is still saved and shown in admin; the WhatsApp button is hidden.
- Café with no phone: admin sees "no number", WhatsApp-the-café button disabled.

## Testing
Backend: allow creates a held booking; second allow on a full slot fails; expiry; gate (off / until date); `runsGta6`
and `hasGta6` flags; auth and one-open-request rule. Frontend: vitest for gate helpers; real-browser check of the
checkout question, status screen and admin queue with mocked API (as done for the casual list). Dev first, the founder
runs the deploy.

## Open items for the founder
1. 60-minute auto-expiry of unanswered requests: OK, or shorter/longer?
2. Approved-hold length: 15 minutes (existing) or longer, so the player has time to open the app?
3. Strip end date default (suggest 3 Dec, two weeks after launch) and the founder WhatsApp number to use.
