# KHEL-O Tutorial Video System (v1)

> **Start with [TUTORIAL-LITE.md](TUTORIAL-LITE.md).** This document is the polished, later-stage version for when the team has more time.

Owners of this doc: Uzair (decisions) · Satvik + Niaz (production).
Goal: a small, consistent library of 20–45 second, task-focused videos, in English + Hindi, for customers and café owners.

---

## 0. The ten decisions (read this first)

| # | Decision | Our standard |
|---|---|---|
| 1 | Aspect ratio | **9:16 vertical, 1080×1920, 30 fps**, for every video |
| 2 | What's on screen | The real KHEL-O site in a **mobile viewport**, no phone frame, no person |
| 3 | Length | **20–45 s** per video. Hard cap 60 s. One task per video |
| 4 | Voice | One English voice + one Hindi voice (ElevenLabs), same voices for the whole library |
| 5 | Captions | Always on, burned in, bottom zone, **both languages get their own file** |
| 6 | Music | Very quiet instrumental bed (-28 dB under the voice) or none. No SFX except a soft "tap" tick |
| 7 | Guidance on screen | Tap ripple + zoom + one highlight ring per step. No arrows by default |
| 8 | Data | Record **only on the demo owner account / demo café**, never on real cafés or real customers |
| 9 | Versions | 1 recording, 2 voiceovers → **2 exports** per tutorial (`_en`, `_hi`) |
| 10 | Review | Nothing is uploaded until Uzair (or a nominated reviewer) signs the checklist in section 9 |

Why vertical: gamers watch on phones, and café owners will mostly receive these on **WhatsApp** during onboarding. Vertical fills a phone screen; horizontal does not.

> **Confirm with Uzair before Satvik starts:** do owners run the dashboard on a phone or a laptop? If the owner dashboard is awkward at 430 px width, we either fix the layout or record those few videos in a 16:9 variant with the *same* brand style. Check three owner screens (Availability, Bookings, Analytics) at 430 px first. Don't discover this on day 4.

---

## 1. Video format in detail

### 1.1 Canvas layout (1080 × 1920)

```
┌──────────────────────────┐
│ top band       170 px    │  "Step 2 of 4" chip + short title (e.g. "Pick your time")
├──────────────────────────┤
│                          │
│  screen area   860×1520  │  rounded corners (24 px), soft shadow,
│  centred, 110 px margins │  recorded at 430×760 viewport (same ratio)
│                          │
├──────────────────────────┤
│ caption band   230 px    │  burned-in captions, max 2 lines
└──────────────────────────┘
```

- **Background:** solid `#111318` (our `text-primary` dark) with a faint radial lift behind the screen. Not white: the site's own surface is light (`#F1EFEA`), so a dark canvas makes the screen pop.
- **No phone frame.** A frame wastes ~15 % of pixels and makes text unreadable. The rounded-corner screen is enough.
- **No presenter / avatar.** We're a small team; a face adds cost and no clarity.
- **Logo:** small KHEL-O joystick mark, top-left of the top band, 64 px, always present. Full logo only on the end card.
- **Why 860×1520 and 430×760:** both are 0.566 ratio, so the recording scales with zero cropping. Record at 2× device pixel ratio for sharp text.

### 1.2 Guidance on screen (keep it minimal)

1. **Tap ripple** at every click/tap (see SOP 5.3).
2. **Zoom-in** (≈ 140–160 %) on the area being used, then back out after the action. This is the single most useful effect: at 860 px the site text is small.
3. **Highlight ring** (primary `#E54D42`, 4 px, 12 px radius, soft pulse) around the one thing to tap or read.
4. Arrows only when the target is genuinely hard to spot. Max one per video.
5. No emojis in the screen, no stickers, no flashy transitions.

### 1.3 Captions

- Font: **Plus Jakarta Sans Bold** (already our body font) for English *and* Hindi (it has no Devanagari. Use **Noto Sans Devanagari Bold** for Hindi captions; both are free).
- Size: 56–60 px. White text, 4 px `#111318` outline, no box.
- 2 lines max, ~28 characters per line (Hindi ~24). Centred inside the caption band.
- Highlight the **one key word** per caption in `#E54D42`. Not more than one.
- Animation: simple fade/pop-in of each caption, 0.15 s. No karaoke bounce.
- Captions are **burned in** (not .srt) because WhatsApp and Instagram autoplay muted.

### 1.4 Intro / outro

- **Intro: none.** Video starts with the title chip and the first screen within 1 s. Nobody wants a logo sting before a 30 s tutorial.
- **Outro:** 2 s end card. KHEL-O logo, one line ("Need help? support@…" / or "Ask us on WhatsApp"), dark background. Same for all videos.

### 1.5 Music and sound

- Optional. If used: one royalty-free instrumental track (CapCut library "commercial use" tagged, or Pixabay), same track every video, 15–20 % volume, auto-ducked under the voice.
- Voice must be the loudest thing: target roughly -16 LUFS (CapCut's "Normalize loudness").
- One soft tap sound per tap is fine. Skip whooshes.

### 1.6 English vs Hindi

- **Same recording, same timing target, two voiceovers.** Hindi is usually 10–20 % longer when spoken, so the recording needs "breathing room" (pauses where nothing changes) that we can stretch or cut.
- Hindi style: **conversational Hinglish, not textbook Hindi.** Keep product words in English: *booking, dashboard, slot, console, PC, payment, offer, availability*. A café owner says "booking confirm karo", not "आरक्षण की पुष्टि करें".
- Captions in Hindi: Devanagari script (readable at a glance). Product words may stay in Latin script (e.g. "booking" or "बुकिंग" — pick one and stick to it, see glossary 5.4).
- On-screen UI is in English in both versions (the product is English). That's fine and expected. Mention this in the Hindi VO ("screen par jo 'Book Now' button hai…").

---

## 2. The tutorial library

Tag each: **P1** = needed this week (covers every core task), **P2** = next, **P3** = nice-to-have.
Aim: **22 P1 videos (9 customer + 13 owner)**; everything else waits. Quality + consistency beats count. Each P1 video is one flow, one task.

Source of truth for screens: `frontend/src/app` routes (`browse`, `cafe/[id]`, `bookings/new`, `owner/*`, etc.).

### A. Customer tutorials

| ID | Title | Covers | Pri |
|---|---|---|---|
| C01 | What is KHEL-O (30 s) | What it does, who it's for, 3 things you can do. The one "brand" video | P1 |
| C02 | Create your account | Sign up (email / Google), verify, what the name/phone is used for | P1 |
| C03 | Find a café near you | `browse`: city, search, filters, map/list, activity types (PC, PS5, VR, snooker…) | P1 |
| C04 | Read a café listing | `cafe/[id]`: photos, hardware tiers, pricing, rating, timings, offers, what "Booking Soon" means | P1 |
| C05 | Book a session (full flow) | Pick setup → date → time → duration → players → pay → confirmation. **The hero video** | P1 |
| C06 | Choose duration, players and add-ons | Min/default minutes per setup, extra players, how price changes | P1 |
| C07 | Co-op / shared console gaming | Shared-console pricing, play mode, splitting with friends | P1 |
| C08 | Offers and promo codes | Auto-applied offers, chips on the listing, entering a code, campaign links (`/c/<slug>`) | P1 |
| C09 | Paying (Razorpay) | UPI/card/wallet, what happens if payment fails, "my money was deducted" | P2 |
| C10 | Your booking confirmation + check-in | Booking page, QR/code, what to show at the café, arriving late | P1 |
| C11 | Manage your bookings | `bookings`: upcoming/past, rebook | P2 |
| C12 | Cancel or reschedule | Cancellation rules, refund timing (match `refund-policy`) | P2 |
| C13 | Leave a review | Post-visit review flow, what's public | P2 |
| C14 | Badges and achievements | `achievements`, Early Voter, Day One OG, member number | P3 |
| C15 | "Notify me" for Booking Soon cafés | Waitlist, once-only go-live email | P2 |
| C16 | Vote for a café / know the owner | Lead vote flow, `know-the-owner` intro | P3 |
| C17 | Profile, notifications, change email | `profile`, notification prefs, activity preferences | P3 |
| C18 | Getting help | `support`, contact | P3 |

### B. Café owner tutorials

Think like a first-time owner who has never used software like this. The things that actually confuse people are marked ⚠.

| ID | Title | Covers | Pri |
|---|---|---|---|
| O01 | Welcome: what KHEL-O does for your café | 30 s pitch + the 5 things you'll do in the dashboard. Show the whole journey: sign up → verified → live → first booking → payout | P1 |
| O02 | Sign up and start onboarding | `owner/onboarding`, invitation (`accept-invitation`), what documents/info you need *before* starting ⚠ | P1 |
| O03 | Set up your café profile | Name, address & map pin, photos, timings, amenities. ⚠ photo quality tips; what customers see | P1 |
| O04 | Add your gaming setups | Consoles/PCs/VR/tables, hardware tiers (`owner/tiers`), how many units of each ⚠ "what is a tier / setup / unit?" | P1 |
| O05 | Set your prices | Per-hour pricing, shared-console pricing, min/default minutes, peak vs normal. ⚠ price shown to customer vs what you receive | P1 |
| O06 | Set your availability | `owner/availability`: weekly hours, holidays, closing early ⚠ difference between timings, availability and blocked slots | P1 |
| O07 | Verification: what happens after you submit | Review status, what "pending/approved/rejected" means, how long, how to fix a rejection ⚠ biggest anxiety point | P1 |
| O08 | Your bookings dashboard | `owner/bookings`: today, upcoming, status meanings, customer details | P1 |
| O09 | Check customers in (scanner / code) | `owner/scanner`, wrong/expired code, walk-ins ⚠ | P1 |
| O10 | Walk-ins and phone bookings | Blocking a unit for a customer who walked in so the site doesn't double-book ⚠ | P1 |
| O11 | Block a console / PC for maintenance | Mark a unit unavailable, re-enable | P1 |
| O12 | Cancel or change a booking as the owner | When you can, what the customer sees, refunds | P2 |
| O13 | Create an offer | `owner/offers`: types, dates, who sees it, pausing it ⚠ cost to you vs platform-funded | P2 |
| O14 | Payouts: how you get paid | `owner/payouts`: settlement cycle, platform fee, what "pending" means, bank details ⚠ money question #1 | P1 |
| O15 | Understand your Insights | `owner/analytics`: plain-language insights, busiest hours, what to change | P2 |
| O16 | Reviews: reading and replying | `owner/reviews` | P2 |
| O17 | Add staff | `owner/staff`: roles, invite, what staff can't see (payouts) | P2 |
| O18 | Notifications | `owner/notifications`: push/email, new-booking alerts, enabling them on phone ⚠ owners miss bookings if push is off | P1 |
| O19 | Demand and "notify me" | `/demand/<slug>`: seeing how many gamers are waiting | P3 |
| O20 | Settings and getting help | `owner/settings`, `owner/support`, contact | P2 |
| O21 | Pause or close your café temporarily | Vacation/closing, existing bookings ⚠ | P2 |
| O22 | FAQ shorts (30 s each) | "Why isn't my café showing?", "Customer says paid but no booking", "How do I change my price?", "How do I add a second location?" | P3 |

### B2. Things a first-time owner will get confused about (turn these into scripts)

1. The vocabulary: **café vs setup vs tier vs unit vs slot.** Do one 25 s "KHEL-O words" glossary video (O00) or put a 3-second definition card in the first video that uses each term.
2. "Is my café live?" Verification status → what customers see → what to do.
3. Double-booking: walk-ins, phone bookings, and online bookings in the same room.
4. Timings vs availability vs blocked slots.
5. Money: what the customer pays, platform fee, GST (if applicable), payout date. Say it plainly, with a worked ₹ example.
6. What happens when a customer doesn't show up / arrives late / wants to cancel.
7. Turning on notifications, otherwise they won't see bookings.
8. Co-op/shared console pricing: easily misread as a price per player vs per console.
9. Photos: what makes a good listing photo (a 25 s tip video has high ROI).
10. Who to contact when stuck (WhatsApp / support), and response time.

---

## 3. Structure of every video

The sample structure in the brief (0–2 hook, 2–5 start screen, 5–20 steps, 20–25 result, 25–30 conclusion) is good for 30 s. Use this slightly tighter version because tutorials fail when they start with talk:

| Time | Beat | Rule |
|---|---|---|
| 0–3 s | **Promise** | "Here's how to [task] in [N] steps." Title chip appears. Screen already visible |
| 3–5 s | **Start point** | Where we begin: "From the home page…" Show the starting screen, nothing moves |
| 5–30 s | **Steps (max 5)** | One action per sentence. Each step: caption + tap ripple + zoom. Step counter chip updates "1/4" |
| +3 s | **Result** | Show the outcome (confirmation page, new listing). Hold 2 s |
| +3 s | **Close + next** | One line: what to do next / which video comes next. End card 2 s |

Rules:
- **One task per video.** If it needs "and", it's two videos.
- **Max 5 steps.** If 6+, split it or merge steps.
- **Voice leads, hand follows**: say the action, then do it (≈ 0.4 s later). Never act in silence for > 1.5 s.
- **Words per second**: English ≈ 2.3 words/s (30 s ≈ 70 words). Hindi ≈ 2.0 words/s (30 s ≈ 60 words).
- **Don't narrate what's obvious** ("click the button that says Book Now" → "Tap **Book Now**").
- Every video ends with a **success screen**, not a mid-flow screen.

---

## 4. Tooling (decide once, use forever)

| Job | Tool |
|---|---|
| Script | Google Doc/Sheet (template in section 8) |
| Voice | ElevenLabs |
| Screen recording | **OBS Studio** (free, reliable), region capture of Chrome |
| Tap indicator | Chrome DevTools device mode (shows a touch circle) + Windows PowerToys *Mouse Highlighter* (`Win+Shift+H`) as backup |
| Editing / captions | CapCut (desktop) |
| Storage | Shared Drive: `KHELO-Tutorials/<ID>_<slug>/` |
| Tracking | One Sheet: ID, status, owner, links, reviewer, date |

---

## 5. Production SOP for Satvik

### Step 1 — Understand the feature (before recording anything)

Checklist (do not skip: most re-recordings come from skipping this):
1. Use the feature yourself **twice** on the dev site. First to learn it, second to rehearse the exact path.
2. Write the 3-line summary: *Who is this for? What task does it complete? What does success look like on screen?*
3. List the exact click path (e.g. Browse → filter PS5 → café card → Book → date → time → duration → Pay → Confirmation).
4. Note every **edge** you will *not* show (errors, rare cases) and where it lives instead (FAQ short).
5. Ask Uzair or Niaz about anything you're unsure of (price rules, refund rules, statuses) **before** writing. Never guess a rule on camera.
6. Confirm which **environment** is the source: record on **dev** or **prod** with the demo account only (see 5.3).

### Step 2 — Write the script

Use the template in section 8.

**English**
- Write like you're explaining to a friend across the table. Short sentences (< 12 words). Present tense, imperative: "Tap **Book Now**."
- Say the on-screen label exactly as written in the UI, in bold in the script.
- One sentence = one action = one screen change.
- Numbers and ₹ amounts: write how they're spoken ("five hundred rupees"), not "₹500", so ElevenLabs reads them right.
- Total words: 55–80. Read it aloud with a stopwatch; if it's > 40 s, cut.

**Hindi** (not a literal translation)
1. Write the Hindi **fresh from the English meaning**, not word by word. Or paste English into ChatGPT/Claude and ask for "natural Hinglish spoken by a Delhi/Hyderabad gaming café owner", then edit.
2. Keep English product words and button names ("Book Now", "Dashboard", "slot").
3. Write in **Devanagari** for ElevenLabs (it reads Devanagari more reliably than romanised Hindi). Test one line first.
4. Use "aap" (respectful), not "tum"/"tu".
5. A native Hindi speaker (Niaz or someone from the team) **reads it aloud once** before generation. If any line sounds like a textbook, rewrite it.
6. Aim for ≈ 15 % more time than the English.

**Glossary:** maintain `glossary.md` in the shared folder (English term → Hindi decision: "slot → slot", "booking → बुकिंग", "payout → payout"). Every new term gets added once and reused forever.

### Step 3 — Screen recording

- **Browser:** Chrome, fresh profile or Incognito, no extensions visible, bookmarks bar hidden.
- **Viewport:** DevTools → Toggle device toolbar → *Responsive* → **430 × 760**, DPR **2.0**, throttling off. Hide DevTools after setting (undock then close, the viewport stays).
- **Capture:** OBS → Window Capture of Chrome, crop to the viewport only (no address bar, no tabs). Canvas 860 × 1520 (or 1080 × 1920 and scale in CapCut). 30 fps, MKV/MP4, CQP quality 18.
- **Account/data:** Demo owner account + demo café only. Demo data is seeded by `backend/scripts/seed_demo_owner.py` (café slug `khelo-demo-*`; cannot be booked by real customers and is hidden from public/admin lists). Never show real customer names, phone numbers, emails, payout amounts or bank details. If you must use a real payment screen, use Razorpay **test** mode on dev.
- **Reset state** before each take (re-run the seed or use a fresh test customer) so every video starts from the same screen.
- **Notifications off:** Windows Focus Assist on, Chrome notifications blocked, close WhatsApp Web, mute the PC.
- **Cursor:** visible, large (Windows Settings → Mouse pointer size 2–3). Mouse highlighter on.
- **Speed:** move the mouse **slowly and straight** to the target, stop, pause 0.5 s, then click. Pause 1 s after every screen change so the viewer can read it.
- **Avoid:** wiggling, hovering over random items, scrolling back and forth, typing fast. Type slowly or paste.
- **One continuous take vs clips:** record **one continuous take per video** (easier to sync with the voice). If you mess up, pause 3 s and redo that step from the beginning of the step, and cut in CapCut. For long forms, record per-step clips.
- Record 5 s of "dead air" at the start and the end of every take.
- Always do a **dry run**, then 1–2 real takes. Keep the best one.
- **Naming:** `C05_book-session_raw_v1.mp4`.

### Step 4 — ElevenLabs

Setup (once, then never change):
1. Pick **one English voice** and **one Hindi voice**: calm, friendly, neutral, medium pace; no strong accent; same gender/vibe across both ideally. Preview with a real script, not the demo line.
2. Settings: Model **Multilingual v2** (or the current recommended multilingual model), Stability ≈ 50 %, Similarity ≈ 75 %, Style 0–10 %, Speaker boost on. Save these numbers in the shared doc and **never touch them again**.
3. Record the voice IDs and settings in `voice-settings.md`.

Per video:
1. Paste the final script (English). Generate one file per **sentence group** (not one 40-second blob), so retiming is easy and a mistake doesn't mean redoing everything.
2. Listen to the whole thing. Fix mispronunciations by respelling ("KHEL-O" → "Khel-Oh", "Razorpay" → "Razor-pay"). Add to `pronunciation.md`.
3. Repeat in Hindi.
4. Export as MP3/WAV. Name: `C05_en_vo.mp3`, `C05_hi_vo.mp3`.
5. **Never** use a different voice or setting for one video "just because".

Costs: ~1,000 characters per video per language. Check the plan's monthly character limit before bulk-generating. Regenerations burn credits, so proofread first.

### Step 5 — CapCut

**5.1 Project setup (use the template project, section 7)**
1. Create a project: **9:16, 1080 × 1920, 30 fps**.
2. Duplicate the **KHEL-O template project** (background, title chip, logo, caption style, end card already made). Never start from empty.

**5.2 Assemble**
1. Import the raw recording and the voiceover.
2. Scale the recording to **860 × 1520**, centre, add rounded corners (mask → rounded rectangle) and a soft shadow.
3. Lay down the voiceover. Align each sentence with its action: voice first, action ~0.4 s later. Trim idle time in the recording; use *speed 1.2–1.5×* only on long waits (loading, typing), never on important clicks.
4. Add a zoom for every important area: keyframe scale 100 → 150 % over 0.4 s, hold during the action, back to 100 %. Centre the zoom on the tap point.
5. Add a tap ripple overlay if the recording doesn't have one.
6. Add a highlight ring (shape, no fill, `#E54D42`, 4 px) on the one target per step. Fade in/out.
7. Update the step chip text ("Step 2 of 4") and title.

**5.3 Captions**
1. Auto captions → choose language → generate from the voiceover track (English video: English; Hindi video: Hindi / Hinglish).
2. **Proofread every caption.** Auto-captions will mangle "KHEL-O", "Razorpay", Hindi grammar and Hinglish. Fix word by word.
3. Apply the saved caption style (font/size/outline/position from the template). 2 lines max, bottom band.
4. Highlight one key word per caption in `#E54D42`.

**5.4 Music, loudness, export**
- Music: the single approved track at ~15–20 % volume, with fade in/out. Skip if it clashes with Hindi VO.
- Voice: normalise loudness. Check on a phone speaker and with earphones.
- Export: **1080 × 1920, 30 fps, H.264, bitrate ≈ 8–12 Mbps**, AAC 192 kbps. Name: `C05_book-session_en_v1.mp4`.
- After the English export, **Save project as** `..._hi`, swap voiceover + captions, re-time, and export `_hi`. Don't re-edit from scratch.

---

## 6. Standard visual language

| Element | Standard |
|---|---|
| Aspect/resolution | 9:16, 1080×1920, 30 fps |
| Canvas background | `#111318` with subtle radial gradient (`#1B1F27` centre) |
| Accent | `#E54D42` (brand red; from `--primary`), dark variant `#C83B31` |
| Light surface (the site) | `#F1EFEA` |
| Text on dark | `#FFFFFF`, secondary `#B8BCC6` |
| Fonts | Headings/step chip: **Space Grotesk Bold**. Captions: **Plus Jakarta Sans Bold** (EN), **Noto Sans Devanagari Bold** (HI). Same fonts as the site |
| Screen treatment | Rounded 24 px corners, soft shadow, no phone frame |
| Captions | Section 1.3 |
| Transitions | **Cut.** If needed: 0.2 s crossfade between steps. No spins, glitches, or zoom transitions |
| Animations | Fade/scale-in 0.2 s for chips and rings. Ease-out |
| Zoom | 100 → 150 % over 0.4 s, ease-in-out, centred on the target |
| Cursor | Large, white arrow with dark outline, plus 80 px translucent red tap ripple |
| Logo | Joystick mark, top-left of the top band, 64 px. Full logo on end card |
| Intro | None |
| Outro | 2 s dark end card: logo + one help line |
| Music / SFX | Optional single quiet track; soft tap tick only |

(Colours/fonts come from `frontend/src/globals.css` and `layout.tsx`. If the brand changes, update this table and the CapCut template together.)

---

## 7. Templates to build first (Day 1, before any real video)

Satvik builds these once. They save hours and guarantee consistency:
1. **CapCut master project:** canvas, background, screen mask, title chip, step chip, logo, caption style preset, end card, highlight ring, tap ripple.
2. **Script template** (section 8).
3. **ElevenLabs settings sheet** + `pronunciation.md` + `glossary.md`.
4. **Recording checklist** (printed on the shared drive).
5. **Pilot video: C05 or O05**, finished end-to-end in both languages, reviewed by Uzair. *Only then* start the rest.

---

## 8. Script template (one per video)

```
ID / Title:          C05 · Book a session
Audience:            Customer
Goal (one sentence): Book a gaming session and pay.
Starting screen:     Café page (demo café)
Success screen:      Booking confirmed page
Target length:       35 s
Steps:               4
Demo account:        <demo user>
Recorded by / date:

| # | Screen (what's visible) | English VO | Hindi VO | On-screen text/zoom | Time |
|---|-------------------------|------------|----------|---------------------|------|
| 0 | Café page               | Book a session in four steps. | चार steps में session book करें। | Title: Book a session | 0–3 |
| 1 | Tap "Book Now"          | Tap **Book Now**. | **Book Now** पर tap करें। | Zoom on button | 3–7 |
...
Notes / edge cases not shown:
Glossary terms used:
```

---

## 9. Review checklist (before upload)

- [ ] One task, ≤ 5 steps, ≤ 45 s
- [ ] Starts with the promise within 3 s; ends on a success screen
- [ ] Every price, rule, status and refund statement matches the live product / `refund-policy`
- [ ] No real names, phones, emails, bank/payout data, API keys or admin URLs visible
- [ ] No notifications, wrong tabs, dev banners, or `localhost` visible
- [ ] Voice is the standard voice; no mispronounced "KHEL-O"
- [ ] Captions proofread; one highlighted word per caption; within safe area
- [ ] Hindi sounds natural to a native speaker; product words match glossary
- [ ] Audible on a phone speaker; music doesn't compete
- [ ] File names correct; both `_en` and `_hi` exported
- [ ] Reviewer name + date logged in tracker

---

## 10. Workflow for every tutorial (the one-page version)

```
1. FEATURE   → use it twice, write the 3-line summary + click path
2. SCRIPT    → English script (≤ 80 words) → Hindi script (natural, Devanagari)
3. REVIEW    → Uzair/Niaz approve the script (rules, numbers, tone)
4. VOICE     → ElevenLabs English → check → ElevenLabs Hindi → check
5. RECORD    → demo account, 430×760, one clean take, pause on every screen change
6. EDIT      → duplicate CapCut template, align VO, zoom/ring/step chip
7. CAPTIONS  → auto-generate, proofread every word, apply style
8. EXPORT    → `_en` first, then swap to Hindi and export `_hi`
9. QA        → section 9 checklist, watch on a real phone, with and without sound
10. UPLOAD   → shared drive → tracker updated → (later) YouTube unlisted / in-app / WhatsApp
```

---

## 11. Things beginners overlook

1. **Review the script before recording.** A wrong refund rule discovered after editing means redoing everything.
2. **Recording real data.** One visible customer phone number or payout amount in a public video is a privacy incident. Demo account only.
3. **Hindi takes longer.** Plan pauses in the recording, and don't promise the same duration.
4. **Auto-captions are wrong a lot** in Hindi and for brand words. Budget 5 min of proofreading per language.
5. **Consistency drift**: someone changes the voice setting, font size, or caption position. Lock the template.
6. **Product changes break videos.** Keep a "Screens used" line in each script so we know which videos to redo when a screen changes. Prefer showing stable flows; avoid showing prices you may change (use the demo price or generic wording).
7. **Mute-first viewing.** Most people watch with sound off, especially on Instagram/WhatsApp. Captions must carry the whole message.
8. **Where will these live?** Decide hosting now: in-app help links, a YouTube channel (unlisted playlists, English + Hindi), WhatsApp-sized exports (< 16 MB; ≤ 40 s at 1080×1920 is about right at 8 Mbps), Instagram Reels. Think about a "Watch tutorial" link inside onboarding for owners.
9. **Don't make 40 videos before the pilot.** Do one end-to-end pilot first.
10. **Sound & light**: no room echo (ElevenLabs avoids this), but keep brightness and zoom consistent across takes.
11. **Backups**: keep raw recordings + CapCut project folder + final scripts on the shared drive. CapCut cloud alone is not a backup.
12. **Dev vs prod**: dev shows test data and dev banners. Record against a clean demo environment; check the browser tab/URL isn't visible.
13. **Accessibility**: high-contrast captions, no flashing, no instructions by colour alone.
14. **Consent/licensing**: ElevenLabs commercial rights depend on your plan. Confirm the plan allows commercial use. Use only licensed music.
15. **Measure**: track views/completion and "support questions after video" so you know which tutorials actually reduce confusion.

---

## 12. Week plan (suggested)

| Day | Output |
|---|---|
| 1 | Decisions confirmed (esp. owner phone vs laptop), templates built, ElevenLabs voices chosen, demo accounts verified, **pilot: C05 EN+HI** reviewed |
| 2 | Customer P1: C01, C02, C03, C04 |
| 3 | Customer P1: C06, C07, C08, C10 |
| 4 | Owner P1: O01, O02, O03, O04 |
| 5 | Owner P1: O05, O06, O07, O08 |
| 6 | Owner P1: O09, O10, O11, O14, O18 |
| 7 | QA pass, fix list, upload, tracker update |

Satvik + Niaz split suggestion: Satvik owns recording/VO/captions as briefed; Niaz owns Hindi script review, QA on a real phone, and the glossary. Both can edit, but only from the template.

> 22 P1 videos × 2 languages in a week is very ambitious for beginners (each video = 2 languages). If the pilot takes more than a day, drop C01/O01 or O10/O11 to P2 rather than cut quality.
