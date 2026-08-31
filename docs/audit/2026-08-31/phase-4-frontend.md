# Phase 4 — Frontend State, Data Fetching & UX Correctness

**Scope (files actually read, in full unless noted):**
`frontend/src/store/authStore.ts`, `store/locationStore.ts`, `app/providers.tsx`, `app/layout.tsx`,
`app/global-error.tsx`, `app/(customer)/layout.tsx`, `app/(owner)/layout.tsx`, `app/(admin)/layout.tsx`,
`hooks/queries/keys.ts`, `hooks/useDebounce.ts`, `hooks/useMediaQuery.ts`,
`lib/api/client.ts`, `lib/api/errors.ts`, `lib/api/owner.ts` (partial), `lib/format.ts` (partial),
`components/layout/AuthGuard.tsx`, `CustomerShell.tsx`, `OwnerShell.tsx` (partial), `AdminShell.tsx` (grep),
`RoleSwitcher.tsx`, `components/providers/RoleSyncProvider.tsx`,
`app/(owner)/owner/scanner/page.tsx`, `app/(owner)/owner/dashboard/page.tsx`,
`app/(owner)/owner/onboarding/page.tsx` (partial), `app/(customer)/bookings/new/page.tsx`,
`app/(customer)/bookings/page.tsx`, `app/(customer)/bookings/[id]/page.tsx` (partial),
`app/(customer)/profile/page.tsx` (partial), `app/(customer)/cafe/[id]/CafeDetailClient.tsx` (partial),
`components/customer/ExploreClient.tsx`, `components/owner/EditCafeModal.tsx` (partial),
`components/ui/Button.tsx` (grep), plus repo-wide greps for `useQuery|useMutation|invalidateQueries|
setQueryData|queryKey|staleTime|refetchInterval|useEffect|localStorage|100vh|h-screen|w-[Npx]|<table`.
Cross-checked three claims against the backend (`api/v1/notifications.py`, `config.py`,
`services/booking_service.py`).

> Note: `frontend/src/lib/api.ts` does not exist. The API layer is `lib/api/*.ts` (17 modules)
> plus the shared `lib/api/client.ts`. Adjusted scope accordingly.

**Verdict:** The fetch wrapper (`lib/api/client.ts`) is genuinely good — every non-2xx becomes a
typed `ApiError`, the FastAPI `detail` array is parsed into readable field errors, network failures
are distinguished as `status === 0`, and there is a real single-flight 401 refresh queue. The problem
is everything above it. There is no single data-fetching convention: `keys.ts` defines a tidy key
scheme that roughly half the app ignores in favour of ad-hoc string keys, and three owner pages
(dashboard, payouts, settings, staff) don't use TanStack Query at all — they're hand-rolled
`useState`+`useEffect` fetches with `.catch(() => null)` swallowing. That is where the real defects
live: an owner sees a silently-empty operations screen instead of an error, and the whole
mutation→invalidation graph has holes because half the writes have no cache to invalidate.
The booking wizard is the other weak spot: it polls three endpoints every 3–4 s, and if
`/availability` fails it renders every slot as free with no error shown.

## Findings summary

| ID | Sev | Title | File |
|---|---|---|---|
| 4-1 | P1 | Availability query has no loading/error handling — wizard shows every slot free and the wrong seat cap on failure | `app/(customer)/bookings/new/page.tsx:154-212` |
| 4-2 | P1 | Client hardcodes the 3.85% service fee the backend reads from env — displayed total can diverge from the amount charged | `app/(customer)/bookings/new/page.tsx:382,420-422` |
| 4-3 | P2 | Owner dashboard swallows every fetch error: a failed `/owner/status` demotes a verified owner to the signup screen | `app/(owner)/owner/dashboard/page.tsx:123-144` |
| 4-4 | P2 | Dashboard check-in / mark-done buttons have no in-flight disabled state — double-tap fires two check-in POSTs | `app/(owner)/owner/dashboard/page.tsx:228-258,529-551` |
| 4-5 | P2 | `EditCafeModal` writes name/address/hours/photos with zero query invalidation | `components/owner/EditCafeModal.tsx:117-168` |
| 4-6 | P2 | `cancelBooking` does not invalidate café availability or café detail | `app/(customer)/bookings/[id]/page.tsx:62-69` |
| 4-7 | P2 | `/owner/*` AuthGuard allows every role including `gamer` | `app/(owner)/layout.tsx:41-48` |
| 4-8 | P2 | Role switch swaps identity without resetting the QueryClient — previous role's cached data is rendered | `components/layout/RoleSwitcher.tsx:59-91` |
| 4-9 | P2 | `RoleSyncProvider` polls `/auth/me` every 30 s and writes only to localStorage, never to the store | `components/providers/RoleSyncProvider.tsx:12-50` |
| 4-10 | P2 | Booking wizard polls three endpoints every 3–4 s for the whole session | `app/(customer)/bookings/new/page.tsx:120-173` |
| 4-11 | P2 | Zero `loading.tsx` / `error.tsx` / `not-found.tsx` in any App Router segment | `app/**` |
| 4-12 | P2 | Profile page displays fabricated preferences that are never persisted | `app/(customer)/profile/page.tsx:62-66,155-171` |
| 4-13 | P2 | Onboarding submits a hardcoded placeholder phone number when the owner leaves it blank | `app/(owner)/owner/onboarding/page.tsx:179-187,284-288` |
| 4-14 | P2 | "Today's Earnings" and "Seats Free" are computed from a 20-row page of bookings | `app/(owner)/owner/dashboard/page.tsx:125,302-307` |
| 4-15 | P3 | `keys.ts` is half-abandoned — ad-hoc string keys, unused defined keys, and four pages with no Query at all | `hooks/queries/keys.ts` |
| 4-16 | P3 | Every admin mutation invalidates the whole `['admin']` subtree | `app/(admin)/**` |
| 4-17 | P3 | Duplicated notification bell + three different response-unwrapping conventions | `components/layout/CustomerShell.tsx:40-52`, `OwnerShell.tsx:304-315` |
| 4-18 | P3 | Explore filters client-side over one 30-item page, with a hardcoded `lxg` test hack | `components/customer/ExploreClient.tsx:162-208` |
| 4-19 | P3 | `useMediaQuery` re-subscribes on every match change and always renders mobile-first on hydration | `hooks/useMediaQuery.ts:8-20` |
| 4-20 | P3 | Café detail fetches the user's entire bookings list under a per-café cache key | `app/(customer)/cafe/[id]/CafeDetailClient.tsx:75-79` |
| 4-21 | P3 | Scanner leaks `Html5Qrcode` instances on decode failure; `AnimatePresence` in providers is inert | `app/(owner)/owner/scanner/page.tsx:460-478`, `app/providers.tsx:67` |
| 4-22 | P3 | `updateField` in onboarding spreads a stale `formData` closure instead of using functional state | `app/(owner)/owner/onboarding/page.tsx:154-157` |

---

## Mutation → invalidation matrix

The highest-value output of this phase. "Missing?" lists keys the write actually affects but does
not invalidate. `owner.all` = `['owner']`, `admin.all` = `['admin']`, `bookings.all` = `['bookings']`.

| Mutation (file:line) | What it writes | Keys invalidated | Missing? |
|---|---|---|---|
| `createBooking` + `verifyPayment` — `bookings/new:487-527` | booking row, seat occupancy | `['cafe-availability']`, `cafes.detail(cafeId)` | `bookings.all` — masked because `/bookings` and `/bookings/[id]` both use `staleTime: 0`. Low impact. |
| `verifyPayment` retry — `bookings/[id]:93-106` | booking status, seat occupancy | `bookings.all`, `['cafe-availability', cafeId]`, `cafes.detail(cafeId)` + `refetch()` | Nothing. `refetch()` is redundant with the detail key already being `staleTime: 0`. |
| `cancelBooking` — `bookings/[id]:62-69` | booking status, **frees seats** | `bookings.detail(id)`, `bookings.all` | **`['cafe-availability']` and `cafes.detail(cafeId)`** — see 4-6. Inconsistent with the retry path directly above it, which does invalidate them. |
| `checkinBooking` (scanner) — `scanner:529-531` | booking status → `checked_in` | `owner.all`, `bookings.all` | Occupancy (`getOwnerOccupancy`) and the owner dashboard are not Query-backed, so nothing to invalidate; they re-fetch on remount. Acceptable. |
| `checkinBooking` (owner bookings) — `owner/bookings:56-59` | booking status | `owner.all` | `bookings.all` (customer's own view — different browser in practice). OK. |
| `updateOwnerBookingStatus` — `owner/bookings:63-66` | booking → completed/no_show | `owner.all` | Nothing material. |
| `checkinBooking` / `updateOwnerBookingStatus` (dashboard) — `dashboard:228-258` | booking status | `owner.all` (**no-op — this page has no Query**) + manual `loadStatusAndOps()` | Works by accident. See 4-4 for the missing in-flight guard. |
| `updateBookingControls` (seat cap) — `dashboard:153-176, 178-226` | `bookableStations`, per-tier `appBookableSeats` | `owner.all` (**no-op**) + `localStorage`/`CustomEvent` broadcast | `queryKeys.cafes.detail(cafeId)` and `['cafe-availability']`. Partially covered by the `khelo:seat-cap-updated` listener in `bookings/new:215-231`, which is a bespoke second invalidation channel. |
| `toggleBookingsPaused` — `dashboard:260-279` | `bookingsPaused` | `owner.all` (**no-op**) | `cafes.detail(cafeId)` — a paused café still shows bookable in a warm customer cache for 60 s. |
| Tier create/update/delete/reorder — `owner/tiers:80-144` | tier price, seat counts | `['owner-hardware-tiers']` | **`cafes.detail(cafeId)`, `['cafe-availability']`, `owner.all`.** Tier price feeds the wizard's price estimate directly. |
| Promotion create/update/deactivate/reactivate — `owner/offers:125-174` | promo window, discount % | `['owner-promotions']` | **`cafes.detail(cafeId)`** (`activeTier.activePromotion` drives the wizard discount) and `cafes.promotions(cafeId)` (key defined, never used). |
| `EditCafeModal` — name/address/geo/hours/amenities/photos — `EditCafeModal:117-168` | almost every public café field | **none — no `useQueryClient` in the file at all** | `cafes.detail(cafeId)`, `cafes.all`. See 4-5. |
| Payout setup — `owner/payouts` | Razorpay payout account | **none — page uses `useState`+`useEffect`** | `owner.payoutStatus` key is defined in `keys.ts` and never used anywhere. |
| Staff create/delete — `owner/staff` | staff roster | **none — page uses `useState`+`useEffect`** | `owner.staff` key defined, never used. |
| `verifyCafe` / `rejectCafe` — `admin/page:83-95` | café verification status | `admin.all` | `cafes.all` (approval makes a café publicly listed). Over-invalidates every other admin query. |
| `forceCancelBooking` / `refundBooking` — `admin/bookings:78-89` | booking status, refund | `admin.all` | `bookings.all`, `['cafe-availability']`. Over-invalidates. |
| `suspendCafe` / `reactivateCafe` — `admin/cafes:100-113` | café active flag | `admin.all` | `cafes.all`, `cafes.detail`. Over-invalidates. |
| `deactivateUser` / `activateUser` / `changeUserRole` — `admin/users:85-96` | user roles | `admin.all` | Over-invalidates. Role change does not touch `auth.me`. |
| `deactivatePromotion` — `admin/promotions:87-89` | promo active flag | `admin.all` | `cafes.detail`, `['owner-promotions']`. |
| `assignStaff` — `admin/staff:29-31` | staff→café grant | `admin.all` | Over-invalidates. |
| `toggleReviewVisibility` — `admin/reviews:68-70` | review visibility | `admin.all` | `['cafe-reviews']`, `cafes.detail` (rating). |
| `updatePlatformSettings` — `admin/settings:34-41` | platform fee %, etc. | `['admin','platform-settings']` | Nothing cacheable client-side, but see 4-2 — the fee is also hardcoded in the wizard. |
| `replyToReview` — `owner/reviews:30-32` | review reply | `['owner-reviews']` | `['cafe-reviews', cafeId]`, `cafes.detail`. |
| Notification mark-read (×4, both portals) | `is_read` | `['notifications']`, `['unread-count']` | Nothing. Correct. |
| `createSupportTicket` — `support:38-44` | ticket | `['support','my-tickets']` | Nothing. Correct. |
| `confirmTierPlatform` — `PlatformReconfirmModal:24-28` | tier platform/model | `['tiers-needing-confirmation']` | `['owner-hardware-tiers']`, `cafes.detail`. |
| `switchActiveRole` — `authStore:86-102` | **entire identity + token** | **none** | Everything. See 4-8. |

---

## P1 findings

### [P1] Availability query has no loading or error handling — the wizard renders every slot as free and the wrong seat cap when `/availability` fails

- **Where:** `frontend/src/app/(customer)/bookings/new/page.tsx:154-173` (the two availability
  queries), `:180-194` (`mergedBookedSlots`), `:199` (`totalSeatsForTier`), `:200-212`
  (`windowRemainingSeats`), `:802-807` (the enabled/disabled logic on the pay button);
  `frontend/src/lib/format.ts:271-291` (`calculateWindowRemainingSeats`).
- **What:** Both `useQuery` calls destructure only `data` — neither `isLoading` nor `isError` is
  read anywhere in the component. When the availability fetch fails (or during the first paint before
  it resolves), `availabilityData` is `undefined`, so `mergedBookedSlots` collapses to `[]` and
  `calculateWindowRemainingSeats` returns `totalSeats - 0` — i.e. the full capacity. Worse, the
  capacity itself falls back through `availabilityData?.appBookableSeats || activeTier?.totalSeats
  || 10` (line 199), so it silently substitutes the café's **physical** seat total for the owner's
  **app-bookable** cap. An owner who has reserved 16 of 20 stations for walk-ins gets his café
  advertised as having 20 online seats. The `TimelineRangePicker` receives an empty `bookedSlots`
  array, so the entire day renders as available, and the "Continue to Payment" button stays enabled
  because `windowRemainingSeats < seatsCount` is false.
- **Why it's P1:** This is an availability miscalculation shown at the point of purchase. The user
  picks a slot the UI says is free, taps pay, and gets a raw backend rejection (`TIER_FULLY_BOOKED`)
  in a red box at line 631 with no explanation of why the screen said otherwise. There is no
  indication anywhere that the availability data is missing.
- **Repro / trigger:** Block or 500 `GET /api/v1/cafes/{id}/availability` (network throttle, backend
  restart, or a tier whose availability endpoint errors) while loading `/bookings/new?cafeId=…`.
  The date strip, timeline, and seat stepper all render as fully available. The `refetchInterval:
  3_000` means it self-heals within ~3 s once the endpoint recovers — but during a sustained outage
  the screen lies indefinitely.
- **Fix sketch:** Read `isLoading`/`isError` from both availability queries; render a skeleton over
  the timeline while loading and a retry-able error state when it fails, and disable the checkout
  button whenever `availabilityData` is `undefined`. Drop the `|| activeTier?.totalSeats || 10`
  fallback on line 199 — absent availability data should mean "unknown", not "all seats free".
- **Confidence:** High (code path verified line by line, including the `format.ts` helper).

### [P1] Client hardcodes the 3.85% service fee that the backend reads from environment config

- **Where:** `frontend/src/app/(customer)/bookings/new/page.tsx:382` (`const SERVICE_FEE_PERCENT =
  3.85`), `:420-422` (subtotal/fee/total), `:795` (the total rendered in the sticky pay bar).
  Backend: `backend/app/config.py:50-51` (`RAZORPAY_COST_PERCENT: float = 2.65`,
  `PLATFORM_MARGIN_PERCENT: float = 1.20`), `backend/app/services/booking_service.py:174-178`.
- **What:** The wizard computes and displays the customer-facing total from a literal `3.85`, plus a
  full client-side reimplementation of promotion eligibility (`:395-415`, which openly says it
  "mirrors `PromotionService._is_promotion_active` … exactly"). The backend derives the same figure
  from two `Settings` values whose own comment states they exist so pricing can be changed **via env
  var without a code change**. The two agree today (2.65 + 1.20 = 3.85); nothing keeps them in sync.
- **Why it's P1:** The moment `PLATFORM_MARGIN_PERCENT` is bumped in production — exactly the
  documented way to change pricing — the sticky bar shows one number and the Razorpay modal (which
  is opened with `order.amount` from the server at `:503-507`) charges a different one, in the same
  tap. The user is not overcharged relative to what the server computed, but they are shown a price
  they were not charged, at the point of payment, with no reconciliation. The duplicated promo
  eligibility logic has the same drift risk on the discount line.
- **Repro / trigger:** Set `PLATFORM_MARGIN_PERCENT=2.00` in the backend environment and reload the
  wizard. The displayed total is computed at 3.85% while the Razorpay order is created at 4.65%.
- **Fix sketch:** Return the fee percentage (or the fully-computed quote) from an existing endpoint —
  the café detail response is already fetched here — and render that instead of a literal. Same for
  the promo discount: have the backend return the eligible discount for the selected slot rather than
  re-deriving Python's weekday convention in JavaScript.
- **Confidence:** High on the code fact (verified both sides); Medium on likelihood, since it
  requires an env change to manifest.

---

## P2 findings

### [P2] Owner dashboard swallows every fetch error — a failed `/owner/status` demotes a verified owner to the "become a partner" screen

- **Where:** `frontend/src/app/(owner)/owner/dashboard/page.tsx:62-145`, specifically the
  `.catch(() => null)` / `.catch(() => ({ items: [] }))` chain at `:123-128` and the outer
  `catch { setStatusState({ status: 'prospective' }) }` at `:140-142`.
- **What:** The whole dashboard is a hand-rolled fetch with no error state. Four parallel calls each
  swallow their own failure into an empty value, and any throw from `getOwnerStatus()` — including a
  network blip or a 500 — is interpreted as "this user is not a café owner" and renders
  `<ProspectiveOwnerView />` (`:289-291`), the marketing signup page. There is no `isError` branch
  anywhere in the component; the only error surface (`actionMessage`) is written by mutations only.
- **Why it's P2:** Two distinct bad outcomes. (1) A verified owner on a flaky Indian mobile
  connection is told they don't have a café — not "couldn't load, retry". (2) When only the
  sub-fetches fail, the page renders confidently wrong numbers: "Today's Earnings ₹0", "All Caught
  Up", and "No bookings logged for today yet" — an operations screen that says there is nothing to
  do, when the truth is that it couldn't ask. Staff work off this list.
- **Repro / trigger:** Load `/owner/dashboard` as a verified owner with `GET /api/v1/owner/status`
  returning 500 (or offline) → `ProspectiveOwnerView`. Let `/owner/status` succeed but
  `/owner/bookings` fail → an empty, cheerful arrivals list.
- **Fix sketch:** Distinguish "server said you have no café" (an actual `status` value) from "the
  request failed" — only the former should render `ProspectiveOwnerView`. Track a per-section error
  and render a retry affordance instead of an empty state. Moving this page onto TanStack Query with
  `queryKeys.owner.dashboard` (already defined, unused) would give the error/loading states for free
  and make the `owner.all` invalidations elsewhere actually do something.
- **Confidence:** High.

### [P2] Dashboard check-in and mark-done buttons have no in-flight disabled state — a double-tap fires two check-in POSTs

- **Where:** `frontend/src/app/(owner)/owner/dashboard/page.tsx:228-242` (`handleCheckIn`),
  `:244-258` (`handleStatusUpdate`), and the raw `<button>` elements at `:530-539` and `:542-551`.
  The same-file modal button at `:806-819` has the same problem.
- **What:** Both handlers are plain `async` functions with no per-row pending state. The buttons are
  bare `<button>` elements with no `disabled` prop and no visual pending feedback — unlike the
  scanner's check-in button, which correctly uses `isCheckinSubmitting` through the design-system
  `Button` (`components/ui/Button.tsx:95` disables on `isLoading`). Nothing prevents a second click
  while the first request is in flight; the row also does not disappear until the whole
  `loadStatusAndOps()` refetch (`:236`) completes, so the button stays visible and clickable for the
  full round trip plus refetch.
- **Why it's P2:** On mobile, a tap that appears to do nothing for a second invites a second tap.
  Two concurrent `POST /owner/bookings/{id}/checkin` calls race. The second is presumably rejected by
  the backend as an invalid status transition — but the user sees the *error* message land in
  `actionMessage` (`:239`) immediately after the success message, so a successful check-in reads as a
  failure and staff re-attempt it. Not P1: I did not verify that the backend permits a genuine double
  check-in, and the scanner path (the primary flow) is correctly guarded.
- **Repro / trigger:** On `/owner/dashboard`, double-tap "Check In" on a `confirmed` booking with a
  throttled connection.
- **Fix sketch:** Track the in-flight booking id in state, pass it as `disabled` to those buttons,
  and use the `Button` primitive's `isLoading` instead of a raw `<button>` so the design system's
  `disabled:pointer-events-none` applies.
- **Confidence:** High on the missing guard; Medium on the backend's double-submit behaviour
  (out of this phase's scope — flag for the backend phase).

### [P2] `EditCafeModal` mutates almost every public café field with zero cache invalidation

- **Where:** `frontend/src/components/owner/EditCafeModal.tsx` — `handleBasicSubmit:117-130`,
  `handleLocationSave:132-146`, `handleHoursSave:148-162`, `persistPhotos:164-168`. The file
  contains no `useQueryClient`, no `useMutation`, and no `invalidateQueries` (verified by grep over
  all 699 lines).
- **What:** Six separate write paths (name/phone/address, lat/lng, opening & closing hours,
  amenities, café photos, menu photos) each call `updateCafeDetails`/`updateOperatingHours` and then
  a local `onSaved(...)` callback that patches the parent settings page's `useState`. The café is
  cached under `queryKeys.cafes.detail(cafeId)` with `staleTime: 60_000` and a 30-minute `gcTime`
  (`app/providers.tsx:16`), and appears in `queryKeys.cafes.list(...)` with `staleTime: 30_000`.
  None of those are touched.
- **Why it's P2:** Opening/closing hours are not cosmetic — they drive the booking wizard's timeline
  bounds (`bookings/new:262-266,685-686`) and the "Open Now" filter on the home page
  (`ExploreClient.tsx:198`). An owner who fixes their hours, then opens their own café page in the
  same session, sees the old hours for up to a minute with no indication anything is stale. The blast
  radius is limited to the writer's own browser (each customer has their own cache), which is why
  this is P2 and not P1.
- **Repro / trigger:** As an owner, visit `/cafe/{yourId}` (warms `cafes.detail`), go to
  `/owner/settings`, change the closing time, save, and navigate back to `/cafe/{yourId}` within
  60 s — the old hours are still shown.
- **Fix sketch:** Convert the six handlers to `useMutation` and invalidate
  `queryKeys.cafes.detail(cafeId)` and `queryKeys.cafes.all` in a shared `onSuccess`; keep `onSaved`
  for the parent's local state until that page is also Query-backed.
- **Confidence:** High.

### [P2] `cancelBooking` frees seats but does not invalidate café availability or café detail

- **Where:** `frontend/src/app/(customer)/bookings/[id]/page.tsx:62-69`.
- **What:** The cancel mutation invalidates `bookings.detail(bookingId)` and `bookings.all` only.
  The payment-retry handler thirty lines below it (`:100-106`) — which affects exactly the same
  availability data — correctly invalidates `['cafe-availability', data.cafeId]` and
  `queryKeys.cafes.detail(data.cafeId)`. The cancel path is the inconsistent one.
- **Why it's P2:** Cancelling releases seats. A user who cancels and immediately returns to that
  café's page sees the pre-cancellation seat count from `cafes.detail` for up to 60 s
  (`CafeDetailClient.tsx:65`). In the booking wizard the 3 s `refetchInterval` papers over it, but
  that mitigation is accidental, not designed. The mutation also has no `onError` handler — a failed
  cancel leaves the modal open with no message.
- **Repro / trigger:** Open `/cafe/{id}`, then `/bookings/{id}`, cancel, then navigate back to
  `/cafe/{id}` within 60 seconds.
- **Fix sketch:** Mirror the retry-payment path — add `['cafe-availability', data.cafeId]` and
  `cafes.detail(data.cafeId)` to `onSuccess`, and add an `onError` that surfaces
  `cancelMutation.error.message` in the modal.
- **Confidence:** High.

### [P2] The `/owner/*` route group is gated on "logged in", not on any owner role

- **Where:** `frontend/src/app/(owner)/layout.tsx:41-48` — `allowedRoles = ['gamer', 'cafe_owner',
  'staff', 'admin']`, i.e. every role the system has.
- **What:** The file's own doc comment (`:9-17`) states the intent: "`/owner/onboarding` is
  accessible to `gamer` … **All other `/owner/*` routes require cafe_owner, staff, or admin**." The
  implementation applies the permissive list to the entire group, so `gamer` reaches
  `/owner/scanner`, `/owner/payouts`, `/owner/staff`, `/owner/tiers`, and `/owner/bookings` with the
  full owner sidebar rendered. There is also no `middleware.ts` anywhere in the frontend (verified),
  so there is no server-side counterpart to this check at all — every guard in the app is
  client-side, and route HTML is served to anyone.
- **Why it's P2 and not P0:** I checked whether this leaks data. It does not — the pages fetch
  through `apiClient`, and the backend rejects a gamer's token on every owner endpoint (the 403
  branch in `lib/api/client.ts:99-131` fires). A gamer sees the owner chrome around empty/errored
  panels, not another café's bookings. So this is a broken-gate/confusing-UI defect, not an authz
  bypass. It is still worth fixing because it makes the client gate meaningless as a defence layer,
  and it defeats the file's stated design.
- **Repro / trigger:** Log in as a plain gamer, navigate to `/owner/payouts`. The owner shell renders.
- **Fix sketch:** Split the guard: keep `['gamer', 'cafe_owner', 'staff', 'admin']` for the
  `/owner/onboarding` path only (the layout already branches on that pathname at `:33`), and use
  `['cafe_owner', 'staff', 'admin']` for the rest.
- **Confidence:** High. Cross-check with the backend-authz phase that every `/api/v1/owner/*`
  endpoint really is role-gated — this finding's severity depends on that.

### [P2] Switching roles swaps the token and identity but never resets the QueryClient

- **Where:** `frontend/src/components/layout/RoleSwitcher.tsx:59-71` and `:79-91`;
  `frontend/src/store/authStore.ts:86-102` (`switchActiveRole`); `frontend/src/app/providers.tsx:30-42`
  (module-level `browserQueryClient` singleton).
- **What:** `switchActiveRole` POSTs to `/auth/switch-role`, replaces the access and refresh tokens
  and the user object, then `RoleSwitcher` calls `router.push(...)` — a client-side navigation. The
  QueryClient is a module-level singleton that survives it, so every cached entry fetched under the
  previous role's token stays in the cache with a 30-minute `gcTime`: `['owner', …]`,
  `['admin', …]`, `['bookings', …]`, `['cafe-availability', …]`, `['unread-count']`, `['rewards']`.
  Contrast `logout()` (`authStore.ts:115-135`), which uses `window.location.href` — a hard reload
  that does clear the cache.
- **Why it's P2:** After switching workspaces, pages render the previous role's data until each key
  goes stale (30 s default, up to 60 s on several queries). `['unread-count']` and `['rewards']` are
  role-agnostic keys holding role-scoped answers, so the notification badge shows the wrong count
  outright. Nothing is *leaked* across accounts (it is the same user account throughout), so this is
  stale-data UX, not a security issue.
- **Repro / trigger:** As a multi-role account, load `/owner/bookings`, then use the role switcher to
  enter Gamer mode, then switch back within 30 s — the pre-switch list renders immediately from cache.
- **Fix sketch:** Call `queryClient.clear()` (or `resetQueries()`) as part of `switchActiveRole`, or
  key the QueryClient on `activeRole` so a switch remounts the provider with a fresh cache.
- **Confidence:** High.

### [P2] `RoleSyncProvider` polls `/auth/me` every 30 s per tab and writes only to localStorage, never to the store

- **Where:** `frontend/src/components/providers/RoleSyncProvider.tsx:12-50`. Mounted app-wide in
  `app/providers.tsx:66`.
- **What:** For every authenticated user, on every page, an interval fires `GET /auth/me` every 30
  seconds. When it detects a role change it writes `user`, `roles`, and `activeRole` to
  `localStorage` (`:33-38`) — and stops there. It never calls `useAuthStore.setState` or
  `setUser`. The cross-tab `storage` listener in `authStore.ts:206-236` cannot help, because the
  `storage` event does not fire in the tab that performed the write. So the running React tree keeps
  the pre-change `user.roles`, and `AuthGuard` (`AuthGuard.tsx:47,56-57`) keeps gating on them until
  a full reload. The component also reads `user` at `:8` and never uses it.
- **Why it's P2:** The provider's entire stated purpose — propagating a role grant or revocation
  without a reload — does not work. A revoked cafe-owner keeps the owner shell and nav indefinitely.
  It is not a security hole (the backend rejects the calls, and the 403 interceptor at
  `client.ts:99-131` does re-sanitize `activeRole` in localStorage), but it is a dead mechanism whose
  only observable effect is one extra request per user per 30 seconds forever — meaningful load and
  meaningful mobile data in the India market.
- **Repro / trigger:** Grant a second role to a logged-in user server-side and watch the tab for a
  minute. `localStorage.roles` updates; the role switcher does not appear until reload.
- **Fix sketch:** Have `syncRoles` call `useAuthStore.getState().setUser(freshUser)` (and re-run
  `sanitizeActiveRole`) when roles change, and drop the unused `user` binding. Consider dropping the
  30 s interval to something far longer, or driving it off the existing 403 interceptor, which
  already handles the case that actually matters.
- **Confidence:** High.

### [P2] The booking wizard polls three endpoints every 3–4 seconds for the entire session

- **Where:** `frontend/src/app/(customer)/bookings/new/page.tsx:120-126` (café detail,
  `refetchInterval: 4_000`), `:154-160` (today's availability, `3_000`), `:167-173` (tomorrow's
  availability, `3_000`).
- **What:** Three always-on intervals, ~50 requests per minute per open wizard, held for as long as
  the user is choosing a slot. The café detail payload includes all tiers, photos, amenities, and
  promotions — it is not a small response, and none of it changes at a 4-second cadence. TanStack's
  default `refetchIntervalInBackground: false` pauses this when the tab is hidden, which is the only
  thing keeping it bounded.
- **Why it's P2:** This is the checkout screen of a mobile-first product in a market where data cost
  and 3G/4G latency matter. It is also the page where a user is most likely to sit still for several
  minutes. On the server side it multiplies concurrent-checkout load by ~50×. There is no
  `refetchOnWindowFocus` thrash (globally disabled at `providers.tsx:18`, correctly), so polling is
  the only source of churn — but it is a large one.
- **Repro / trigger:** Open `/bookings/new?cafeId=…` and watch the network panel.
- **Fix sketch:** Keep a fast interval on the availability queries only (they are the ones that
  actually go stale from other users' bookings), raise it to 15–30 s, and drop the café-detail
  interval entirely — a café's tiers and hours do not change mid-checkout. Re-fetch availability once
  on the checkout tap rather than continuously.
- **Confidence:** High.

### [P2] No route segment has a `loading.tsx`, `error.tsx`, or `not-found.tsx`

- **Where:** `frontend/src/app/**` — a recursive search for those three filenames returns nothing.
  The only boundary in the entire App Router is `app/global-error.tsx`.
- **What:** Every route relies on the page component's own internal `isLoading` branch. Where that
  branch is missing (see 4-1, 4-3) there is no framework-level fallback. More importantly, a throw
  during render in any segment has no local boundary to catch it, so it escalates to
  `global-error.tsx`, which returns its own `<html><body>` (`global-error.tsx:39-54`) — replacing the
  entire document, losing the shell, nav, and any in-progress state, and showing a generic "Hold on a
  moment" with a reload button.
- **Why it's P2:** A recoverable failure in one panel takes down the whole app shell. The
  `global-error` boundary does handle stale-chunk reloads well (`:16-22,32-35`), which suggests this
  crash path is hit in production — that reload guard exists because someone saw it. Per-segment
  `error.tsx` would keep the nav and let the user retry just the broken page.
- **Repro / trigger:** Any uncaught render throw in a customer or owner page — e.g. a field the
  component assumes is present coming back null — replaces the whole document.
- **Fix sketch:** Add `error.tsx` to each of the four route groups (`(customer)`, `(owner)`,
  `(admin)`, `(auth)`) rendering the existing `ErrorState` primitive with the `reset()` callback, and
  a `not-found.tsx` at the root. `loading.tsx` is optional given most pages have skeletons, but the
  four segments that don't (4-3) would benefit.
- **Confidence:** High.

### [P2] Profile page displays fabricated gaming preferences that are never saved anywhere

- **Where:** `frontend/src/app/(customer)/profile/page.tsx:41-43` (the hardcoded option lists),
  `:62-66` (`homeCity`, `favGames = ['Valorant', 'EA FC 24']`, `preferredTier = 'Ultra RTX 4080
  (240Hz)'`), `:147-153` (`toggleGame`), `:155-171` (`handleSaveProfile`), `:196` (`homeCity`
  rendered in the header).
- **What:** Three "preference" fields are initialised to invented values and held in local component
  state. `handleSaveProfile` sends only `fullName` and `phoneNumber` to `updateMe` — `favGames`,
  `preferredTier`, and `homeCity` are never transmitted and have no backing field. Every reload
  resets them to the same fabricated defaults, so the profile tells every single user their favourite
  games are Valorant and EA FC 24 and their preferred rig is an RTX 4080.
- **Why it's P2:** The user is shown personal data about themselves that they never entered, and
  edits to it are silently discarded — the modal closes on save as though it worked. This is the same
  class of problem the recent commits (`fix(customer): add real trust signals, remove fake photos and
  stats`) were cleaning up elsewhere; this instance survived.
- **Repro / trigger:** Open `/profile` as any brand-new account. Change favourite games, save,
  reload — the invented defaults are back.
- **Fix sketch:** Either persist these through `updateMe` with real backend columns, or remove the
  three fields from the UI until there is somewhere to put them. Do not seed them with example values
  in the meantime.
- **Confidence:** High.

### [P2] Onboarding submits a hardcoded placeholder phone number when the owner leaves the field blank

- **Where:** `frontend/src/app/(owner)/owner/onboarding/page.tsx:179-187` (step-2 validation) and
  `:287` (`phoneNumber: formData.phoneNumber || user?.phoneNumber || '+919876543210'`). Same pattern
  at `:284` (`pincode: … || '560001'`) and `:271-273` (silent `|| 100` price and `|| 4` seat
  defaults).
- **What:** Step 2 validates the phone number *only if one was entered* (`if (formData.phoneNumber
  && !/^\+91[6-9]\d{9}$/…)`), so an empty field passes. At submit, an empty field falls through to
  the account's phone and then to the literal `+919876543210` — a placeholder number — which is
  submitted as the café's business contact. The pincode fallback `'560001'` (Bengaluru) is mostly
  unreachable because step 1 requires a valid 6-digit pincode, but the phone fallback is directly
  reachable by any owner who has no phone on their account.
- **Why it's P2:** A café goes live on a public marketplace with a fake contact number. Customers
  who call it reach nobody; support cannot reach the owner. The hardware-tier fallbacks (`|| 100`
  per hour, `|| 4` seats) have the same shape — they invent commercial terms rather than refusing
  the submission.
- **Repro / trigger:** Complete onboarding with an account that has no `phoneNumber`, leaving the
  optional phone field blank on step 2. The application is submitted with `+919876543210`.
- **Fix sketch:** Make the phone number required at step 2 rather than conditionally validated, and
  delete the literal fallbacks at `:284,287` — if a required field is missing at submit time, that is
  a validation error, not a value to invent.
- **Confidence:** High.

### [P2] "Today's Earnings" and "Seats Free Right Now" are computed from a 20-row page of bookings

- **Where:** `frontend/src/app/(owner)/owner/dashboard/page.tsx:125`
  (`getOwnerBookings({ limit: 20 })`), `:302-307` (`upcomingCount`, `occupiedNowCount`,
  `totalEarningsToday`, `seatsFreeNow`), `:313-318` (`overdueCheckInCount`).
- **What:** The dashboard fetches a single 20-item page and then derives five headline metrics by
  reducing over it client-side. The variable is named `todayBookings`, but nothing in the request
  filters by date — it is just the first 20 rows the endpoint returns.
- **Why it's P2:** Any café with more than 20 bookings in the returned window gets a silently
  truncated earnings figure and a wrong "Seats Free Right Now" (`appSeatCap - occupiedNowCount`,
  where the occupied count is capped at 20). These are the three numbers the page is built around,
  presented as facts with no caveat. Busy cafés — the ones that matter commercially — are the ones
  that get the wrong number.
- **Repro / trigger:** Any café with ≥21 bookings in the fetched set. Today's Earnings under-reports.
- **Fix sketch:** These are aggregates and belong on the server — `getOwnerDashboard()` is already
  being called in the same `Promise.all` (`:124`) and is the natural home for them. At minimum,
  request the day's bookings explicitly (date-filtered, full page) rather than an unfiltered
  `limit: 20`.
- **Confidence:** High on the code; Medium on the endpoint's default ordering/filtering, which I did
  not read — if `/owner/bookings` already defaults to today only, the earnings truncation stands but
  the "not actually today" concern does not.

---

## P3 findings

### [P3] `keys.ts` is half-abandoned: ad-hoc string keys, unused defined keys, and four pages with no Query at all

- **Where:** `frontend/src/hooks/queries/keys.ts` (all 35 lines) versus the actual call sites.
- **What:** Three parallel conventions coexist. (a) The scheme is used for `cafes.list`,
  `cafes.detail`, `bookings.list`, `bookings.detail`, `owner.bookings`, `admin.analytics`,
  `admin.pendingCafes`, and the `owner.all`/`admin.all`/`bookings.all` prefixes. (b) Roughly a dozen
  keys are invented inline outside it and therefore do **not** match any prefix invalidation:
  `['owner-hardware-tiers']`, `['owner-promotions']`, `['owner-cafe-id-offers']`, `['owner-reviews']`,
  `['owner-status-reviews']`, `['tiers-needing-confirmation']`, `['cafe-availability']`,
  `['cafe-reviews']`, `['user-cafe-bookings']`, `['unread-count']`, `['notifications']`,
  `['rewards']`, `['support','my-tickets']`, `['admin','platform-settings']`. Note that
  `invalidateQueries({ queryKey: ['owner'] })` does **not** match `['owner-hardware-tiers']` — they
  are different first elements. (c) Four owner pages (dashboard, payouts, settings, staff) don't use
  TanStack Query at all. Meanwhile `owner.dashboard`, `owner.staff`, `owner.payoutStatus`, `auth.me`,
  `cafes.tiers`, `cafes.promotions`, `cafes.reviews`, `admin.cafes`, and `admin.users` are defined
  and referenced nowhere — `admin/users/page.tsx:69` even builds `[...queryKeys.admin.all, 'users',
  roleFilter]` by hand instead of using `queryKeys.admin.users`.
- **Why it's P3:** No single instance is user-visible on its own, but this is the root cause of most
  rows in the invalidation matrix above. Every future mutation will guess wrong about which key to
  invalidate.
- **Repro / trigger:** N/A — structural.
- **Fix sketch:** Move the ad-hoc keys into `keys.ts` under their existing namespaces (availability
  under `cafes`, tiers under `cafes.tiers`, notifications/rewards under a new `me` namespace), then
  migrate the four `useState`/`useEffect` owner pages onto the keys already defined for them.
- **Confidence:** High.

### [P3] Every admin mutation invalidates the entire `['admin']` subtree

- **Where:** `admin/page.tsx:85,95`; `admin/cafes/page.tsx:103,113`; `admin/users/page.tsx:86,91,96`;
  `admin/bookings/page.tsx:80,89`; `admin/promotions/page.tsx:89`; `admin/reviews/page.tsx:70`;
  `admin/staff/page.tsx:31`; `admin/support/page.tsx:61`.
- **What:** Fourteen mutations, all with `invalidateQueries({ queryKey: queryKeys.admin.all })`.
  Since every admin query is keyed `[...queryKeys.admin.all, …]`, approving one café refetches
  analytics, the audit log, payments, payouts, the user list, promotions, support tickets, and the
  café list. `queryKeys.admin.analytics` alone has `staleTime: 60_000` precisely because it is
  expensive.
- **Why it's P3:** Wasted work on an internal, low-traffic surface. It is also correct (never stale),
  which is why this is P3 and not higher — the cost is refetch volume, not wrong data.
- **Fix sketch:** Invalidate the specific sub-namespace each mutation writes; keep the broad
  invalidation only where a write genuinely fans out (café approval → cafés + analytics).
- **Confidence:** High.

### [P3] Duplicated notification bell, and three different response-unwrapping conventions

- **Where:** `components/layout/CustomerShell.tsx:40-52,100-111` and
  `components/layout/OwnerShell.tsx:304-330` — near-identical query + badge markup, differing only
  in the link target and an `enabled: isAuthenticated` that the owner copy omits.
- **What:** Three ways of reading a response coexist: `call()` (`client.ts:205-210`, unwraps
  `res.data.data`) used by all of `lib/api/*`; `response.data.data` inline
  (`profile/page.tsx:117-118`); and `response.data` inline (both shells). The shells are actually
  **correct** — I checked `backend/app/api/v1/notifications.py:57-68`, and `/notifications/unread-count`
  returns a bare `UnreadCountResponse` with no `{success, data}` envelope, unlike
  `api/v1/cafes.py:52` and friends. So the envelope is inconsistent on the backend and the frontend
  is compensating ad hoc.
- **Why it's P3:** Nothing is broken today, but the next person to route this call through `call()`
  will get `undefined` and the badge will silently vanish.
- **Fix sketch:** Extract one `<NotificationBell href=… />` into `components/ui`, and give
  `/notifications/unread-count` the same `{success, data}` envelope as the rest of the API so it can
  go through `lib/api/*` + `call()` like everything else.
- **Confidence:** High (both sides verified).

### [P3] Explore filters client-side over one 30-item page, and carries a hardcoded café-name test hack

- **Where:** `components/customer/ExploreClient.tsx:162-176` (the query, `limit: 30`), `:186-208`
  (the client-side filter), specifically `:202-205`.
- **What:** Platform, GPU, "Open Now", and "Offers" filters run over the first 30 cafés only, so a
  filter can report "No gaming cafés found" while matching cafés exist on page 2. The `Offers`
  branch is worse: `if (!cafe.hasActivePromotion) { return cafe.hasActivePromotion ||
  cafe.name.toLowerCase().includes('lxg'); }` — a specific café's name string, commented "In test
  env", shipped in the production filter path. Separately, `onSelectCity` on the search bar
  (`:342,397`) calls the bare `setSelectedCity` rather than `handleCityChange`, so a city picked from
  a suggestion updates neither the URL nor the persisted location store, unlike every other path.
- **Why it's P3:** Not user-visible at the current café count, but the `lxg` line will surface a
  wrong café under "Offers" the moment a café with that substring exists, and the pagination gap
  becomes a real empty-state bug as the catalogue grows.
- **Fix sketch:** Delete the `lxg` branch. Push the tag filters into the `listCafes` query params so
  filtering happens server-side against the full set. Route `onSelectCity` through `handleCityChange`.
- **Confidence:** High.

### [P3] `useMediaQuery` re-subscribes on every match change and always renders mobile-first on hydration

- **Where:** `frontend/src/hooks/useMediaQuery.ts:8-20`.
- **What:** `matches` is in the effect's dependency array (`:20`) while also being set inside it, so
  every breakpoint crossing tears down and re-adds the `change` listener. Initial state is
  hardcoded `false` (`:6`), so the first client render always claims the query does not match and
  the correct value only arrives after the effect commits.
- **Why it's P3:** Any component using this flashes its non-matching branch once on load. It is not
  currently used on a critical path, which is the only reason this is not P2.
- **Fix sketch:** Drop `matches` from the deps, and initialise lazily from
  `window.matchMedia(query).matches` guarded for SSR.
- **Confidence:** High.

### [P3] Café detail fetches the user's entire bookings list under a per-café cache key

- **Where:** `app/(customer)/cafe/[id]/CafeDetailClient.tsx:75-79`.
- **What:** `queryKey: ['user-cafe-bookings', cafeId, user?.id]` with
  `queryFn: () => listBookings({ limit: 20 })` — the query function ignores `cafeId` entirely and
  fetches the same unfiltered list every time, but caches it under a per-café key. Visiting five
  cafés issues five identical requests and stores five copies of the same payload. It also never
  shares a cache entry with `queryKeys.bookings.list` on `/bookings`, which fetches the same thing.
- **Fix sketch:** Use `queryKeys.bookings.list({ limit: 20 })` so it dedupes with the bookings page,
  and derive the per-café subset client-side; or pass `cafeId` to `listBookings` so the key is honest.
- **Confidence:** High.

### [P3] Scanner leaks `Html5Qrcode` instances on decode failure; `AnimatePresence` in providers is inert

- **Where:** `app/(owner)/owner/scanner/page.tsx:460-478`; `app/providers.tsx:67`.
- **What:** (a) `handleFileUpload` constructs a `new window.Html5Qrcode('qr-reader-file-temp')` per
  upload and calls `.clear()` only on the success path (`:464`) — a decode failure jumps to the
  `catch` at `:470` and the instance and its DOM attachments are never cleared. Staff retrying a
  blurry pass photo accumulate them for the life of the page. (b) `<AnimatePresence mode="wait">
  {children}</AnimatePresence>` wraps children that have no `key`, so AnimatePresence can never
  detect a route change — it is a no-op wrapper. The camera lifecycle itself (`:373-389`) is
  correctly cleaned up on unmount and tab change; that part is fine.
- **Fix sketch:** Move `tempScanner.clear()` into a `finally`. Either give `AnimatePresence` a
  `key={pathname}` child or remove it.
- **Confidence:** High.

### [P3] `updateField` in onboarding spreads a stale `formData` closure instead of using functional state

- **Where:** `app/(owner)/owner/onboarding/page.tsx:154-157`.
- **What:** `const updated = { ...formData, [field]: value }; setFormData(updated);` — two
  `updateField` calls in the same tick (e.g. a component that sets a value and clears a dependent
  one) both read the pre-update `formData` and the second overwrites the first. The rest of the file
  uses the safe functional form (`:139`, `:244`).
- **Fix sketch:** `setFormData(prev => ({ ...prev, [field]: value }))`.
- **Confidence:** High.

---

## Things I checked and found to be fine

Recording these so the coordinator does not re-spend effort, and because several are the kind of
thing an audit usually flags wrongly.

- **`lib/api/client.ts` error handling is sound.** Every non-2xx becomes an `ApiError`; the FastAPI
  `detail` array is flattened into readable `field: message` text (`:65-71`); network failures are
  distinguished as `status === 0` (`:80-82`) and the scanner correctly branches on that
  (`scanner:403-406`) to say "no connection" instead of "invalid pass". The 401 refresh is a real
  single-flight queue (`:35-44,133-146`) with a `_retry` flag preventing loops, and auth endpoints
  are excluded (`:93-96`) so a bad login cannot trigger a refresh cycle. No redirect loop risk found.
- **No auth flash / content leak.** `AuthGuard` renders a spinner until `isHydrated && !isLoading`
  (`:68-77`) and again while the redirect is pending (`:80-89`), so protected content never paints
  before the check. `isLoading` defaults to `true` in the store (`authStore.ts:55`), which is what
  makes this work.
- **`activeRole` cannot be escalated from localStorage.** `sanitizeActiveRole`
  (`authStore.ts:20-28`) re-validates the persisted preference against the server-issued
  `user.roles` on every read, including in `AuthGuard` (`:47,80`) and the cross-tab `storage`
  listener (`:220`). Setting `localStorage.activeRole = 'admin'` does not render the admin shell.
- **No SSR/hydration mismatch from the auth store.** `authStore` is a plain `create()` with no
  `persist` middleware — it reads localStorage inside an effect-triggered
  `initializeFromStorage`, not during render. `locationStore` *does* use `persist`, and
  `ExploreClient:67` seeds `useState` from it, but the consuming component is `'use client'` inside
  a client layout, so there is no server-rendered value to mismatch against.
- **Mobile responsiveness is in decent shape.** No `100vh` outside `global-error.tsx`; `h-screen`
  appears only on `lg:`-gated desktop sidebars and full-screen spinners. Every horizontally-wide
  element I found is wrapped: the payouts table in `overflow-x-auto`
  (`owner/payouts/page.tsx:249-250`), and every filter-chip row in `overflow-x-auto scrollbar-hide`
  with a deliberate mask-image edge fade. No fixed pixel widths on containers. Touch targets on the
  operationally-critical paths use `min-h-[44px]` / `min-h-[56px]` explicitly.
- **`refetchOnWindowFocus` is globally disabled** (`providers.tsx:18`) with a correct rationale — no
  focus thrash anywhere.
- **The notification badge is not broken.** `response.data` (not `.data.data`) in both shells looks
  wrong against the rest of the codebase but is correct for this specific endpoint — see 4-17.
- **The scanner's re-scan guard works.** `resultShowingRef` (`scanner:231-236`) correctly prevents
  the 10 fps camera callback from firing a validate request per frame off the same still-visible QR
  code, and the check-in button is properly disabled while in flight via `Button`'s `isLoading`.
- **`useDebounce` is correct**, and both consumers use it properly — the scanner's manual lookup
  (350 ms, `scanner:221,494-518`, with a `cancelled` flag against out-of-order responses) and the
  explore search (300 ms). No fetch-on-every-keystroke anywhere.
- **`bookings/new` hook ordering is safe** — all hooks precede the early returns at `:345-373`, so
  there is no conditional-hook violation despite the four bail-out branches.

---

## Not covered

- `components/customer/TimelineRangePicker.tsx` (455 lines) — the drag/pointer interaction that
  actually produces the selected slot. It is the natural home for touch/pointer-event bugs and for
  the overnight-minute-space arithmetic that finding 4-1 depends on. **Highest-value gap.**
- `hooks/useRazorpay.ts` and `components/MockPaymentModal.tsx` — deliberately left to the payments
  phase, but the wizard's `onDismiss`/`handler` callbacks (`bookings/new:515-534`) depend on their
  contract, so cross-check.
- `AdminShell.tsx` and the admin pages — read only via grep for keys, mutations, and layout patterns;
  the invalidation matrix rows for admin are from grep output, not full reads.
- `components/owner/EditCafeModal.tsx` lines 175-699 (the photo upload/delete flow, progress
  tracking, and the tab UI) — I read the six write handlers and confirmed the absence of any
  `invalidateQueries` across the whole file, but did not audit the upload state machine.
- `app/(owner)/owner/onboarding/page.tsx` lines 300-928 — the step components and
  `PlatformTierConfigurator`.
- `components/ui/*` beyond `Button.tsx` — `Modal`, `BottomSheet`, `Input`, `Skeleton` were not read,
  so focus trapping, scroll locking, and `aria` correctness in dialogs are unaudited.
- `lib/format.ts` beyond `calculateWindowRemainingSeats` and `formatMinutesTo12h` — in particular
  `timeToMinutes`, `minutesToTimeAndDayOffset`, and `addDaysToDateString`, which carry the overnight
  date-rollover logic the wizard leans on heavily.
- Actual rendered behaviour. Everything here is from reading source; nothing was run in a browser.

## Notes for the coordinator

1. **Two findings need a backend cross-check to settle their severity.** 4-7 (`/owner/*` open to
   every role) is P2 *only because* the backend appears to reject a gamer's token on every owner
   endpoint — if the backend-authz phase finds a single unguarded `/api/v1/owner/*` route, 4-7 becomes
   P0. Likewise 4-4 (no double-submit guard on check-in) is P2 *only because* I assume the backend
   rejects a second check-in on an already-checked-in booking; if it does not, that is a P1
   double-check-in.
2. **The `useState`+`useEffect`-instead-of-Query pattern is the single highest-leverage fix.** Four
   owner pages (dashboard, payouts, settings, staff) use it, and it is directly responsible for 4-3,
   4-14, six no-op invalidations in the matrix, and the fact that `owner.dashboard`,
   `owner.staff`, and `owner.payoutStatus` are defined-but-dead keys. One migration closes all of it.
3. **The booking wizard carries a lot of duplicated backend logic** — the service-fee percentage
   (4-2), promotion eligibility including Python's weekday convention (`:395-415`), and the
   availability/seat maths (`:278-342`). Each has an explicit comment saying it mirrors a specific
   backend function. Whoever owns the pricing phase should decide whether the server can just return
   a quote; that would delete all three.
4. **Prior audit cross-check** (see table below for full details): P0-4 (dead button) was a false alarm
   — the button and modal exist. P0-1 (scanner cache) points to real code but is low-impact in
   practice (scanner runs on one device). P0-5 (silent errors) is real but downgraded to P2 (error
   eventually surfaces, just with the wrong message).
5. **Nothing in this phase rose to P0.** The two P1s are a shown-vs-charged price divergence that
   requires an env change to trigger, and an availability display that lies when a fetch fails.
   Neither loses money or exposes data today.

## Prior-audit cross-check

The `LAUNCH_READINESS_AUDIT.md` (Aug 2026) cited three P0s affecting the frontend. Here is their status:

| Prior ID | Claim | Location | Status | This audit's finding |
|---|---|---|---|---|
| **P0-1** | Scanner cache invalidation missing | `scanner/page.tsx:284-307` | **STILL OPEN, LOW IMPACT** | The scanner's check-in path (`scanner:529-531`) does invalidate `owner.all` and `bookings.all`, but there is no cross-tab broadcast mechanism (unlike seat-cap updates at `dashboard:163-164`). If staff run the scanner on a separate browser tab, check-ins won't propagate across tabs. However, the scanner is typically the only app running on the café desk device. **Fix:** Add a `CustomEvent('khelo:booking-checked-in')` broadcast on line 532 and listen for it in status pages. |
| **P0-4** | Dead Edit Cafe button | `settings/page.tsx:163-165` | **FALSE ALARM** | The button exists (`settings.tsx:185-192`, `onClick={() => setIsEditModalOpen(true)}`) and opens the modal (`settings.tsx:283-293`). The prior audit was incorrect. **This audit found a related issue (4-5):** the modal successfully mutates on the server but does not invalidate the client cache, leaving stale data visible until the 60-second `staleTime` expires. |
| **P0-5** | Silent error swallowing | `client.ts:127-129` | **PARTIALLY CORRECT, DOWNGRADE TO P2** | The 403-interceptor's role-recovery attempt (lines 102-131) catches a failed `/auth/me` call and sends it to Sentry without propagating it. However, control falls through and line 197 does eventually `Promise.reject(normaliseError(error))` with the original 403. The caller sees an error but not the real cause (that role recovery failed). In production: a gamer stripped of café_owner role sees "forbidden" with no hint their auth changed. **Fix:** After line 130, explicitly `return Promise.reject(new ApiError("Your permissions changed. Please reload.", 403))` so the caller gets context. Not P0 because the error surfaces; P2 because the message is misleading. |
