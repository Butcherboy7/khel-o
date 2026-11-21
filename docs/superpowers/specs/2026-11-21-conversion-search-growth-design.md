# Conversion insight, admin global search, CTA + share loop — 2026-11-21

Owner asked (overnight, full authority, ship to prod): know why people don't
convert, a real admin global search, a CTA on every page, and reasons to share.

## Evidence (prod, last 30 days, internal devices excluded)

- 5,177 sessions, but 1,613 of them were a single `/login` view on 14 Nov that
  left within 1 s (bot / link-scanner spike). Real ≈ 3,500 sessions, 76% phone.
- Normal booking: 601 sessions saw a café → 91 started booking → 11 saw the
  sign-in sheet → 5 opened Razorpay → 1 paid. 7 more payment orders were created
  and never paid (UPI app switch / in-app browser is the usual cause).
- GTA 6 drop: 94 picked a café → 134 picked a block → 31 picked a console → 3
  started payment. 8 confirmed reservations total.
- Search: 1,427 searches, 60 typed. Zero-result typed: "Gta 6" (bug: GTA 6 is
  the main thing we sell), "Delhi" typed while the city was Hyderabad (no
  cross-city), "Rox gaming lounge" / "Genz gaming cafe" (cafés we don't list).
- Sources: 1,232 Meta-ad sessions, ~480 Instagram, 48 friends, 23 ChatGPT, rest
  have no tag (we never record document.referrer, so Google/direct are invisible).

## 1. Conversion page (Admin > Insights > Conversion)

One endpoint `GET /admin/analytics/conversion?days=7|30|90`, one page.
Sessions exclude internal devices and "instant bounces" (one page view, ≤1 s,
no other event) which are counted and shown separately as likely bots.

- **Biggest leaks first**: plain sentences ranked by people lost per step.
- **Funnels** (sessions): café booking (visit → café seen → booking started →
  sign-in asked → payment opened → paid) and GTA 6 drop (drop seen → time picked
  → console picked → payment started → paid). Paid comes from the database
  (bookings / drop reservations), not from browser events.
- **Where people come from**: channel from utm, else referrer host (Google,
  Instagram, WhatsApp, ChatGPT/Perplexity, Direct). Per channel: sessions,
  saw a café, started booking, paid.
- **Pages**: views, average and median visible time, average scroll, exits and
  exit rate. Café pages can be grouped as `/cafe/*`.
- **First pages (landings)**: sessions and bounce rate (one page, <10 s).
- **Searches**: top typed searches (prefix keystrokes collapsed per session),
  zero-result searches and the city each was in.
- **Unpaid payments**: orders created but never paid, per café and amount.
- **Devices**: phone / desktop / tablet sessions and their conversion.

Tracking change: the first page view of a session also sends `ref` (referrer
host, never the full URL) and `land` (path).

Edge cases: empty ranges show "no data yet"; division by zero → "–"; huge
ranges capped at 90 days; admin/owner paths excluded; prefix searches ("G",
"Gt", "Gta") collapse to the last query in the burst.

## 2. Search fixes found by the data

- "gta", "gta 6", "gta6", "gta vi" match cafés with a setup that runs GTA 6
  (PS5 / PS5 Pro / Xbox Series).
- A query that is a known city name searches that city.
- Zero results: offer "Suggest this café" (existing suggestion inbox) and the
  city-not-listed WhatsApp sheet, never a dead end.

## 3. Admin global search

Ctrl/⌘ K or `/` anywhere in admin; sidebar box and phone header icon open it.
- Pages and actions (client registry, synonyms).
- Records (`GET /admin/search?q=`), top 5 per group with "See all":
  users, contacts without an account (GTA 6 list, slot requests, drop guests,
  waitlists, café suggestions, owner intros, challenge entries), cafés,
  bookings (reference / phone), drop reservations, payments (Razorpay ids),
  drops, offers/promo codes, campaign short links.
- Phone: digits only, +91/0 stripped, ≥3 digits. `@` → email first.
- Person panel: every place a phone number appears, with Call / WhatsApp / Copy.
- Admin only, rate-limited by the existing middleware, each search written to
  the admin audit log (query length + kind, not the raw number).

## 4. CTA on every page + share loop

- Every customer page ends in one clear next step (book / see GTA 6 cafés /
  join community), never a dead end; login and 404 pages included.
- After a paid booking and on the profile: "Bring your squad" invite link
  (`?utm_source=friends&ref=<code>`) with WhatsApp first. Invites that become a
  booking are counted on the profile ("3 friends joined") with a Squad Builder
  badge. No money reward is promised without the owner's say-so.

## Out of scope

Owner-side customer search; paid referral credit; Google/Bing console sign-up
(owner's accounts).
