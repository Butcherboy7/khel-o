# Putting KHEL-O on the Play Store — step by step

Personal developer account → Google requires a **closed test with at least 12
testers, opted in for 14 days in a row**, before you can publish to everyone.
Plan: about 3 weeks from creating the account.

Files you'll upload are in `marketing/play-store/` and `android/` (after
`bash android/build.sh`).

---

## Week 0 — before anything (website)

- [ ] Deploy this branch's website changes to prod (account deletion page,
      `assetlinks.json`, icons, offline page, white theme colour).
- [ ] Check https://khel-o.com/delete-account and
      https://khel-o.com/.well-known/assetlinks.json both open.
- [ ] Create the reviewer account (Google's reviewers must be able to log in):
      sign up on khel-o.com with email `playreview@khel-o.com` and a password
      you keep in your password manager. Don't use your own account.

## Day 1 — Google Play Console account

1. Go to https://play.google.com/console/signup with the Google account you
   want to own the app forever (a dedicated `khel-o` Gmail is better than a personal one).
2. Choose **Personal** account. Pay the **US$25** one-time fee.
3. Verify your identity (government ID — PAN or Aadhaar — and your legal name/address).
   Verification usually takes 1–3 days. You'll also verify a phone number and email.
4. Developer name shown on the store: `KHEL-O`. Contact email: `support@khel-o.com`.

## Day 2–3 — create the app

Play Console → **Create app**
- App name: `KHEL-O: Book Gaming Cafés`
- Default language: English (India) – en-IN
- App or game: **App**. Free or paid: **Free**
- Tick the declarations → Create.

### Store listing (Grow users → Store presence → Main store listing)

- **App name:** `KHEL-O: Book Gaming Cafés`
- **Short description (75/80):**
  `Book PC, PS5, Xbox & snooker at gaming cafés near you. See free seats live.`
- **Full description:**

```
KHEL-O is the easiest way to book a session at a gaming café near you.

Find a café
• Browse gaming cafés and game zones in your city: PC gaming, PS5, Xbox, Nintendo Switch, racing simulators, VR, snooker, pool and more.
• See which setups are free right now, before you leave home.
• Compare prices per hour, offers and reviews from real players.

Book in seconds
• Pick your setup, choose a time and how long you want to play.
• Playing with friends? Book co-op on one console or several seats together.
• Pay securely online with UPI, cards or netbanking (powered by Razorpay).
• No booking fee on your first booking.

Walk in and play
• Your booking pass with a QR code is ready in the app. Show it at the counter and start playing.
• Free cancellation up to 2 hours before your session.

Earn as you play
• Collect badges and achievements every time you play.
• Join launch lists like GTA 6 and hear first when cafés open slots.

Own a gaming café?
• List your café on KHEL-O, get a notification for every new booking, see who's coming and get paid straight to your bank.

Questions? Write to support@khel-o.com
```

- **App icon:** `marketing/play-store/play-icon-512.png`
- **Feature graphic:** `marketing/play-store/feature-graphic-1024x500.png`
- **Phone screenshots (2–8):** all 5 in `marketing/play-store/screenshots/`
- **App category:** Lifestyle (alternatives: Entertainment). **Tags:** Booking, Gaming.
- **Contact:** email `support@khel-o.com`, website `https://khel-o.com`.
- **Privacy policy URL:** `https://khel-o.com/privacy`

### App content (Policy and programs → App content) — answer each

| Section | Answer |
|---|---|
| Privacy policy | `https://khel-o.com/privacy` |
| Ads | **No**, the app has no ads |
| App access | **All or some functionality is restricted** → add instructions: "Tap Log in (top right) and sign in with the email address and password below. Browsing cafés works without logging in; booking needs an account. Do not complete a payment." + the `playreview@khel-o.com` email and password |
| Content rating | Start questionnaire → email `support@khel-o.com` → category **All other app types** → violence/sexuality/language/drugs/gambling: **No** to all → "Do users interact or exchange content?" **Yes** (public café reviews) → "Share user's location with other users?" **No** → "Digital purchases?" **No** (bookings are for real-world sessions) → Save → expected rating: Everyone / PEGI 3 with "Users Interact" |
| Target audience | **18 and over** only (bookings are paid online). Appeal to children: **No** |
| News app | No |
| COVID-19 apps | Not a COVID app |
| Data safety | See next section |
| Government app | No |
| Financial features | **My app doesn't provide any financial features** (payments for café time are an ordinary checkout, not a financial service) |
| Health | No health features |
| Advertising ID | **No** — the app doesn't use it (checked: no AD_ID permission in the build) |

### Data safety form

Overview questions:
- Does your app collect or share any of the required user data types? **Yes**
- Is all of the user data collected by your app encrypted in transit? **Yes** (HTTPS only)
- Do you provide a way for users to request that their data is deleted? **Yes** →
  delete-account URL: `https://khel-o.com/delete-account`

Data types — tick these (everything else stays unticked):

| Category → type | Collected | Shared* | Optional? | Purposes |
|---|---|---|---|---|
| Personal info → **Name** | Yes | **Yes** (café you book) | Required | App functionality, Account management |
| Personal info → **Email address** | Yes | **Yes** (café you book) | Required | App functionality, Account management, Developer communications |
| Personal info → **User IDs** | Yes | No | Required | App functionality, Account management, Analytics |
| Personal info → **Phone number** | Yes | **Yes** (café you book) | Optional | App functionality, Account management |
| Financial info → **User payment info** | Yes (by Razorpay, processed ephemerally) | No | Required for paying | App functionality |
| Financial info → **Purchase history** | Yes | No | Required | App functionality, Analytics |
| Financial info → **Other financial info** (café owners' payout bank account, PAN) | Yes | No | Optional (owners only) | App functionality |
| Location → **Approximate location** | Yes | No | Optional | App functionality, Analytics |
| Messages → **Other in-app messages** (support tickets) | Yes | No | Optional | App functionality |
| Photos and videos → **Photos** (café owners' café photos) | Yes | No | Optional | App functionality |
| App activity → **App interactions** | Yes | No | Required | Analytics, App functionality |
| App activity → **Other user-generated content** (reviews) | Yes | No | Optional | App functionality |
| App info and performance → **Crash logs**, **Diagnostics** | Yes | No | Required | Analytics, App functionality |
| Device or other IDs | Yes (anonymous session ID) | No | Required | Analytics, Fraud prevention, security, and compliance |

*"Shared" = sent to a third party. The café you book receives your name, email
and phone so they can check you in. Razorpay (payments), Sentry (error
monitoring) and AWS (hosting) process data on our behalf, which Google does
**not** count as sharing.

Note on Sentry: about 1 in 10 visits (and every visit with an error) is
recorded as a screen replay with on-screen text visible. That's why App
interactions / Diagnostics are ticked and the Privacy Policy says so. To
collect less, set `maskAllText: true` in `frontend/instrumentation-client.ts`.

## Day 3 — closed test with 12 testers (the 14-day clock)

1. Test and release → Testing → **Closed testing** → Create track (name: `Testers`).
2. Countries: **India**.
3. Testers: create an email list with **at least 15** Gmail addresses (aim above 12 —
   if anyone leaves and you drop below 12, the 14 days restart).
4. Create release → upload `android/app-release-bundle.aab` → release name
   `1.0.0 (1)` → release notes "First test build" → Save → Review → **Start rollout**.
   (First time: accept **Play App Signing** — recommended, keep it on.)
5. Copy the **opt-in link** (Testers tab) and send it to every tester, with:

```
Hey! I'm launching the KHEL-O app on the Play Store and Google needs 12 people to test it for 14 days.
1) Open this link on your Android phone, signed in with the Gmail I added: <OPT-IN LINK>
2) Tap "Become a tester", then "Download it on Google Play" and install KHEL-O.
3) Open it a few times over the next 2 weeks — browse cafés, maybe book one. Please DON'T uninstall or leave the test for 14 days.
Thank you 🙏
```

6. **Right after the first upload:** Test and release → App integrity → App
   signing → copy the **SHA-256** of the app signing key → send it to Claude /
   add it to `frontend/public/.well-known/assetlinks.json` and deploy (see
   ANDROID-APP.md). Until then, testers see an address bar at the top.
7. During the 14 days: ask testers for feedback; fix anything on the website
   (that reaches them instantly, no new upload).

## Day 17+ — apply for production

1. Dashboard → "Apply for production" (unlocks after 14 days with 12+ opted-in testers).
2. Answer the questions about your test honestly (how you recruited testers,
   what feedback you got, what you changed, why you're ready). Google reviews
   this in up to ~7 days. Draft answers to adapt (replace the brackets with
   what really happened):
   - *How did you recruit testers?* "Friends, regular customers and café
     owners in Hyderabad who already book on khel-o.com; [N] testers."
   - *How easy was it to recruit?* "Easy — our customers are Android gamers."
   - *Describe the engagement:* "Testers searched cafés, compared setups and
     prices, made bookings and used QR booking passes at cafés over 14 days."
   - *Feedback and changes:* "[What testers said] → [what you changed on the
     site]." (Website fixes count: they reach the app instantly.)
   - *Who is the app for / value:* "Gamers in India who want to see which
     gaming café has a free PC or console right now, book and pay in advance,
     and walk in with a QR pass. Café owners use it to manage bookings."
   - *What changed vs. the website:* "Café owners get a push notification for
     every new booking; home-screen shortcuts, offline screen, full-screen app."
   - *Is it ready?* "Yes — [N] bookings made during the test, no crashes.
3. When approved: Test and release → **Production** → Create release → reuse the
   same bundle (or upload a newer one) → countries: India → **Start rollout**.
   You can roll out to a percentage first (e.g. 20%) and raise it later.
4. Review of the production release: usually a few hours, up to ~7 days.

## After launch — updates

- **Website changes:** just deploy. The app updates itself. No Play upload.
- **App shell changes** (icon/name/permissions) and the **yearly target-API bump**
  (every August): `bash android/build.sh --bump` → Production → Create release →
  upload `android/app-release-bundle.aab` → roll out. Reviews take hours to a day.

## Common rejection reasons to avoid

- Reviewer can't log in → keep `playreview@khel-o.com` working; never delete it.
- Data safety doesn't match the Privacy Policy → both were aligned on 2026-10-18;
  update both together if you add a new tracker or data type.
- "Minimum functionality" (just a website) → we have notifications, offline
  page, app shortcuts, full-screen; mention booking + QR passes in the
  production-access questions.
- Account deletion missing → it's at Profile → Delete Account and `/delete-account`.
