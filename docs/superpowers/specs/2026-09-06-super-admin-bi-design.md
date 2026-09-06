# Super Admin BI & IA Redesign — Design Spec

**Status:** Approved by user, ready for implementation planning
**Owner:** Uzair
**Related:** `docs/superpowers/specs/2026-08-26-owner-onboarding-v2-design.md` (café onboarding fields referenced below)

## 1. Problem

The super admin panel (`frontend/src/app/(admin)/admin/*`, `backend/app/api/v1/admin.py`) is currently a café-verification queue with a few counters bolted on (`Total Users`, `Live Cafés`, `Total GMV`, `Pending Queue`) and a "Needs Attention" action-items strip. It has no real business intelligence: no per-café or per-setup performance ranking, no geography, no funnel visibility, no marketing attribution, and the "Analytics" nav item (`AdminShell.tsx`) already links to `/admin/analytics`, which has no page behind it — a dead link today.

Goal (per stakeholder intent): build the admin's data foundation and information architecture correctly once, so it does not need architectural rework as KHELO scales. Feature-level dashboards can be added incrementally on top of this foundation without further schema changes.

## 2. Data Reality Check (why this isn't just new dashboards)

Several desired BI capabilities are blocked by missing schema, not missing queries:

| Capability | Blocker |
|---|---|
| Users by city / marketing attribution | `User` has no city, acquisition-source, or UTM fields at all |
| Best-performing games | `Booking` has no game reference — `Cafe.supported_games` is discovery metadata never tied to a booking |
| Marketplace health (searches with no results, venue views) | No event-tracking table exists anywhere in the schema |
| GMV vs. KHELO revenue split | **Not blocked** — `PlatformFee` (per-booking `convenience_fee`, `gateway_fee`, `owner_settlement_amount`) already supports this |
| Café/setup/platform performance, geography (café-level) | **Not blocked** — `Cafe.city/state`, `HardwareTier.platform`, `Booking` all already support this |

Section 3 closes the first three gaps. Section 5 builds on what already exists plus what Section 3 adds going forward.

## 3. Foundation: Schema & Instrumentation

### 3.1 `User` — acquisition fields

Add four nullable columns:
- `city: str | None` — populated at registration from the frontend's existing `useLocationStore.selectedCity` (already detected via GPS or manual pick on the Explore page today; currently never sent to the backend). Nullable: a user who never touched location before registering gets `null`, not a forced field.
- `acquisition_source: str | None`, `acquisition_medium: str | None`, `acquisition_campaign: str | None` — populated at registration from UTM query params captured client-side. See 3.3.

Register endpoint (`auth_service.py` / `auth.py`) accepts these four as optional fields on the registration payload.

### 3.2 `Booking` — game field

Add one nullable column: `game: str | None`, free text. Reuse the existing `Cafe.supported_games` JSON list (already owner-editable — `owner.py:558` already accepts `cafe.supported_games = payload.supported_games`, currently only exposed at onboarding) as the source list — no new café-level field needed. At booking time, the gamer picks from that café's `supported_games` via a free-text combobox — type any value (not restricted to the list) with autocomplete suggesting the café's existing entries. No per-tier or per-seat binding — matches the reality that owners assign whichever physical PC is free regardless of loaded games.

### 3.3 Campaign links (UTM capture) — client-side, no backend session store needed

- On any page load, if the URL has `utm_source`/`utm_medium`/`utm_campaign` query params, store them in `localStorage` under `khelo_attribution` (mirrors the existing `khelo-location-storage` pattern in `locationStore.ts`). First-touch wins — do not overwrite if already set.
- At registration, read `khelo_attribution` from `localStorage` and include it in the payload. If absent, show a "How did you hear about us?" dropdown (Instagram/Google/Referral/College/WhatsApp/Other) as fallback and use that as `acquisition_source` with `acquisition_medium = "self_reported"`.
- **Campaign Links generator** (new tab on the existing `/admin/promotions` page, not a new nav item): pick a channel from a preset list, enter a campaign label, get back a copy-pasteable URL like `https://khel-o.com/?utm_source=whatsapp&utm_medium=share&utm_campaign=<label>`. No backend storage needed for the links themselves — they're just URL templates; attribution is captured when someone actually visits and registers through one.

### 3.4 `AnalyticsEvent` — top-of-funnel tracking

New table, new migration (next sequential number after `018_unique_payment_per_booking.py`, i.e. `019_add_analytics_events_and_acquisition_fields.py` — combine with the `User`/`Booking`/`Cafe` column additions from 3.1/3.2/3.3 in the same migration since they're small and land together):

```python
class AnalyticsEvent(Base):
    __tablename__ = "analytics_events"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    session_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    event_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    cafe_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("cafes.id"), nullable=True)
    event_metadata: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False, index=True)
```

`event_type` is an application-level enum (not a DB enum, to avoid a migration every time a new event type is added — this is the one place genericity is worth the tradeoff): `search_performed`, `venue_viewed`, `booking_flow_started`.

- `search_performed` metadata: `{city, platform_filter, min_price, max_price, query_text, result_count}`. `result_count == 0` is literally "search with no results" — no separate tracking needed.
- `venue_viewed` metadata: `{}` (cafe_id column carries the venue).
- `booking_flow_started` metadata: `{tier_id}` (cafe_id column carries the venue).

Bottom-of-funnel (booking started → confirmed → paid → completed) is NOT re-instrumented — it's already fully and authoritatively captured by `Booking.status` / `Payment.status` transitions. Duplicating that into events would create a second, driftable source of truth for no benefit.

**Session id**: a UUID generated client-side on first app load, stored in `localStorage` (new `khelo_session_id` key), attached to every event POST and to the registration payload. On successful registration, the backend runs `UPDATE analytics_events SET user_id = :new_user_id WHERE session_id = :session_id AND user_id IS NULL` — this is how anonymous pre-signup browsing gets retroactively linked to a user.

**New endpoint**: `POST /api/v1/analytics/events` — unauthenticated (must work pre-signup), body `{session_id, event_type, cafe_id?, metadata?}`. Validates `event_type` against the enum above, caps `metadata` to a small fixed size (reject if serialized JSON > 2KB), inserts one row, returns 204. No PII beyond what a normal page request already carries.

**Instrumentation call sites** (3 total, all fire-and-forget, don't block UI on failure):
1. `frontend/src/components/customer/ExploreClient.tsx` — debounced, fires on search/filter change with the current filter state and result count.
2. Café detail page — fires once on mount with the café id.
3. `frontend/src/app/(customer)/bookings/new/page.tsx` — fires once on mount with café id + tier id.

## 4. Admin IA Restructure

Current nav (`AdminShell.tsx`, `adminNavItems`) is a flat 13-item list. Restructure into grouped, collapsible sections — flat list would hit ~20 items and become unscannable once Analytics/Inventory/Geography land. No existing page is rebuilt; each either stays exactly where it is or gains a tab.

| Group | Items | Status |
|---|---|---|
| — | **Overview** (new landing page, replaces today's `/admin` verification-queue-first page) | New |
| — | **Verification Queue** (today's approve/reject workflow, unchanged, no longer the landing page) | Existing, relocated only |
| **Marketplace** | Bookings (existing, unchanged) · Marketplace Health (new) | Mixed |
| **Cafés** | All Cafés (existing table, unchanged) · Performance (new tab) | Mixed |
| **Inventory** | Setup/Platform Performance (new) | New |
| **Analytics** | Growth · Geography · Revenue · Marketing Attribution · Funnels (all new — this is what fills the dead `/admin/analytics` link) | New |
| **Finance** | Payments (existing, unchanged) · Owner Payouts (existing, unchanged) | Existing, regrouped |
| **Operations** | Support (existing, unchanged) · Audit Log (existing, unchanged) | Existing, regrouped |
| **Platform** | Users (existing, unchanged) · Staff (existing, unchanged) · Promotions (existing + new Campaign Links tab) · Reviews (existing, unchanged) · Settings (existing, unchanged) | Mixed |

`Overview` keeps the existing "Needs Attention" action-items strip (failed transfers/refunds, stuck payments, tickets, pending KYC) as-is — it's real operational signal, not replaced — and adds the executive dashboard metrics above it.

## 5. Phase A — BI Scope (this implementation)

All of the below ship in this pass. Each is derivable from data that already exists today, or from the foundation in Section 3 going forward (some will start sparse and fill in over time — that's expected, not a bug).

1. **Executive Dashboard** (Overview page): total/active users, new users, new cafés, active cafés, bookings today/week/month, GMV, KHELO revenue, avg booking value, cancellation rate, repeat-booking rate, all with period-over-period comparison. Source: `User`, `Cafe`, `Booking`, `PlatformFee`.
2. **Café Performance**: bookings, GMV, commission, utilization (`bookable_stations`/tier seats vs. actual booked hours), cancellations, repeat customers, avg booking value, revenue trend, best-performing game (now real via `Booking.game`), best/worst/fastest-growing ranking.
3. **Setup/Platform Performance**: revenue and utilization broken down by `HardwareTier.platform` (pc/playstation/xbox/nintendo/other) and by individual tier.
4. **Geography**: café-level city/state breakdown (bookings, GMV, revenue) works immediately from `Cafe.city`. User-by-city breakdown fills in only for users who register after `User.city` capture ships.
5. **Revenue/Finance**: GMV vs. KHELO revenue split (from `PlatformFee.owner_settlement_amount` vs. `total_amount`), sliceable by café/city/platform/hour.
6. **Marketplace Health**: successful/cancelled/no-show/failed booking rates from existing `Booking.status`; searches-with-no-results and venue-view counts from `AnalyticsEvent` (sparse until traffic accumulates).
7. **Marketing Attribution**: users/bookings/GMV broken down by `acquisition_source/medium/campaign`. Sparse at launch — only covers signups after this ships.
8. **Funnels**: aggregate stage counts per period — `search_performed` → `venue_viewed` → `booking_flow_started` → `Booking.status=confirmed` → `completed`. Aggregate counts only, not per-user path tracing (that's a Phase B refinement once there's enough volume for individual paths to be meaningful).
9. **Platform Management**: no new CRUD — existing Users/Staff/Bookings/Payments/Payouts/Promotions/Reviews/Settings pages, just regrouped under the new nav, plus the Campaign Links tab on Promotions.

## 6. Explicitly Out of Scope (Phase B, revisit after ~1-2 months of Phase A data)

- Cohort analysis, retention curves, customer LTV, churn detection, customer segmentation — need real repeat-booking history across enough users; building these now against ~53 users would show noise, not signal.
- Pricing recommendation UI — the underlying utilization data ships in Phase A (§5.2/5.3) as a byproduct; the recommendation layer itself waits until there's enough peak/off-peak history to say anything true.
- Demand forecasting, automated/surge pricing engine, competitor intelligence, A/B testing, AI business copilot, natural-language analytics, automated growth recommendations — all skipped per the "AI copilot bullshit can be skipped" call. Same reasoning applies to the rest of this list: none of them have real signal to work from yet, and none of them require foundation decisions made now (they can be layered on later without touching schema).

## 7. Unrelated fixes (already completed, landed before this spec, not part of this plan)

For context — these came up during scoping and were fixed immediately since they were small and unrelated to the BI work:
- `CafeRepository.update_verification_status` now initializes `bookable_stations`/`app_bookable_seats` when a café transitions to VERIFIED and was still at the default `0`, fixing new cafés silently reading as booking-paused.
- Combined convenience fee bumped from 3.85% to 4% (`PLATFORM_MARGIN_PERCENT` 1.20 → 1.35), and the customer checkout label changed from "Platform service fee" to "Convenience fee" to match.

## 8. Testing Notes

- Migration (§3): test upgrade/downgrade, and that existing rows get `NULL`/`[]` defaults without breaking existing queries.
- `POST /api/v1/analytics/events`: test valid event types insert correctly, invalid `event_type` is rejected, oversized `metadata` is rejected, unauthenticated requests succeed (this endpoint must not require auth).
- Registration flow: test that `city`/`acquisition_*` fields are accepted when present and optional when absent; test the post-registration `analytics_events.user_id` backfill by `session_id`.
- Each new analytics endpoint: test against a small known fixture (a handful of bookings/cafés/users with known values) and assert exact aggregate numbers — not just "returns 200."
- Nav restructure: test that every existing admin page is still reachable at its existing URL (no route changes, only nav grouping changes) so no existing bookmark/link breaks.
