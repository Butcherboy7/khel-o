# KHELO — Marketing Context (from the codebase, docs and history)

**Written:** 2026-10-07 · **Status:** Part 1 of 2 — what the *product* is and what we can *measure*. Part 2 (founder vision, audience, business model, brand, competitors) is filled in from your interview answers and nothing else. No marketing ideas yet.

**How to read this file**
- **Fact** = read in code, docs or git history (file named where it matters).
- **Memory** = recorded in earlier working sessions with you; may be stale, dated where I know the date.
- **Inferred** = my reading; verify.
- **UNKNOWN** = not in the repo. Goes to the interview.
- **Live numbers** (section 11) come from read-only aggregate queries on production run on 2026-10-07 with your permission. No names, emails or phone numbers were read. The one big trap is the demo café "Level Up Arena" (see 11): it is 98.6% of all bookings in the raw database and is **not real**.

---

## 1. What KHELO is today (Fact)

A web app (installable PWA, Next.js frontend + FastAPI backend, Razorpay payments) where players find and book time at **gaming cafés and game zones in India**, and café owners run their bookings, offers and payouts.

- **Public positioning (site metadata):** "Book Gaming Cafés & Game Zones Near You — find and book gaming cafés, VR, snooker, pool and bowling near you. See live availability, compare prices and pay online — no calling ahead."
- **Scope has widened:** the original build was PC/console cafés. Code now supports PC, console (PlayStation/Xbox/Nintendo), VR, racing sims, snooker, pool, bowling, arcade and cricket sim (`backend/app/core/taxonomy.json`; spec `docs/superpowers/specs/2026-10-01-activity-taxonomy-design.md`).
- **Not in the app stores.** It is a website/PWA (manifest, service worker, web push).
- **Built fast:** first commit 2026-07-28; 616 commits by 2026-10-05; 60 database migrations; 140+ backend test files (740 tests passing on 2026-10-05).
- **Two spellings in use:** "KHEL-O" (site title, copy) and "KHELO" (campaign copy, some docs). Domains also vary in code (`khel-o.com` is the live one per memory; `khel-o.online` appears as a code fallback). Worth a decision.

## 2. Roles and what each can do (Fact)

| Role | Can do |
|---|---|
| **Player (gamer)** | Browse/search cafés by city, activity, style; view a café, its setups, prices, offers, photos, reviews; check live availability; get a server-side price quote; pay online; get a QR pass; cancel; review; earn XP/badges; share a café; vote for "Booking Soon" cafés; introduce us to a café owner |
| **Café owner** | Onboard (multi-step, UPI ID required, PAN/GSTIN optional); manage setups/pricing/hours/photos/menu; run offers; see bookings and live occupancy; scan QR to check players in; pause bookings / emergency mode; invite staff; see analytics and plain-language **Insights**; see payouts; see "demand" from voters |
| **Staff** | Check-in, daily bookings (via owner invitation) |
| **Admin (KHELO team)** | Verify cafés; manage users, bookings, payments, reviews, support tickets, promotions, campaigns, leads/owner intros; mark payouts paid with proof; platform settings (fee %), audit log, analytics suite |

## 3. User flows (Fact)

### 3a. Player booking flow
1. Land on home / `/browse` / city page `/cafes/<city>` / activity page `/cafes/<city>/<activity>` / café page `/cafe/<slug>` / a campaign link `/c/<slug>` or `/campaign/<CODE>`.
2. Pick a café and a **setup** (e.g. PS5 Pro, PC tier, VR, racing sim, snooker table). One tap goes to checkout.
3. Checkout: pick date, start time and **length** with a slider. Allowed lengths are 15, 30, 60 min, then 30-min steps up to 8 hours (never 45 min). Min/default length is set per setup by the owner. Earliest booking is 30 minutes from now.
4. **Co-op:** if the owner enabled it, 2–4 players can share one console; price = per-hour price + extra-player price × (players − 1). Off by default.
5. Offers: the best eligible offer applies automatically (server quote), or the player types a code. Near-miss hints ("Make it 1 hr").
6. Sign-in is required at checkout (email/password or Google). Pay via Razorpay (UPI etc.). The booking is held **15 minutes** for payment, then expires.
7. Confirmation: booking reference + **QR pass**; reminder before the session; at the café the owner/staff scans the QR to check in.
8. **Cancel:** allowed up to **2 hours before** the session; paid bookings are refunded through Razorpay (a failed refund is logged for manual handling). After the session the player can leave a review (reviews require a booking by default).

### 3b. Café owner flow
1. Discover `/partner` ("Get Listed on KHEL-O": zero upfront cost, discovered by nearby gamers, automated booking, weekly payouts) → register → onboarding wizard: venue details → verification (optional PAN/GSTIN/licence) → payout details (UPI) → hours, setups, prices → games and photos → review and submit.
2. Admin reviews and verifies. **Unverified cafés are capped** at ₹5,000 / 15 bookings.
3. Day to day: dashboard, bookings, QR scanner, availability timeline, block a setup/time, walk-in vs app-bookable seat split, pause bookings, emergency mode, staff accounts, offers, reviews (can reply), notifications (in-app + web push), support tickets, payout history.
4. A guided "owner guide" and plain-language Insights page exist (`owner_insights_service`).

### 3c. "Booking Soon" lead listings (demand-first onboarding) (Fact + Memory)
- Real cafés are listed before they join (`Cafe.is_lead_listing`, `waitlist_goal`). Players tap **vote / notify me**; votes keep counting past the goal; the café's go-live email goes out once per person.
- "Know the owner?" lets a player submit an owner's name/phone with consent; it lands in Admin → Leads.
- Admin can broadcast to voters and export CSV; `/demand/<slug>` is an owner-facing demand page.
- Helper badges: **Early Voter** (25 XP), **Matchmaker** (100 XP), **Local Legend** (500 XP).
- Memory: these are **real cafés**, not test data. The vote count is the pitch to the owner. Never delete or noindex them.

## 4. Money model (Fact from code; check against the live admin setting)

- **Player pays:** café price (after any offer) **+ platform fee** (default **4%** of the discounted price, set in Admin → Platform Settings; `PlatformSetting.platform_fee_percentage`). Config comment: 4% = Razorpay's real cost (~2.65% incl. GST) + KHELO margin (~**1.35%**).
- **Café receives:** list price − offer discount (inferred from settlement fields and past notes; the platform fee is charged to the player on top).
- **So KHELO's gross margin per booking is thin (~1.35% of booking value) if the fee is still 4%** — Inferred; confirm against the live setting. A `commission_percentage` setting (default 10%) exists in the schema but I could not find it used in the booking money calculation.
- **Owner payouts:** weekly (Monday), to the owner's UPI ID; admin marks payouts paid with UTR and proof screenshot; Razorpay auto-split ("Route") is **off** by default. A daily settlement-reconcile script backstops missed webhooks.
- **Platform costs:** Razorpay, AWS (S3 photos, email), Resend email, Sentry.
- **UNKNOWN:** whether the 4% is the intended long-term model, any subscription/ads/commission plans, KHELO's costs per month, runway.

## 5. Features that exist (Fact)

**Discovery:** city/activity/style filters; search with suggestions; location sharing (converted to a neighbourhood, coordinates dropped); programmatic SEO pages per city × activity/game/GPU/price with eligibility rules to avoid thin pages; sitemap; café slugs.
**Booking:** live availability, server quote, auto-applied offers, co-op pricing, per-setup booking lengths, 15-min payment hold, QR pass, reminders, cancel/refund.
**Offers:** percent / fixed-discount / fixed-price offers by time window, weekday, setup, solo/co-op, with caps and a shared real cap across multiple offers (campaigns).
**Campaigns:** short links `/c/<slug>` (with UTM stamping), offer campaigns with codes (e.g. KHELOSPECIAL), welcome pop-up and deals-first strip, an admin **"What to do next" advisor** (`campaign_advisor.py`), a QR-drop page `/100`.
**Loyalty:** Achievements page — XP, levels (every 500 XP), badges: Day One (OG), First Blood, Night Owl, Weekend Warrior, Regular Patron, Early Bird, Marathon Gamer, Squad Up, Café Explorer, plus helper badges. Easter eggs (Konami code, send-off line, 4h+ flame).
**Sharing:** every share link carries a unique id + UTM; shares → opens → signups → bookings tracked (WhatsApp, Telegram, Facebook, X, copy, native).
**Trust & safety:** invisible bot guard on sign-up/login/reset (2026-10-05), Google sign-in, audit logs, payout holds, demo/tutorial café excluded from public and admin views.
**Content/support assets in repo:** About page with team story; owner tutorial video plan (`docs/tutorials/TUTORIAL-LITE.md`: 8 short Hindi/English screen-recorded videos, CapCut captions); tester checklist PDF; QR-drop (`rs100-qr`).

## 6. What we can actually measure today (Fact)

All events live in one table (`analytics_events`: session, user, event type, café, metadata). Server stamps device class (mobile/tablet/desktop) and **in-app browser (Instagram/Facebook)** on every event. Staff/owner/admin and `?internal=1` devices are marked internal and excluded from reports.

| Area | Measurable |
|---|---|
| Traffic | page views/exits by day, source, device, landing page; interactions (`ui_action`) |
| Funnel | search → café viewed → booking started → sign-in shown → payment opened/failed/dismissed → booking completed (the last steps also from booking/payment status) |
| Campaigns | per campaign (created in Admin → Analytics → Campaigns): visitors, café opened, sign-ins, bookings, GMV, spend (typed by you, no Meta API), plus advisor steps; Meta ad IDs count via `extra_tags` |
| Acquisition | each user's first-touch source/medium/campaign and city |
| Shares | shares, opens, signups, bookings per channel and per café |
| Demand | votes per lead café, play-time preference, owner intros, notify-me counts |
| Geography | players' neighbourhoods (Hyderabad buckets) vs café neighbourhoods; searches with zero results |
| Money | GMV, KHELO fee revenue, owner settlement, refunds, payout status; revenue by café, setup, city |
| Café health | marketplace health, occupancy, per-café and per-setup performance, reviews |
| Owner-side | owner analytics and Insights (peak hours, offers performance, etc.) |
| Bots | blocked sign-up/login attempts |

**Not measured / not built (Fact or Memory):** Meta Pixel / conversion API (deliberately skipped); WhatsApp notifications (deferred); delayed cross-browser attribution; baseline-vs-lift analysis; owner "evidence pack"; retention/cohort and repeat-booking dashboards (I did not find them); no NPS/survey; no referral/squad-invite program (phase 2 idea only); tournaments not built; player cannot choose a *specific* station (bookings claim pooled capacity); no native app.

## 7. Current limitations (Fact/Memory)

- **Supply is the bottleneck.** A player can only complete a booking at a *live* café; the rest are "Booking Soon". Live cafés I know of from notes: DG Gaming Cafe and RockStar Gaming Cafe (Hyderabad). **UNKNOWN: current live count.**
- Thin margin per booking (see §4).
- Heavy reliance on Instagram traffic, **72% of campaign visitors arrived in Instagram's in-app browser** (Memory, 2026-10-05), where sign-in friction is a risk. Google sign-in does work there on iOS (confirmed by a friend with a screenshot).
- Sign-in is required before paying (a leak point).
- Owners onboard manually; payouts are manual; the founders pitch each café personally.
- Prices on prod for the launch café were set by hand for the campaign; Rockstar co-op pricing was still being confirmed.
- Production runs through a manual deploy (GitHub Actions billing blocked, repo private, per Memory).
- Hyderabad is the only city I saw with neighbourhood buckets in code.

## 8. Existing marketing-related functionality (summary)

Campaign links + short links + QR drop page; offer campaigns with real shared caps (fake counters deliberately refused); badges and OG member numbers; playful vote flow for lead cafés; shareable links with attribution; SEO page engine; admin analytics with an advisor; owner demand page; owner intro form; About page story; support tickets; web push + email notifications; tutorial video plan.

## 9. Timeline of what shipped (Fact: git history)

- **Jul 28 – Aug:** architecture, auth, café management, booking, payments, owner dashboard, admin, launch readiness audit (80% ready, Aug 2026), security/money audit (Aug 31).
- **Sep 6–9:** super-admin BI, café activities, manual payouts and owner onboarding v2.
- **Sep 10–22:** "explore real cafés", games/media/review, finance settlement, payout payables and promotions, activity-based preferences.
- **Sep 26–28:** admin Traffic, owner guide, café slugs and SEO pages, notify-me v2, ad-test tracking, co-op pricing and per-setup booking lengths.
- **Oct 1–3:** activity taxonomy, offers that auto-apply, Founders'/Special Access campaign, OG badge, lead vote and owner intros, payout history cards.
- **Oct 4–5:** real campaign short links, deals-first landing, admin advisor, bot guard, demo tutorial café, About Us page.
- **First paid test:** ₹1,000 / 2-day boost of a founder-story Reel (Sep 28 setup). As of 2026-10-05 the KHELO Special Access campaign showed 57 visitors, 1 opened a café, 0 bookings, ₹400 spent (Memory). The founder-story Reel itself had ~20k views / ~300 likes organically (Memory).

## 10. Facts about the team and brand visible in the repo

- **About page:** founders **Uzair** (builds the product and infrastructure) and **Bindu** (runs the company); **Sathvik** (customer acquisition specialist, also a major contributor), plus testers, café-relations, video editor (Niyaz), content ideas (Zeeshan) and a social media manager. An IIT Bombay alumnus is credited as the person who had the original idea (his name is not in my notes; confirm how you want him credited).
- **Voice already used in product copy:** playful, Gen Z, grateful (Zepto/Swiggy-style) for lead-café votes; plain and direct elsewhere.
- **Instagram:** @khelo.journey is the only handle found in code.
- **Rules you set in earlier sessions:** no fake urgency/counters; never treat lead cafés as fake; prize money must stay fixed (not pooled from entry fees) for tournaments; promote to production only when you say so.

## 11. Live production numbers (read-only queries, 2026-10-07)

### The demo-data trap (read first)
Production holds a **demo café, "Level Up Arena"** (slug `khelo-demo-level-up-arena-hyderabad`, 24 setups, created 2026-07-07), used for demos and tutorials. It has **3,489 bookings (~₹13.6 lakh), 44 fake gamers, ~3,238 payments with `demo_` ids**, and its settlements are flagged "Demo data - never payable". You confirmed it is a demo, not realistic. It is excluded from public search and admin stats in code, but **raw table counts include it**. Everything below separates real from demo.

### Real transactions: effectively zero (matches what you said)
| | Real (excl. demo) |
|---|---|
| Bookings | 50 total: 21 failed, 11 pending payment, 7 released by owner, 6 no-show, 3 cancelled, **2 completed** |
| Money | **8 real Razorpay payments totalling ₹14.56**, all ₹1–₹4 test charges (plus one failed ₹124.80 attempt at DG, 2026-09-20). **No real customer has paid.** |
| Real cafés that took test bookings | DG Gaming Cafe, Express game zone, "sathvik gaming cafe" (team test), Ghost hub5 (test), Rockstar |
| Platform revenue | ₹0 real |

The 21 failed and 11 pending-payment bookings come from 14 and 9 different accounts. Some are team tests, so I can't yet say how many were real players abandoning payment.

### Supply
- **Live and bookable (real):** DG Gaming Cafe (3 setups, joined 2026-09-17) and Rockstar Gaming Cafe (3 setups, 2026-09-23). Both Hyderabad. **That is the entire real supply.**
- **"Booking Soon" lead listings (real cafés, not onboarded):** 18 — Bengaluru 8, Hyderabad 6, Kompally 2, Kukatpally 1, Secunderabad 1.
- **Other café records:** 18 suspended, 6 rejected, 2 draft, including some junk/test entries ("aaaaagggggg") and cafés that tried onboarding. I don't know why the 18 are suspended.
- **Café-owner accounts:** 52. A burst of 12 signed up 2026-09-21→23 (cause unknown; looks like an outreach push). Only 2 owners have a live café.

### Demand
- **Real gamer accounts: 98** (142 raw minus 44 demo). **58 signed up in the last 30 days, 34 in the last 7.** Daily gamer sign-ups were 5–9 on 2026-09-30 → 10-04 (the boosted Reel), 1 on 10-05.
- **27 of those 98 tried to book something** (any status), none paid for real.
- **Lead-café votes:** 33 votes by 19 people across 13 cafés. Top: MNG Gaming Cafe (Hyderabad) 7, Rockstar 4 (before going live), BOUNCE Bowling 3, Lucky Billiards 3, Wlid Gaming 3. Owner intros: 2 (both still "new"). Helper badges earned: Early Voter 2, Local Legend 2.
- **Self-reported "how did you hear":** Instagram 42, referral 4, Google 2, QR drop 1, other 1, not recorded 149 (demo accounts and older users inflate this).
- **Reviews: 916, avg 4.34.** With only 2 real completed bookings these are almost certainly demo reviews, not real feedback (inferred; don't quote them).

### Website behaviour, last 30 days, internal traffic excluded (analytics began 2026-09-06)
Sessions per step: **1,813 visits → 1,428 searched → 513 opened a café → 123 started a booking → 4 reached sign-in at checkout → 1 opened payment.**
- Search and café views are healthy relative to traffic. The collapse is at **booking started → sign-in/payment (123 → 4 → 1)**. The checkout events only exist since 2026-09-28, so the 123 includes earlier sessions that couldn't be tracked past that step.
- Caveat: some of the 1,813 sessions are likely bots or the founders' own browsing. The bot guard only shipped 2026-10-05, and your notes mention about 33 bot sign-ups.
- Campaign "KHELO Special Access" (Meta boost, spend ₹400 recorded, started 2026-10-04): 18 landing views, 10 CTA clicks, 4 Instagram clicks, 0 bookings.
- 24 shared-link opens, 1 share created, 6 notify-me taps, 2 locations shared.

---

## PART 2 — Founder and business context (empty until interview)

> Filled only from your answers. Nothing below is assumed.

### Vision and why (interview batch 1, 2026-10-07; founder's words, lightly cleaned)
- **Origin:** KHELO started as a friend's idea. He thought about it for two weeks, then called and said, in effect, "Bro, I have this idea. Can you work on it and build it so I can check it out when it's done." Uzair built it.
- **Relationship with gaming:** mostly mobile gaming. Rarely went to gaming cafés; the ones he did go to were in childhood, for PlayStation 2. *(The founder is not a café regular. Note for content authenticity: don't write as if he is.)*
- **The problem, in one line:** "A player goes to a gaming café and finds it full, and the café owner loses his customer."
- **Why us (him and Bindu):** "The drive to do something and learn everything while doing it."
- **Goal:** scale KHELO to venture scale, "so that I can cash out and explore other apps and opportunities." *(An exit-oriented founder. Growth strategy should favour things that compound and are demonstrable to investors.)*
- **Name:** **KHEL-O**, because "khel" means "to play" in Hindi.

### What KHELO should become
- **3 years:** "Everyone in their college and friend groups uses it to enjoy their weekend."
- **10 years:** hosting events like District and BookMyShow, running tournaments for sports, bowling and gaming.

*Gaps from batch 1 (not yet answered):* how much of the idea and the story belongs to the friend vs. Uzair; the friend's role/stake today.

### Target audience (interview batch 2, 2026-10-07; founder's words, lightly cleaned)
- **Who walks into these cafés today:** young people, generally under 18, who can't afford a PlayStation and want to pay a few rupees to play with friends, e.g. FIFA or WWE.
- **Who KHEL-O is for:** (1) the same people who already go to cafés; (2) people who want to go to cafés and join gaming communities.
- **Activities that matter most now:** PC and console gaming, and **snooker** ("kind of big, and has a recurring audience").
- *Implication to check later, not a conclusion:* the core player is often a minor (under 18) paying small amounts, with UPI/Razorpay access and a phone possibly not their own. That affects payment, sign-in (Google account), parental consent and ad targeting.

### Café side
- Originally targeted small independent cafés. Changed: "the small ones barely have any traffic to give them a reason to use KHEL-O, so we have to target **chains and places with a lot of footfall**."

### Business model and unit economics (founder's words)
- **Now:** 4% charged to the customer.
- **When there are enough people:** 8% charged to the café owner.
- **Later:** paid featured listings; tournament sponsors; indie-game sponsors; brand sponsors (he named Razer as an example).
- Not asked yet: costs, runway, what "enough people" means in numbers.

### Traction (real numbers)
- Founder: "Zero paid bookings, barely any live users."
- **Verified against production on 2026-10-07:** correct. See section 11 for the full real-vs-demo picture (98 real gamer accounts, 2 live cafés, 18 lead listings, ₹14.56 in test payments).

### The problem, tested against what the founder has heard (interview batch 4, 2026-10-07)
- "We only heard a handful of owners say their café is full, **like 5 out of 150**." Owners usually say that **during college or office hours the seats are empty**.
- *So the originating idea ("player finds the café full, owner loses the customer") is true for a small minority. The more common pain the founder heard is **empty seats at off-peak times**.* This is anecdotal (conversations, not data), but it is the founder's own evidence.
- **Why DG and Rockstar joined:** "They had nothing to lose, and if we promise we will get the users, they said okay, we don't mind." They did not join because of a product feature they wanted.
- **Trust:** "People open our website but I think there's no trust factor for our website or brand." *(Founder belief; our data shows traffic and café views but almost no sign-ins at checkout, which is consistent with it but doesn't prove it.)*

### Community behaviour the founder has seen
- Gamers join **WhatsApp groups** and form **local squads**; they follow a café's **Instagram page** to see offers.

### Audience KHEL-O owns today (founder's numbers)
- **Instagram:** 256 followers (@khelo.journey).
- **WhatsApp:** "10–20 WhatsApp contacts … number 3 to 4 hundred" *(unclear: probably 10–20 groups/communities and about 300–400 contacts; to confirm)*.
- Real gamer accounts on the site: 98 (section 11).

### What has been tried
- Posters placed in cafés: **no bookings**.
- Boosted founder Reel and the ₹100 QR drop: see sections 9 and 11.
- Website visitors: "not much response."

### The team around the founder
- **Bindu**: co-founder, runs the company. **The friend whose idea it was** is now an **advisor and investor** ("kind of investing in us right now"; paid for this Claude subscription). He helps, not technically. He is okay with the 8% café-side model. **"Every business decision is mine and mine alone"** (Uzair).

### Marketing capacity (founder's words)
- **Time:** about **2 hours per day** on marketing.
- **Budget:** at most **₹500 per week**.

### Strengths and weaknesses (interview batch 3, 2026-10-07; founder's words, lightly cleaned)
- **Why anyone would choose KHEL-O over calling or walking in:** "Only if they are lazy to call or to show up and check if it's available."
- **Why they'd come back:** "Once they've discovered the venue from our app, I don't think there is any reason for them to use our app again" — unless KHEL-O funds incentives (discounts, coupon codes) or holds tournaments and organised events.
- **Strengths:** the founder said he doesn't know what KHEL-O is genuinely good at.
- **Weakest point:** "What problem are we trying to solve?" *(He is saying the core value proposition is not yet clear to him. This is the central strategic question; marketing should not paper over it.)*
- *My note, not his words:* the product's hard engineering (live availability, co-op pricing, offers engine, payouts, analytics) is built; what's unproven is *demand for it*. No real customer has paid yet (section 11).

### Competitors and alternatives (founder's words)
- Community channels (WhatsApp/Discord-style groups), each café's own Instagram page, Google Maps, **District** and **Playo**.
- Chains he wants: **Gamerz, Guild** and "other top gaming cafés." They haven't heard of KHEL-O and "have no reason to get listed with me unless I show them I have accumulated a gaming audience."
- *Note the loop:* chains want an audience; players have little reason to return without incentives or events; incentives need funding. This is a chicken-and-egg problem, to be treated as such later.

### Brand personality (founder's words)
- If KHEL-O were a person at a party: "someone cool who knows a lot of friends and has an identity and lives like there is no tomorrow, with semi-professional humour."
- **Brands KHEL-O should feel like:** **Playo, BookMyShow, District** (the same three he named as competitors/inspiration for the 10-year events vision).
- Not yet given: brands it should *not* feel like. Earlier sessions: Zepto/Swiggy tone for votes.

### Things KHEL-O refuses to become (founder's words)
- Gambling-style rewards.
- "Too much corporate-driven."
- Earlier sessions: no fake urgency/counters; real prize money only (never pooled entry fees).

### Under-18 players
- Not a concern to the founder: "It is not illegal to game as a minor; enjoying life is all they're doing." No marketing rules to minors specified yet. *(I will treat money-spend nudges and age-gated ad targeting as questions for later, not assume.)*

### Founder identity (interview batch 5, 2026-10-07; founder's words, lightly cleaned)
- **Visibility:** "Visible founder with a 'fuck it' mentality." "I'm ready to post anything." *(He did not name anything he would never post. The refuse-list from batch 3 still applies: no gambling-style rewards, nothing too corporate.)*
- **Brand feel:** "I don't want to look like an advertisement company."
- **He is not in the WhatsApp gaming groups himself**, and KHEL-O's total audience is about **500 people** *(clarified: not the 300–400 WhatsApp contacts plus 256 followers described earlier as separate pools)*.

### Outreach so far
- Café owners were **called all over India**; Hyderabad needs to be called again.
- Posters in two cafés: owners said nothing about the QR code. Founder's read: "there is not enough footfall to use the app in the first place, because every time I visit them they are empty."

### 90-day goal (January 2027), founder's numbers
- **₹20 lakh GMV, "personally earned ₹2 lakh", 10,000 players, 50 cafés, 50,000 Instagram followers.**
- *Starting point today (section 11): ₹0 real GMV, 98 real gamer accounts, 2 live cafés, 256 followers. See the reality check in the summary section below before using these targets.*

### Limits
- **Geography:** Hyderabad only "for a while."
- **Time:** 2 hours/day, sometimes 3–4. **Budget:** ≤ ₹500/week. **No other limits.**

### What makes KHELO different (in the founder's words)
- "A founder who builds fast" and is "hungry to grow." He did not name any product, audience or café advantage. Earlier, in batch 3: he doesn't know what KHEL-O is genuinely good at.
- *Facts from the code, not his words:* the product already has live availability, co-op pricing, an offers engine, a campaigns/analytics suite and an owner dashboard. Whether any of it differentiates in the eyes of players or owners is unproven.

---

## Interview status — COMPLETE, summary APPROVED by the founder (2026-10-07)

Corrections and final answers given at approval (founder's words, lightly cleaned):
- **Evidence limit:** "I have only visited three cafés, so it might not be as small as we think" (the full-café problem). The empty-café observation comes from those three visits; the "5 of 150 owners" figure is from phone calls. Both are anecdotal.
- **Trust:** "No trust is not proven. There was a lot of bots and traffic from the in-app browser." *(So the site's low sign-in rate cannot yet be blamed on distrust.)*
- **January goals:** "Far from today's numbers because if you're dreaming, why dream small? With proper funding and mentoring, we can hit those goals." *(Treated as an ambition that assumes funding and mentoring, not a forecast.)*
- **What KHEL-O has that's different:** a founder who builds fast and is hungry to grow.
- **Content boundary:** will do content, but not outside his comfort zone, "like stunts like IShowSpeed to get famous."
- **Never posts:** how bad things are going, because it would reduce people's trust in him.
- **Brands not to resemble:** none named beyond "an advertisement company."

---

## Open questions the codebase cannot answer
1. ~~Live numbers~~ Answered in section 11. Still unknown: how many of the 21 failed / 11 pending bookings were real players, and what the 18 "suspended" cafés are.
2. ~~Is the 4% player fee the long-term model?~~ Answered: 4% from players now, 8% from cafés later, then featured listings and sponsors. Confirm the live admin setting is really 4%.
3. ~~KHEL-O or KHELO?~~ Answered: **KHEL-O** (khel = play in Hindi). Still open: which domain is canonical (`khel-o.com` vs a `khel-o.online` code fallback), and clean up "KHELO" in campaign copy.
4. Which cities after Hyderabad, and why?
5. ~~Budget and time~~ Answered: 2 hours/day and ≤ ₹500/week. Open: who (Uzair, Bindu, Sathvik, Niyaz, Zeeshan, the social media manager) does what in those hours.
