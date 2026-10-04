# KHEL-O Tournaments — MVP design

Date: 2026-10-05 · Status: approved by delegation ("take the decision for me … show me the developed product on dev")

## 1. Why

Cafés are quiet on weekdays and players want a reason to show up together. A tournament night fills stations for 3–4 hours,
brings 16–32 players plus friends, and gives KHEL-O content for reels. KHEL-O runs the first ones; cafés and companies
(brands, offices) run their own later, so the product is built around an **organiser**, not around KHEL-O.

## 2. What we borrowed and from whom

| From | What we take | What we leave |
|---|---|---|
| start.gg / Battlefy / Challonge | Register → check in → seed → bracket → call match → report score → advance. Byes for odd numbers. A TV view. | Swiss, double elimination, pools, APIs, ladders. Only single elimination (+ optional 3rd-place match) in the MVP. |
| FACEIT | Check-in closes the field: only checked-in players are seeded. No-show = walkover. | Anti-cheat, ELO. |
| District / BookMyShow | Event cards with date chip, venue, price, "Filling fast" / "Sold out"; a detail page with a facts strip and a **sticky bottom CTA**; an **e-pass with a QR/code**; "Add to calendar"; clear refund line. | Seat maps, coupons, ticket tiers. |

## 3. Decisions (and why)

1. **Organiser** = KHEL-O, a café, or a company. Each has members (users). The same console (`/host`) serves all three;
   admins see every organiser. A café owner is automatically a member of their café's organiser.
2. **Money (legal):** entry is Free or a fixed ₹ fee per team (a solo player is a team of one). Prizes are fixed and come from
   the organiser or a sponsor; they are never a share of entry fees (India's 2025 online money-game law). The create form says so.
3. **Format:** single elimination, optional 3rd-place match, team size 1/2/3/5. Covers EA FC, Tekken, SF6, MK1, Rocket League,
   Valorant. Battle royale (BGMI) is out: it needs lobbies, not brackets.
4. **Capacity first.** The organiser picks the setup (e.g. PS5) and how many stations to use. A calculator turns
   stations × match length into the longest field that fits, an estimated finish time, and a warning when it's too long.
   For "100 players, 4 PS4s" it says: about 32 fit in an evening; run two qualifier nights, then a final.
5. **Stations are reserved** for the tournament window, so normal bookings can't take them.
6. **Spots are held for 10 minutes** while a player pays, so two people can't buy the last spot. Holds count toward capacity.
7. **Waitlist** once full. When a spot frees, everyone on the waitlist is told; first to register gets it.
8. **Refunds:** paid entry is refunded only if the organiser cancels the event (marked for refund; money moves through the
   Razorpay dashboard for now). Free entries can be cancelled by the player any time before the start.
9. **Check-in at the door by code**: every pass shows a 6-character code (and QR of it). Staff type the code or search the name.
   No camera scanning in the MVP.
10. **Results feed a city leaderboard** (points: 1st 100, 2nd 70, 3rd–4th 45, quarter-final 25, played 10) and the champion
    gets a **Champion** badge on their profile.

## 4. Player experience

- **/tournaments** — upcoming events (filter by game), each card: generated poster (game colour + title), date chip,
  venue, entry (Free / ₹199), prize headline, spots left bar, status pill (Open, Filling fast ≥75%, Waitlist, Live, Done).
  A "Tournaments" strip on the home page links here.
- **/tournaments/[slug]** — hero, facts strip (When · Where (Maps link) · Entry · Prizes · Format · Spots), tabs
  Overview / Rules / Bracket / Players, organiser + sponsor, share. Sticky CTA: *Register · ₹199* → *Pay to confirm (9:41
  left)* → *You're in · View pass*; or *Join waitlist*, *Registration closed*, *Watch live*, *See results*.
- **Register sheet** — gamer tag (prefilled), phone (prefilled), team name + teammates (team games), accept rules. Then
  Razorpay (paid) or instant confirm (free). Sign-in happens first if needed and returns here.
- **Pass /tournaments/[slug]/pass** — e-ticket: code + QR, entry #, when/where, check-in window, Add to calendar (.ics),
  status (Confirmed → Checked in → Playing → Finished 3rd). On the day it shows **Your next match** and the station.
- **My bookings** gets a Tournaments section listing passes.
- **Notifications** (in-app + email): registered, spot opened (waitlist), event cancelled, **your match is called — PS5 · Station 2**.

## 5. Organiser console (/host)

- **Tournaments list** per organiser with status and fill.
- **Create / edit** (one page, sections): Basics (title, game preset → defaults for team size, match length, rules),
  Venue & stations (café, setup, number of stations), Date & time (start, check-in opens, registration closes), Capacity
  (max teams, live calculator), Entry (Free / ₹), Prizes (rows: place + description), Sponsor (name, logo URL), About.
  Save draft or Publish.
- **Manage** tabs:
  - *Overview*: registered / capacity, collected ₹, checked in, waitlist, share link, actions (publish, close registration,
    cancel event).
  - *Players*: list, search, status, check-in toggle, remove, **add walk-in** (name, phone, paid at counter).
  - *Check-in*: one big box for the code or a name, with recent check-ins.
  - *Bracket & run*: Generate bracket from checked-in players (random seeding, byes), visual bracket, a **match queue**
    (ready → assign station → Call → enter score → winner advances; Walkover for no-shows), "Now playing" per station.
  - *Results*: final placings appear automatically after the final; points and the Champion badge are granted.
- **TV screen /tournaments/[slug]/screen** — big bracket, now playing, up next; refreshes every 10 s.

## 6. Admin

- **/admin/tournaments** — every tournament across organisers, entries, money collected.
- **Organisers** — create a company organiser, add members by email (they then see /host).

## 7. Data model (migration 060)

- `organisers` (id, kind khelo|cafe|company, name, slug, logo_url, cafe_id?, created_at)
- `organiser_members` (organiser_id, user_id, role owner|staff) unique pair
- `tournaments` (id, organiser_id, cafe_id, slug, title, game_key, game_name, team_size, format, third_place, max_teams,
  entry_fee, starts_at, check_in_minutes, registration_closes_at, match_minutes, hardware_tier_id?, stations, prizes JSON,
  sponsor_name, sponsor_logo_url, about, rules, status draft|published|live|completed|cancelled, created_by, timestamps)
- `tournament_entries` (id, tournament_id, user_id?, gamer_tag, team_name, teammates JSON, phone, status
  held|confirmed|waitlist|cancelled|removed, check_in_code, checked_in_at, seed, amount, razorpay ids, paid_at,
  hold_expires_at, refund_due, final_place, points, source online|walk_in, created_at)
- `tournament_matches` (id, tournament_id, round, position, is_third_place, entry_a_id?, entry_b_id?, score_a?, score_b?,
  winner_entry_id?, status waiting|ready|called|done, station?, called_at, completed_at)

Bracket: size = next power of two; standard seed order; byes advance automatically; the winner of (round r, position p)
fills slot a/b of (r+1, p//2). The 3rd-place match takes the semi-final losers.

## 8. Rules the server enforces

- Only organiser members (or admins) manage a tournament. Players see only published+ tournaments.
- Registration: published, before `registration_closes_at`, not already entered, capacity counts confirmed + unexpired holds.
- Holds expire after 10 minutes; payment verification after expiry still confirms if a spot is free, else marks refund due.
- Check-in only for confirmed entries; the bracket is generated once (re-generate allowed until the first score).
- Scores: no draws; the winner advances; correcting a score is allowed until the next match using that winner is done.
- Cancelling an event marks paid entries `refund_due` and notifies everyone.

## 9. Out of scope (next)

Double elimination, round-robin groups, online/at-home matches, camera QR scan, automatic refunds, organiser payouts,
reminder scheduling (24 h / 2 h), poster upload, team invites by link, multi-day qualifier series.

## 10. Testing

Backend: bracket generation (2–33 players, byes), advancing/3rd place, capacity with holds, paid flow with a mocked
Razorpay signature, permissions (member vs stranger vs admin), check-in, cancel → refund_due, leaderboard points.
Frontend: real-browser click-through on a local stack (create → publish → register free → check-in → bracket → scores →
results → screen) plus dev deploy screenshots.
