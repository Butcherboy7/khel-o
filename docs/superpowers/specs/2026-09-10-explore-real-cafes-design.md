# Real Café Listings + Explore Redesign — Design Spec

**Date:** 2026-09-10
**Status:** Approved for implementation planning
**Scope owner:** Uzair

---

## 1. Goal

Seed 22 real gaming cafés (11 Bengaluru, 11 Hyderabad) as live listings on KHEL-O, and rework
the explore grid so it holds up under real content. Cafés are **visible and useful before they
are bookable**: a player can find them, see real photos, and ask to be notified when booking
opens. The resulting waitlist and view counts become the sales asset used to sign each café.

Nothing in this spec fabricates a fact about a real business.

---

## 2. Source material

`c:\Users\ADMIN\Desktop\all cafes .zip` — extracted layout:

```
all cafes/
  banglore/<cafe name>/           # 11 cafés  (NOTE: folder spelling is "banglore")
    <cafe>.txt                    # street address, single line
    Screenshot ....png            # 2–7 venue photos
  hyderabad/<cafe name>/          # 11 cafés
```

Measured facts (do not re-derive, these were verified):

| Property | Value |
|---|---|
| Cafés | 22 (11 Bengaluru, 11 Hyderabad) |
| Photos | 99 total, 2–7 per café |
| Portrait (<0.9 ratio) | 43 of 99 |
| Ratio range | 0.53 – 2.95 |
| Smallest width | 423px |
| Data in `.txt` | street address only — no hours, price, phone, hardware |

All 22 café folders contain exactly one `.txt`. Folder names contain typos (`colosseun  e-sporst.txt`, `gamres valhalla.txt`) — the
folder name is **not** the café name; derive the display name properly per §4.1.

---

## 3. Decisions already made

These were settled with the user. Do not relitigate them during implementation.

| Decision | Value |
|---|---|
| Listing state | Seeded as real listings, visible in explore, **not bookable** until claimed |
| Badge copy | **"Booking soon"** — one badge, not two stages |
| Why not "Opening soon" | These venues are already open and trading. Claiming a real business is closed is false. What is coming soon is booking *on KHEL-O*. |
| Palette | **Unchanged.** Light theme stays. No dark mode. |
| Card shadow | Warm-tinted (§7.1) — the only colour-adjacent change permitted |
| Photo ratio | **2:1 on mobile**, 16:9 at `sm:` and above |
| Hours | Never fabricated. Unknown hours → no open/closed claim anywhere |
| Hardware | Only recorded when a source states it; otherwise "Hardware coming soon" |
| Waitlist | In scope this pass. "Notify me" + counted waiting total |
| Waitlist count visibility | Hidden below **5**; button alone shown under threshold |
| View counts | **Owner-only.** Never shown on a public card |
| Email change | Allowed without email verification, **gated on current password** |

### Explicitly out of scope (phase 2)

City leaderboard · owner demand report · share-to-boost referral · founding-café commission
offer · launch-day notification blast. These are designed in §10 so phase 1 does not block them,
but **none of them get built in this pass**.

---

## 4. Workstream A — Data ingest

### 4.1 Normalisation rules

- `banglore` → city `Bengaluru`, state `Karnataka`
- `hyderabad` → city `Hyderabad`, state `Telangana`
- City string **must exactly match** an entry in `frontend/src/constants/cities.ts`
  (`SUPPORTED_CITIES = ['Bengaluru', 'Delhi', 'Hyderabad', 'Mumbai', 'Pune']`). A mismatch silently
  drops the café from that city's filter — see the comment in that file.
- Display name: title-cased, typos corrected, no folder artifacts. e.g.
  `League of extra ordinary numbers` → `League of Extraordinary Gamers` **only if** web research
  confirms the real trading name; otherwise keep the folder name cleaned up, do not invent.
- `pincode` is `nullable=False` on the model — parse it from the address string (all sampled
  addresses end in a 6-digit pincode).
- `phone_number` is `nullable=False` — use `PLACEHOLDER_PHONE = "0000000000"` where research finds
  none, matching the existing convention in `backend/scripts/seed_lead_cafes.py`.

### 4.2 Research protocol

For each of the 22 cafés, web-search for: opening hours, phone number, price per hour, station
counts and platform mix.

**Every field is recorded with a provenance state — `confirmed` or `unknown`. There is no third
state and nothing is guessed.**

- `confirmed` — a source (Google listing, the café's own site/Instagram) states the value. Record
  the source URL in the seed script as a comment beside the entry.
- `unknown` — leave the column `NULL`. Do **not** substitute a default.

Specifically:

- **Hours** — if unknown, `opening_time` and `closing_time` stay `NULL`. `isCafeOpenNow()` in
  `frontend/src/lib/format.ts` already handles null; verify it returns falsy rather than throwing.
- **Hardware** — only create a `HardwareTier` when a source states the platform and count.
  A café with no confirmed hardware gets **zero tiers**, and the card renders "Hardware coming
  soon".
- **Price** — `HardwareTier.price_per_hour` is `nullable=False`, so a tier cannot exist without a
  price. If hardware is confirmed but price is not, still create no tier — record the hardware in
  `Cafe.description` instead and leave the chip as "Hardware coming soon".

> **Correcting existing data:** the 6 cafés already seeded by `seed_lead_cafes.py` were each given
> a fabricated 10-seat PC tier at ₹80/hr by `bootstrap_lead_cafe_tiers.py`. Those tiers advertise a
> price the venue never agreed to. Delete them unless research confirms the real values.

### 4.3 Photos

Upload via `backend/app/services/storage_service.py`. It exposes `create_presigned_upload`,
`build_public_url`, `key_from_url`, `delete_object` — for a server-side batch, call the underlying
boto3 client from `_get_client()` directly rather than round-tripping through presigned URLs.

**Cover photo normalisation.** For each café pick the best landscape photo as the cover and
generate a 16:9 derivative server-side. This is what makes the grid uniform — 43 of 99 source
photos are portrait and would otherwise be centre-cropped to a sliver. Store the cover as
`photos[0]`; remaining photos follow in original form for the detail page.

Selection heuristic: prefer the widest-ratio photo ≥ 1.4; if none, take the highest-resolution
photo and centre-crop to 16:9.

### 4.4 Seed script

New: `backend/scripts/seed_real_cafes.py`, modelled on the existing `seed_lead_cafes.py`
(same `LEADS`-list shape, same `generate_password()`, same account+cafe creation flow).

Per café it creates:

- a `User` with `role=UserRole.CAFE_OWNER`, email `<slug>@khel-o.com`, generated password
- a `UserRoleMapping` row
- a `Cafe` with `verification_status=VERIFIED`, `is_active=True`, **`is_lead_listing=True`** (§5.1)
- `HardwareTier` rows only where §4.2 confirmed them

Idempotent: skip when the email already exists, exactly as `seed_lead_cafes.py` does.

---

## 5. Workstream B — Database

Migration `backend/migrations/versions/020_lead_listings_and_waitlist.py` (latest is currently
`019_add_analytics_foundation.py`).

### 5.1 `cafes.is_lead_listing`

```python
is_lead_listing: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
```

**Why a new column rather than reusing `bookings_paused`:** the customer search query in
`backend/app/repositories/cafe_repository.py` (~line 81) filters on
`Cafe.bookings_paused == False`. Setting that flag would remove all 22 cafés from explore
entirely — the opposite of the goal. `is_lead_listing` is deliberately **not** added to that
`where` clause, so lead cafés remain visible.

Backfill: `True` for the 6 cafés already created by `seed_lead_cafes.py` (match on
`email LIKE '%@khel-o.com'`), `False` for everything else.

### 5.2 `cafe_waitlist`

```python
class CafeWaitlistEntry(Base):
    __tablename__ = "cafe_waitlist"

    id:         Mapped[uuid.UUID]        = mapped_column(primary_key=True, default=uuid.uuid4)
    cafe_id:    Mapped[uuid.UUID]        = mapped_column(ForeignKey("cafes.id"), nullable=False, index=True)
    user_id:    Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    session_id: Mapped[str]              = mapped_column(String(64), nullable=False, index=True)
    contact:    Mapped[str | None]       = mapped_column(String(255), nullable=True)
    notified_at:Mapped[datetime | None]  = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime]         = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
```

- Unique constraint `(cafe_id, user_id)` where `user_id IS NOT NULL`, and `(cafe_id, session_id)`
  otherwise — one person, one vote. This is what keeps the count honest, which is the whole point.
- `contact` holds a phone/email only when a signed-out visitor supplies one.
- `notified_at` is written by the phase-2 launch blast; unused in phase 1 but present so the
  table does not need re-migrating.

### 5.3 Analytics index

`analytics_events.cafe_id` is currently the only column on that table without an index
(`session_id`, `user_id`, `event_type`, `created_at` all have one).

```python
op.create_index('ix_analytics_events_cafe_event_time',
                'analytics_events', ['cafe_id', 'event_type', 'created_at'])
```

Required before the §6.3 view-count query runs per-café.

---

## 6. Workstream C — Backend API

### 6.1 Waitlist endpoints

New router `backend/app/api/v1/waitlist.py`, registered in `router.py`.

| Method | Path | Auth | Behaviour |
|---|---|---|---|
| `POST` | `/api/v1/cafes/{cafe_id}/waitlist` | optional | Insert entry. Idempotent — a repeat call returns 200 with the existing row, never a duplicate or a 409. |
| `DELETE` | `/api/v1/cafes/{cafe_id}/waitlist` | optional | Remove the caller's entry |
| `GET` | `/api/v1/cafes/{cafe_id}/waitlist/count` | public | `{ "count": int, "joined": bool }` |

- Signed-in: key on `user_id`. Signed-out: key on `session_id` (same id the analytics client
  already sends — reuse it, do not mint a second one).
- `count` returns the **true** count. The ≥5 display threshold is a frontend concern (§7.3) so the
  number stays available for the owner-facing phase-2 work.

### 6.2 Booking guard

Booking creation must reject `is_lead_listing=True` cafés with a clear error
(`"This café isn't taking bookings on KHEL-O yet."`). Add the guard where the existing café
validation lives in `backend/app/services/booking_service.py` — find the current
verification/active check and extend it rather than adding a second validation site.

Also add the same guard to the availability endpoint, so the detail page never renders a slot
grid for a lead listing.

### 6.3 Owner view counts

Extend the owner dashboard API (`backend/app/api/v1/owner.py`) with a per-café demand summary:

```sql
SELECT COUNT(DISTINCT session_id)
FROM analytics_events
WHERE cafe_id = :cafe_id
  AND event_type = 'venue_viewed'
  AND created_at > now() - interval '30 days'
```

`venue_viewed` already fires — see `frontend/src/app/(customer)/cafe/[id]/CafeDetailClient.tsx:65`.
No new instrumentation is needed.

`COUNT(DISTINCT session_id)` is load-bearing: it counts **people**, not page refreshes. An
inflated number is worthless as a sales pitch, which is the only reason this metric exists.

Response shape: `{ uniqueViews30d: int, waitlistCount: int }`. **Owner and admin only.**

### 6.4 Email change

`backend/app/schemas/user.py` — `UserUpdateRequest` currently accepts `full_name`, `phone_number`,
`avatar_url` only.

```python
class UserUpdateRequest(BaseModel):
    full_name: Optional[str] = Field(None, min_length=2, max_length=255)
    phone_number: Optional[str] = Field(None, max_length=20)
    avatar_url: Optional[str] = Field(None, max_length=500)
    email: Optional[EmailStr] = None
    current_password: Optional[str] = None   # REQUIRED when email is present
```

Rules:

- When `email` is present, `current_password` is required and must verify. Reject with 400 otherwise.
- Uniqueness-check the new address against `users.email` (unique, indexed). 409 on collision.
- No verification mail is sent. There is **no email verification anywhere in this system** — the
  `User` model has no `email_verified` column and no verify endpoint exists. This adds no
  bypass; it fills a gap.

**Why the password gate matters here:** the seeded `@khel-o.com` addresses do not exist, so
forgot-password mails into the void. Password-gated self-service email change *is* the account
recovery path for these 22 owners. Without the gate, a leaked password becomes a permanent
account takeover on an account that holds payout bank details.

---

## 7. Workstream D — Frontend

### 7.1 Card shadow — `frontend/src/globals.css`

Current (lines ~41–42):

```css
--shadow-card: 0 4px 6px -1px rgba(0, 0, 0, 0.06),
  0 2px 4px -1px rgba(0, 0, 0, 0.04);
```

Replace with:

```css
--shadow-card: 0 4px 6px -1px rgba(72, 54, 42, 0.09),
  0 2px 4px -1px rgba(72, 54, 42, 0.06);
```

Same geometry, tinted toward the ground. A pure-black shadow over `--surface: #F1EFEA` reads ashy
rather than like a shadow cast on warm cream — and because `--card: #FFFFFF` on that ground is a
very low-contrast edge, the shadow is doing most of the work of separating card from page.

**Do not touch any other value in this file.**

### 7.2 `frontend/src/components/customer/CafeCard.tsx`

| Change | From | To |
|---|---|---|
| Photo ratio | `aspect-[16/9]` + `max-h-32 sm:max-h-36` | `aspect-[2/1] sm:aspect-[16/9]`, cap removed |
| Title type | `text-body-emphasis` + `font-bold` | `text-h3` (the token that already exists for card titles) |
| Title overflow | `truncate` | `line-clamp-2` |
| Rating row | Star + "New" + platform summary | Removed for lead listings (§7.3) |
| Auto-carousel | 4s `setInterval` over all photos | **Removed from the grid.** Cover photo only. |

On the carousel: 22 cards × up to 7 photos is 22 concurrent timers and constant motion, with no
`prefers-reduced-motion` guard. Photos stay on the detail page where the user chose to look.

Keep the existing `w-full` and `flex-shrink-0` on `CardImage` — the code comment there documents a
real mobile-Safari aspect-ratio bug and both are load-bearing.

### 7.3 Card content for lead listings

When `cafe.isLeadListing`:

```
[ cover photo, badge top-right: "Booking soon" ]
Café Name (h3, 2 lines max)
◎ Area · City
[ hardware chip ]              [ "37 waiting" if count >= 5 ]
```

- Hardware chip: `"12 PC · 4 PS5"` when tiers are confirmed, else `"Hardware coming soon"`
  (rendered muted/italic).
- Waiting count: rendered **only when `count >= 5`**. Below that, nothing — "1 waiting" does the
  opposite of what the count is for.
- **No open/closed badge**, no rating row, no price, no distance-based "from ₹X".
- Non-lead cafés keep today's card content unchanged.

### 7.4 `frontend/src/components/customer/ExploreClient.tsx`

- City selector: with only Bengaluru and Hyderabad carrying content, render those two plus
  "All Cities" as tabs rather than a 5-entry dropdown. Keep `SUPPORTED_CITIES` as the source of
  truth — filter it against cities that actually have results.
- **Facet availability:** platform chips, price slider, amenity buckets and "Open now" must hide
  when nothing in the current result set can satisfy them. Deriving this from the loaded result
  set is enough; no new endpoint. A filter that can only ever return zero should not be on screen.
- Leave the existing `search_performed` analytics call as-is.

### 7.5 `frontend/src/app/(customer)/cafe/[id]/CafeDetailClient.tsx`

For a lead listing, replace the booking panel with:

> **Booking soon**
> We're onboarding this café to KHEL-O right now. Want to know the moment booking opens?
> `[ 🔔 Notify me ]`
> *37 people waiting* ← only when ≥ 5

- Signed-in: one tap, no input.
- Signed-out: ask for phone or email, stored in `cafe_waitlist.contact`.
- After joining, the button becomes a confirmed state with an undo (`DELETE` endpoint).
- **No "Get directions" or "Call café" button on lead listings.** Those route the customer
  straight past KHEL-O to the venue, which defeats the purpose of the listing.
- `venue_viewed` continues to fire unchanged — it now feeds §6.3.

### 7.6 Types

`frontend/src/types/cafe.ts` — add to `CafeListItem` and `Cafe`:

```ts
isLeadListing: boolean;
waitlistCount?: number;   // true count from the API; threshold applied at render
```

---

## 8. Workstream E — Credentials & handover

- `seed_real_cafes.py` prints credentials once and writes them to
  `backend/scripts/out/real_cafe_credentials.csv`.
- **Add `backend/scripts/out/` to `.gitignore` before the first run.** These are live passwords for
  accounts holding payout bank fields.
- Credentials are never committed, never pasted into a doc, never written to agent memory.
- Reuse `reset_lead_cafe_passwords.py`'s approach for regeneration; extend its email list to cover
  the new 22.

**First-login claim flow.** On first login by a `CAFE_OWNER` whose email ends `@khel-o.com`, prompt
for a real email and a new password before the dashboard is usable. This is the moment
`is_lead_listing` flips to `False` and the café becomes bookable.

---

## 9. Acceptance criteria

1. All 22 cafés appear in explore for their city, with real photos and no fabricated hours,
   prices or hardware.
2. No café shows an "Open now" / "Closed" badge unless its hours were confirmed by a source.
3. Attempting to book a lead listing fails with a clear message at both the API and the UI.
4. A portrait source photo renders as a clean 2:1 cover on mobile and 16:9 on desktop, with the
   subject visible — verify against `mega gamerz` (481×803) and `clash of console` (476×806).
5. `League of Extraordinary Gamers` renders its full name across two lines without clipping.
6. Tapping "Notify me" twice produces exactly one `cafe_waitlist` row.
7. A café with 4 waiting shows the button and no count; at 5 it shows "5 waiting".
8. An owner can change their email with their current password, and cannot without it.
9. No filter chip is visible that cannot return at least one result.
10. The 6 pre-existing lead cafés no longer advertise a ₹80/hr tier they never agreed to.
11. `npm run build` and the existing Playwright suites pass.

---

## 10. Phase 2 (designed, not built)

Recorded so phase-1 schema choices don't block them:

- **City leaderboard** — rank by `cafe_waitlist` count per city. Needs no new data.
- **Owner demand report** — unique views, waitlist count, city rank, most-requested slots from
  `search_performed` metadata. This is the highest-leverage item on the list: it turns a cold
  outreach call into evidence of demand, and every input already exists.
- **Share to boost** — referral attribution on waitlist entries.
- **Launch blast** — on claim, notify every `cafe_waitlist` row and stamp `notified_at`.
- **Founding café offer** — time-boxed commission terms for the first N per city.

**Not to be built, in any phase:** fake live-viewer counters, resetting countdowns, invented
scarcity, inflated counts. The pitch to café owners is "this is real demand for your venue" — the
first owner who catches a fabricated number invalidates that pitch for all 22. Here the honest
number and the effective number are the same number.

---

## 11. Risks and open items

| Item | Status |
|---|---|
| Photo rights — these are other businesses' images, sourced from public listings | Flagged to the user; they chose to proceed. Remove on request from any owner. |
| Listing a café that hasn't agreed to be listed | Mitigated by `is_lead_listing` (not bookable) and the claim flow, not eliminated. |
| Zero-tier cafés appearing in search | The base query has no tier requirement, so they should appear — but `bootstrap_lead_cafe_tiers.py`'s commit message claims the 6 leads were "invisible in customer search". **Verify empirically before ingest**; if a hidden dependency exists, find it rather than working around it with a placeholder tier. |
| Research quality varies by café | Accepted. `unknown` is a valid, visible outcome. |
| Existing café/tier rows are test data | Confirmed safe to modify (as of 2026-08-27). |
