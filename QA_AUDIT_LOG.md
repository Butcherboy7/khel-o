# KHEL-O Phase 2: End-to-End QA & Automation Audit Log

## Executive Summary & Status
- **Started**: 2026-08-04
- **Backend Status**: Running on `http://127.0.0.1:8000` (FastAPI / Uvicorn)
- **Frontend Status**: Running on `http://localhost:3000` (Next.js 14 App Router)
- **Verification Status**: All 15 static & dynamic production routes compile 100% cleanly (`npm run build` success). E2E customer application flows verified.

---

## 1. Priority 1: Booking Flow Audit & Fixes

### Issue 1.1: Booking Time Slot Truncation (Slots Stopping at 4:30 PM)
- **Symptom**: Booking screen displayed time slots only up to 4:30 PM for cafés with operating hours from 10:00 AM to 2:00 AM.
- **Root Cause**: `frontend/src/app/(customer)/bookings/new/page.tsx` contained a hardcoded `timeSlots.slice(0, 16)` call, which truncated the generated array of time slots to 16 slots (8 hours total from 9 AM).
- **Fix Implemented**:
  - Removed `timeSlots.slice(0, 16)` in `bookings/new/page.tsx` so all slots spanning the café's full operating hours are rendered.
  - Enhanced `generateTimeSlots` and `isSlotInPast` in `frontend/src/lib/format.ts` to properly handle overnight operating shifts (e.g. 10:00 AM – 2:00 AM next day).
  - Added automatic selection of the first available future time slot instead of defaulting to hardcoded `'18:00:00'`.
- **Status**: FIXED & VERIFIED

### Issue 1.2: HTTP 422 Unprocessable Entity on Booking Request
- **Symptom**: Submitting a booking request resulted in a 422 Unprocessable Entity error.
- **Root Cause**:
  1. Default `selectedTime` of `'18:00:00'` was being used even when it fell within 30 minutes of the current time or in the past for today's date. FastAPI backend's `BookingService.create_booking` enforces `start_datetime - now_ist >= timedelta(minutes=30)` and raises a `ValidationException` (status code 422).
  2. If the user was not authenticated as a `gamer` (e.g., guest user), `createBooking` API returned 401, which triggered `client.ts` to redirect to `/login` without saving booking choices.
- **Fix Implemented**:
  - Implemented automatic initial time slot selection in `bookings/new/page.tsx` to pick the earliest non-disabled slot for today.
  - Added session persistence: when an unauthenticated user clicks "Pay & Book", booking state (`cafeId`, `sessionDate`, `startTime`, `durationHours`, `seatsCount`, `hardwareTierId`) is persisted to `localStorage.setItem('pending_booking', ...)` and restored upon return after login.
- **Status**: FIXED & VERIFIED

### Issue 1.3: Footer / Proceed Button Overlap on Booking Screen
- **Symptom**: Sticky checkout footer overlapped content at the bottom of the order summary on smaller screen sizes.
- **Root Cause**: Insufficient bottom padding (`pb-32`) on the parent container causing content to hide behind the fixed footer.
- **Fix Implemented**: Increased container bottom padding to `pb-40 lg:pb-32` and verified safe-area inset rendering (`pb-safe`) on sticky bottom bar.
- **Status**: FIXED & VERIFIED

---

## 2. Priority 4: Café Details & Google Maps Audit

### Issue 2.1: Google Maps Error Modal ("This page can't load Google Maps correctly")
- **Symptom**: Grey error box and browser alert popup appeared on Café Details page stating "This page can't load Google Maps correctly."
- **Root Cause**: `GoogleLocationDisplay.tsx` invoked `useJsApiLoader` with an empty string when `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` was not configured in `.env.local`, causing Google's JS library to return an `ApiNotActivatedError`.
- **Fix Implemented**:
  - Updated `GoogleLocationDisplay.tsx` to check for missing API key and render an interactive location preview card with venue coordinates, pin badge, and direct "View on Google Maps" external link instead of attempting to load Google JS SDK with an empty key.
  - Unconditionally called `useJsApiLoader` at top of component to strictly follow React's `rules-of-hooks`.
- **Status**: FIXED & VERIFIED

---

## 3. Data-Driven Frontend State Audit (Replacing Hardcoded Data)

### Issue 3.1: Hardcoded Opening Hours & Amenities in Café Details Page
- **Symptom**: Café details page displayed hardcoded string `"Mon - Sun: 10:00 AM - 2:00 AM"` and static amenities array regardless of café data.
- **Root Cause**: Static placeholder JSX in `frontend/src/app/(customer)/cafe/[id]/page.tsx`.
- **Fix Implemented**:
  - Derived opening hours dynamically using `formatTime(cafe.openingTime)` and `formatTime(cafe.closingTime)`.
  - Derived amenities dynamically from `cafe.amenities` array returned by backend.
  - Derived recent reviews dynamically from `cafe.recentReviews` returned by backend.
- **Status**: FIXED & VERIFIED

### Issue 3.2: Notification Center Link & Navigation
- **Symptom**: Notification items had hardcoded UUID links or did not navigate when clicked.
- **Root Cause**: Missing `router.push()` call on notification item click in `NotificationCenter.tsx`.
- **Fix Implemented**: Added `useRouter` and `handleNotificationClick` to mark notification read, navigate to route link (`/bookings`, `/rewards`, `/`), and close drawer.
- **Status**: FIXED & VERIFIED

---

## 4. Priority 5 & 6: Profile & Rewards Page Verification

### Issue 4.1: Unauthenticated Profile Page Access
- **Symptom**: Accessing `/profile` while unauthenticated rendered null without redirecting to login.
- **Fix Implemented**: Added automatic redirect `router.push('/login?redirect=/profile')` when `user` is null.
- **Status**: FIXED & VERIFIED

---

## 5. Verification Matrix Summary

| Route | Test Scenario | Result | Status |
|---|---|---|---|
| `/` | Explore page layout, city filter, search bar, carousel | 200 OK | Passed |
| `/cafe/[id]` | Details gallery, dynamic opening hours, amenities, maps fallback | 200 OK | Passed |
| `/bookings/new` | Date strip, time slots (all slots visible), tier selection, session persistence | 200 OK | Passed |
| `/login` | Auth login form, `test@example.com` auth, query redirect handling | 200 OK | Passed |
| `/bookings` | My Booking Passes list, status filter tabs | 200 OK | Passed |
| `/bookings/[id]` | Digital pass QR code, booking details, add to calendar, cancel modal | 200 OK | Passed |
| `/rewards` | Level XP progress, reward vouchers, gamer badges | 200 OK | Passed |
| `/profile` | Profile details, edit modal, partner CTA, logout confirmation | 200 OK | Passed |
