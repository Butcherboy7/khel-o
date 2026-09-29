# Duration pricing, offer auto-apply & offer safety — design

Date: 2026-09-28 · Branch: `feat/duration-pricing-offer-safety`
Approved mockups: https://claude.ai/artifact/RGdvJbcDSXJHhkF1XuUKVn (owner side approved as drawn; customer side keeps its current UI)

## Problems (verified locally at ec82e03)

1. **Offers never auto-apply.** Checkout (`bookings/new/page.tsx`) checks `isActive`, `validFrom`, `maxUses`, `currentUses`, which `ActivePromotionResponse` doesn't send, so every offer fails the check. The page still sends `promotionId`, so the server may charge a different price than the one shown.
2. **Offers are listed using UTC.** `get_active_promotions_for_cafe` checks the hour and weekday windows against UTC instead of IST.
3. **Amount-off and percentage-off offers apply to any booking length.** "₹60 off" on a ₹90 / 15-min booking charges ₹30, and anything ≤ ₹60 becomes free.
4. **No separate 15/30-minute prices.** Every length is priced at the hourly rate × hours.
5. **Owners type offer hours in 24-hour format** (0–23 / 1–24).

## Rules

### Booking lengths
- Allowed lengths: 15, 30, 60, then every 30 minutes up to 480 (90, 120, …, 480). 45, 75 and other 15-minute steps above 60 are rejected.
- A setup's `min_booking_minutes` must be one of 15, 30 or 60. Migration maps 45 → 30, and anything above 60 → 60.
- Lengths offered to the customer = allowed lengths ≥ `min_booking_minutes`.
- `default_booking_minutes`, when set, must be one of the lengths offered. If it isn't, it's cleared.

### Price (`base_price(tier, minutes, players, is_coop)`)
- `hourly` = `price_per_hour`.
- 15 min → `price_15m`. If that's null, `hourly / 4`.
- 30 min → `price_30m`. If that's null, `hourly / 2`.
- ≥ 60 min → `hourly × minutes / 60` (so 90 = hourly × 1.5).
- Co-op: add `coop_extra_player_price × (players − 1) × minutes / 60`.
- Solo, multiple consoles: price × seats.
- Round to 2 decimals using Decimal.
- Owner-side check when both are set: `price_15m ≤ price_30m ≤ hourly`. Both must be > 0.

### Offers
- New column `min_booking_minutes` on promotions, nullable. It's required for percentage and amount-off offers (default 60 in the UI) and must be one of the allowed lengths.
- Fixed-price deals: rename the meaning of `min_duration_hours` to "exact length". It must be an allowed length (0.25, 0.5, 1, 1.5, …), and the deal only applies on an exact match (the current rule). The regular price comes from `base_price(tier, minutes, 1, False)`.
- **Never free:** if base − discount ≤ 0, the offer doesn't apply (reason: `PROMOTION_WOULD_ZERO`).
- Eligibility checks (active, dates, IST day and hour of the booked slot, uses, setup, play mode, length) live in one function, `evaluate_promotion(...)`, which returns `(eligible, reason_code, message, discount)`. Booking creation, the quote endpoint and the offer list all use it.
- The offer list on the café page is not filtered by the current hour. It only filters on active, dates and uses. Hour and day are checked against the booked slot.
- Migration deletes existing promotions with `current_uses = 0` and no linked bookings, and deactivates the rest (their booking history stays). This is run on prod only after explicit confirmation at ship time.

### Quote endpoint
`POST /api/v1/bookings/quote` (auth optional) with `{cafe_id, hardware_tier_id, session_date, start_time, duration_hours, seats, players, is_coop, promotion_id?, promo_code?}` returns
`{base_amount, discount_amount, subtotal, platform_fee, total, applied_offer: {id,title,label}|null, offer_hint: {title, message}|null, allowed_minutes: [...], prices_by_minutes: {...}}`.
- With no promotion id or code: automatically picks the eligible offer with the biggest discount for that setup.
- `offer_hint`: the best offer that isn't eligible, with a plain-English reason in 12-hour time ("works on bookings of 1 hr or more, 6 PM–11 PM").
- Booking creation calls the same code, so the price shown equals the price charged. The fee formula is reused from `booking_service`.

## UI

### Customer (keep current visuals)
- Checkout replaces its local price and eligibility code with the quote response (debounced, React Query). Summary lines and the offer line keep their current look. Offer-window text shows 12-hour times.
- The TimelineRangePicker stepper and drag snapping move only between allowed lengths (15 → 30 → 60 → 90 …).
- The price on the setup chip and card uses the tier's prices ("from ₹90" is not added; everything stays as is).

### Owner (per approved mockup)
- `SetupBookingOptions`: "Shortest booking" becomes a segmented 15 min / 30 min / 1 hr control. Price boxes appear based on that choice (15 → 15/30/1 hr; 30 → 30/1 hr; 1 hr → hourly only). There's a live preview table (lengths × 1P/2P/3P when co-op is on) with owner-set prices highlighted. Each field gets an `InfoTip`:
  - Shortest booking: "The shortest session customers can book. Above 1 hour, bookings go up in 30-minute steps."
  - 15/30-min price: "What a customer pays for a 15-minute (30-minute) session. Leave it at the suggested amount to keep it in line with your hourly rate."
  - Extra per friend: "Added for each extra player sharing one console. It's charged per hour, so a 30-minute co-op session adds half of this."
  - Preview: "Exactly what customers will pay. Red numbers are prices you set; the rest are worked out from your hourly rate."
- Offer form (`owner/offers/page.tsx`):
  - Percentage and amount-off offers get "Only for bookings of at least" (15m/30m/1h/2h, default 1h) with an InfoTip ("Stops a flat discount from making short sessions nearly free.").
  - Fixed-price deals get "Deal length" limited to allowed lengths, with an InfoTip.
  - Start and end hour become 12-hour selects (value is still 0–24).
  - A live table shows the result for each setup length ("Not eligible" or the final price), plus a note that an offer can never make a booking free.
- Offer cards show the length rule and 12-hour times.

## Data changes (migration 051)
- `hardware_tiers.price_15m NUMERIC(10,2) NULL`, `hardware_tiers.price_30m NUMERIC(10,2) NULL`.
- Normalize `min_booking_minutes` / `default_booking_minutes` as described above.
- `promotions.min_booking_minutes INTEGER NULL`.
- Clean up promotions as described above.

## Testing
- Backend pytest: the `base_price` table (15/30/60/90/120, null fallbacks, co-op scaling, seats); the allowed-lengths validator (reject 45, 75); `evaluate_promotion` (UTC-vs-IST hour window, min length, exact deal length, never-free, play mode, max uses); the quote endpoint matching booking creation totals; tier update validation.
- Existing `test_fixed_price_promotions.py` updated.
- Frontend: tsc, eslint, `next build` (see memory: build before merge), manual run of owner edit, offer form and checkout at 15/30/60/90.

## Out of scope
- Separate extra-player prices per length.
- Changing the customer UI design.
