# KHELO — Launch Readiness Audit Report

**Audit Date**: August 2026  
**Last Verified Against Codebase**: 2026-08-18 (commit `22f79af`)  
**Version**: 1.2  
**Status**: 🟢 **All P0 blockers resolved — P1 nearly clear, two gaps remain**

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [Platform-Wide Checks](#3-platform-wide-checks)
4. [Customer Role Audit](#4-customer-role-audit)
5. [Cafe Owner Role Audit](#5-cafe-owner-role-audit)
6. [Staff Role Audit](#6-staff-role-audit)
7. [Super Admin Role Audit](#7-super-admin-role-audit)
8. [Cross-Role Integration Tests](#8-cross-role-integration-tests)
9. [Production-Wide Issues](#9-production-wide-issues)
10. [Priority Action Items](#10-priority-action-items)
11. [Future Scope](#11-future-scope)
12. [Appendix](#12-appendix)

---

## 1. Executive Summary

### Overall Launch Gate Status

| Core Journey | Completeness | Blocking Issues |
|--------------|--------------|-----------------|
| Customer: Discover - Book - Pay - QR - Check-in - Complete | 98% | None blocking — rewards coupon claims still local-only |
| Owner: Onboard - Approve - Configure - Operate - Money | 95% | Notifications only cover booking/payment/staff-checkin, not staff invite/revoke; opening hours/photos/amenities/map still not editable |
| Staff: Login - Arrivals - Scan - Check-in - Complete | 100% | None |
| Admin: Approve - Manage - Investigate - Rescue | 90% | 3 of ~10 mutating actions still don't write audit logs; no support ticket system |
| System: State propagation across roles | 95% | RoleSync + scanner cache invalidation fixed; no other known sync gaps |

### Critical Blockers — RESOLVED (verified against codebase 2026-08-18)

| Priority | Issue | Status | Verification |
|----------|-------|--------|---------------|
| P0-1 | Scanner cache invalidation missing | ✅ FIXED | `queryClient.invalidateQueries` calls added at `frontend/src/app/(owner)/owner/scanner/page.tsx:294-295` |
| P0-2 | Race condition in booking creation | ✅ FIXED | `get_overlapping_bookings_count_with_lock` (`backend/app/repositories/booking_repository.py:111-138`) takes a `SELECT ... FOR UPDATE` row lock on the tier/cafe row; nothing commits between that lock and the booking `INSERT` + `commit()` in `booking_repo.create()`, so the lock is held for the full check-then-insert window. Serializes on the tier row rather than the specific slot, but the double-booking race is closed. |
| P0-3 | Dead Google OAuth button | ✅ FIXED | Button removed from `frontend/src/app/(auth)/login/page.tsx` |
| P0-4 | Dead Edit Cafe button | ✅ FIXED | New edit-cafe modal wired up in `frontend/src/app/(owner)/owner/settings/page.tsx` |
| P0-5 | Silent error swallowing | ✅ FIXED | `Sentry.captureException(roleRefreshError, ...)` added in `frontend/src/lib/api/client.ts:128` |

### High Priority Issues (verified against codebase 2026-08-18, commit `22f79af`)

| Priority | Issue | Status | Notes |
|----------|-------|--------|-------|
| P1-1 | Hardcoded distance (1.2 km) | ✅ FIXED | Real Haversine calc (`frontend/src/lib/format.ts: calculateDistance/formatDistance`) driven by `locationStore.userLat/userLng` (set from `navigator.geolocation` on the explore page) and `cafe.latitude/longitude`. Falls back to no distance label if either coordinate pair is missing. |
| P1-2 | Hardcoded amenities/games | ✅ FIXED | `cafe/[id]/page.tsx` now renders `cafe.amenities` / `cafe.supportedGames` from the API with an empty-state message instead of static arrays |
| P1-3 | Mock rewards system | ⚠️ MOSTLY FIXED | New `GET /api/v1/rewards` (`backend/app/api/v1/rewards.py`) computes real XP/level/achievements from the gamer's completed bookings; rewards page now fetches it. **Remaining gap:** the `COUPONS` catalog is still a hardcoded frontend array, and claim state is stored only in `localStorage` (`khelo_claimed_coupons_{userId}`) — not persisted server-side, so claims don't survive a device change and there's no backend enforcement of `requiredXp`. |
| P1-4 | Owner notifications missing | ✅ FIXED | `/owner/notifications` page added, notification bell with unread-count badge added to `OwnerShell.tsx`; `booking_service.py`, `payment_service.py`, and `owner_service.py` now write `Notification` rows on booking confirmed/cancelled, payment failed, and staff check-in |
| P1-5 | No delete tier API | ✅ FIXED | `DELETE /api/v1/owner/cafes/{cafe_id}/tiers/{tier_id}` added at `backend/app/api/v1/owner.py:1614-1615` |
| P1-6 | RoleSync doesn't poll | ✅ FIXED | `RoleSyncProvider.tsx` now runs `syncRoles()` on mount and every 30s via `setInterval` |
| P1-7 | Refund silent failures | ✅ FIXED | `process_refund` in `backend/app/services/payment_service.py` now logs `logger.warning`/`logger.error` on Razorpay refund failures instead of swallowing them |
| P1-8 | Audit logging incomplete | ⚠️ MOSTLY FIXED | `write_audit_log()` now called from cafe verify/approve/reject (`admin.py:194`), user activate/deactivate (`:276`, `:304`), review visibility toggle (`:474`), cafe suspend/reactivate (`:512`, `:538`), and staff.revoke (`:643`). **Remaining gap:** `PATCH /users/{user_id}/role` (`change_user_role_admin`, `admin.py:319`), `PATCH /cafes/{cafe_id}/pause-bookings` (`:552`), and `PATCH /promotions/{promotion_id}/deactivate` (`:417`) still don't write audit log entries. |

---

## 2. Architecture Overview

### Technology Stack

#### Backend
| Component | Technology |
|-----------|------------|
| Framework | FastAPI (Python 3.11+) |
| Database | PostgreSQL with asyncpg driver |
| ORM | SQLAlchemy 2.0 (async) |
| Authentication | JWT (python-jose, HS256) |
| Password Hashing | bcrypt |
| Payments | Razorpay SDK |
| QR Codes | qrcode[pil] |
| Validation | Pydantic v2 |
| Migrations | Alembic |
| Testing | pytest + pytest-asyncio |
| Monitoring | Sentry, structlog |
| Email | Resend API |

#### Frontend
| Component | Technology |
|-----------|------------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript 5.3 |
| State Management | Zustand |
| Data Fetching | TanStack React Query v5 |
| HTTP Client | Axios |
| Styling | TailwindCSS 3.4 |
| Animations | Framer Motion |
| Maps | @react-google-maps/api |
| Icons | Lucide React |
| PWA | next-pwa |
| E2E Testing | Playwright |

### Project Structure

```
E:\KHEL-O\
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── deps.py              # Auth dependencies (role guards)
│   │   │   └── v1/                  # API v1 endpoints
│   │   ├── core/                    # Security, exceptions, logging
│   │   ├── models/                  # SQLAlchemy ORM models
│   │   ├── repositories/            # Data access layer
│   │   ├── schemas/                 # Pydantic schemas
│   │   ├── services/                # Business logic layer
│   │   ├── background/              # Background tasks (QR, notifications)
│   │   ├── config.py                # Settings
│   │   ├── database.py              # Async SQLAlchemy engine
│   │   └── main.py                  # FastAPI entry point
│   ├── migrations/                  # Alembic migrations
│   ├── tests/                       # pytest tests
│   └── scripts/                     # Seeding, admin creation
│
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── (auth)/              # Login, register, accept-invitation
│   │   │   ├── (customer)/          # Customer portal
│   │   │   ├── (owner)/             # Owner/Staff portal
│   │   │   └── (admin)/             # Admin dashboard
│   │   ├── components/              # React components
│   │   ├── lib/api/                 # API client modules
│   │   ├── store/                   # Zustand stores
│   │   ├── hooks/                   # Custom React hooks
│   │   └── types/                   # TypeScript types
│   └── public/                      # Static assets
│
└── docker-compose.yml
```

### Authentication System

#### Token System
- **Access Token**: JWT, 15 min expiry
- **Refresh Token**: JWT, 30 days expiry
- **Algorithm**: HS256
- **Payload**: `{sub: userId, email, role, type: "access", exp}`

#### Auth Methods
1. **Email/Password**: Standard registration and login
2. **Google OAuth 2.0**: Backend ready, frontend incomplete

#### Auto Token Refresh
- Axios interceptor catches 401 errors
- Queues concurrent requests during refresh
- Refreshes token via `/api/v1/auth/refresh`
- Retries original requests with new token

### Role-Based Access Control (RBAC)

#### Backend Roles
```python
class UserRole(str, enum.Enum):
    GAMER = "gamer"          # Customer
    CAFE_OWNER = "cafe_owner" # Cafe proprietor
    STAFF = "staff"          # Cafe employee
    ADMIN = "admin"          # Platform admin
```

#### Role Guards

| Dependency | Required Roles | Description |
|------------|----------------|-------------|
| `require_gamer` | gamer | Customer endpoints |
| `require_cafe_owner` | cafe_owner OR admin | Owner endpoints |
| `require_staff` | staff OR cafe_owner OR admin | Staff endpoints |
| `require_admin` | admin only | Admin endpoints |
| `require_cafe_ownership` | Owner of specific cafe | Cafe management |

---

## 3. Platform-Wide Checks

### 3.1 Authentication

| Check | Status | Details |
|-------|--------|---------|
| Authentication works reliably | PASS | JWT-based auth with refresh tokens |
| Invalid input rejected | PASS | Zod validation on frontend, Pydantic on backend |
| Sessions persist across refresh | PASS | localStorage persistence with Zustand |
| Expired sessions recover cleanly | PASS | Auto-refresh via axios interceptor |
| Logout works | PASS | Clears localStorage, redirects to login |

### 3.2 Authorization

| Check | Status | Details |
|-------|--------|---------|
| Backend auth on all endpoints | PASS | 84 protected endpoints have role guards |
| Multi-role without duplicates | PASS | user_roles table supports multiple roles |
| Role switching without logout | PASS | /auth/switch-role endpoint |
| Cross-role API access blocked | PASS | require_cafe_ownership validates |

### 3.3 Error Handling

| Check | Status | Details |
|-------|--------|---------|
| Loading states exist | PASS | Skeleton components, Loader2 spinners |
| API errors handled | PARTIAL | Silent catches in client.ts:127-129 |
| No critical console errors | PARTIAL | Console.error in prod code |
| Important state persisted | PARTIAL | Scanner missing cache invalidation |

### 3.4 Data Integrity

| Check | Status | Details |
|-------|--------|---------|
| Data from backend (not mock) | PARTIAL | XP/achievements now real; reward coupon catalog + claims still frontend-only |
| Refresh doesn't destroy state | PASS | localStorage persistence |
| Responsive layouts | PASS | Extensive Tailwind breakpoints |
| Success/failure feedback | PASS | Toast notifications |

---

## 4. Customer Role Audit

### 4.1 Authentication

| Feature | Status | Implementation |
|---------|--------|----------------|
| Register | PASS | Zod validation, backend creates user |
| Login | PASS | Email/password, returns JWT |
| Invalid input rejected | PASS | Phone: 10 digits starting with 6-9 |
| Session survives refresh | PASS | localStorage with Zustand |
| Logout | PASS | Clears tokens, redirects |

| Missing Feature | Priority |
|-----------------|----------|
| Google OAuth | HIGH - Dead button exists |
| Password reset | HIGH - Not implemented |
| Email verification | MEDIUM |
| Phone OTP | LOW |

### 4.2 Discovery

| Feature | Status | Location |
|---------|--------|----------|
| Cafe listing | PASS | Paginated list with CafeCard |
| Cafe cards show names | PASS | cafe.name from API |
| Cafe cards show price | PASS | cafe.minPrice formatted |
| Cafe cards show open/closed | PASS | Badge based on cafe.isOpen |
| Hardware tier filters | PASS | Filter chips functional |
| Search by name | PASS | Debounced search |
| Search by city | PASS | 5 city filters |
| Location selection | PASS | Geolocation API |
| Google Maps directions | PASS | Deep link to maps |

| Issue | Location | Status |
|-------|----------|--------|
| Distance hardcoded "1.2 km" | CafeCard.tsx | ✅ FIXED — real Haversine calc from user geolocation + cafe lat/lng |
| "Open Now" not connected | page.tsx:74-82 | ❌ OPEN — still not using actual cafe hours |

### 4.3 Cafe Details

| Feature | Status | Implementation |
|---------|--------|----------------|
| Page opens | PASS | Dynamic route with cafe ID |
| Images work | PASS | Carousel with navigation |
| Hardware tiers shown | PASS | Per-tier specs displayed |
| Prices shown | PASS | tier.pricePerHour formatted |
| Directions work | PASS | Google Maps deep link |
| Reviews display | PASS | List + create review |
| Share works | PASS | Web Share API |

| Issue | Location | Status |
|-------|----------|--------|
| Amenities hardcoded | cafe/[id]/page.tsx | ✅ FIXED — renders `cafe.amenities` with empty-state fallback |
| Games hardcoded | cafe/[id]/page.tsx | ✅ FIXED — renders `cafe.supportedGames` with empty-state fallback |
| Opening hours hardcoded | cafe/[id]/page.tsx:250-270 | ❌ OPEN — still not using cafe.openingTime/closingTime |

### 4.4 Booking Flow

| Feature | Status | Implementation |
|---------|--------|----------------|
| Date selection | PASS | 14-day horizon |
| Opening hours determine slots | PASS | Backend validates |
| Overnight hours work | PASS | Handles 10 AM to 2 AM next day |
| Past times blocked | PASS | 30-min advance enforced |
| Hardware tier selection | PASS | Radio cards |
| Duration selection | PASS | TimelineRangePicker with gestures |
| Price updates | PASS | Real-time calculation |
| Emergency mode handled | PASS | Blocks booking |

| Critical Issue | Location | Impact |
|----------------|----------|--------|
| Race condition in booking creation | booking_service.py:90-97 | Double-booking possible |

**Race Condition Details:**

The availability check uses `with_lock=True` for SELECT, but the lock is released AFTER the query, BEFORE the booking INSERT. Two concurrent requests can both pass the check and create bookings.

**Fix Required:**
```python
# Use advisory locks within transaction
async with self.db.begin():
    await self.db.execute(
        text("SELECT pg_advisory_xact_lock(:cafe_id)"),
        {"cafe_id": str(cafe_id)}
    )
    # Check capacity and create booking within same transaction
```

### 4.5 Payment

| Feature | Status | Implementation |
|---------|--------|----------------|
| Razorpay checkout opens | PASS | Order creation with amount in paise |
| Payment success | PASS | HMAC-SHA256 signature verification |
| Payment failure | PASS | Shows error, allows retry |
| Payment cancellation | PASS | Modal closes, booking pending |
| Pending payment shown | PASS | "Payment Required" card |
| Retry payment | PASS | Recreates Razorpay order |
| 15-min TTL enforced | PASS | Session expires |
| Success produces confirmed booking | PASS | Status + QR generated |
| Failed payment has no QR | PASS | QR hidden for non-confirmed |

| Issue | Location | Fix |
|-------|----------|-----|
| Refund silent failure | payment_service.py:319-321 | Create refund failure record for admin |

### 4.6 Booking Confirmation

| Feature | Status | Implementation |
|---------|--------|----------------|
| Confirmation screen | PASS | Success page after payment |
| Booking ID exists | PASS | Format: GC-{year}-{random} |
| QR generated for confirmed | PASS | PNG saved to /static/qr/ |
| QR can be scanned | PASS | Scanner validates |
| Appears in My Bookings | PASS | React Query invalidation |

### 4.7 My Bookings

| Feature | Status | Implementation |
|---------|--------|----------------|
| Status tabs | PASS | All/Upcoming/Active/Completed/Cancelled |
| Cancelled QR void | PASS | "Pass Voided" overlay |
| Directions button | PASS | Google Maps deep link |
| Cancel functionality | PASS | Modal with reason |
| Review after complete | PASS | Rate & review button |

### 4.8 Profile & Rewards

| Feature | Status | Implementation |
|---------|--------|----------------|
| Profile display | PASS | Name, email, phone, city |
| Phone validation | PASS | 10-digit Indian format |
| Apply to be owner | PASS | Onboarding flow |
| Application status | PASS | pending/verified/rejected |

| Issue | Location | Status |
|-------|----------|--------|
| Rewards system is mock data | rewards/page.tsx, backend/app/api/v1/rewards.py | ⚠️ MOSTLY FIXED — XP/level/achievements now computed from real completed bookings via `GET /api/v1/rewards`. Coupon catalog + claim state are still frontend-only (`localStorage`), not backend-persisted or XP-enforced. |
| Profile preferences not persisted | profile/page.tsx:50-52 | ❌ OPEN |

---

## 5. Cafe Owner Role Audit

### 5.1 Owner Access

| Feature | Status | Implementation |
|---------|--------|----------------|
| Login | PASS | Standard auth |
| Role switcher visible | PASS | When user.roles.length > 1 |
| Switch to Customer Mode | PASS | Without logout |
| Cross-cafe access blocked | PASS | require_cafe_ownership |

### 5.2 Dashboard

| Feature | Status | Implementation |
|---------|--------|----------------|
| Today's bookings | PASS | Live list with 30s poll |
| Upcoming bookings | PASS | Filtered by date |
| Active sessions | PASS | checked_in/active status |
| Today's booking value | PASS | Calculated from amounts |
| Available capacity | PASS | Real-time seat counts |
| Pending check-ins | PASS | Action items list |

### 5.3 Cafe Management

| Feature | Status | Location |
|---------|--------|----------|
| View cafe profile | PASS | Read-only display |
| Edit cafe name/details | PASS | `EditCafeModal` wired to Edit button, `frontend/src/components/owner/EditCafeModal.tsx` |
| Edit address (line 1, city, state, pincode) | PASS | Fields present in `EditCafeModal` |
| Edit phone number | PASS | Field present in `EditCafeModal` |
| Edit Google Maps location (lat/lng) | FAIL | No UI in `EditCafeModal` |
| Edit opening hours | FAIL | No UI in `EditCafeModal` |
| Manage amenities | FAIL | No UI in `EditCafeModal` |
| Manage photos | FAIL | No UI in `EditCafeModal` |

**Resolved: Dead Edit Button (P0-4)**

`frontend/src/app/(owner)/owner/settings/page.tsx` now opens `EditCafeModal` on click, letting owners edit name, phone, address, city, state, and pincode. Opening hours, map location, amenities, and photo management are still not editable anywhere in the UI — a real gap, but a scoped follow-up rather than a dead button.

### 5.4 Hardware / Inventory

| Feature | Status | Implementation |
|---------|--------|----------------|
| Create hardware tier | PASS | Full modal form |
| Edit tier | PASS | All fields editable |
| Set price | PASS | Per-hour pricing |
| Set specifications | PASS | GPU, CPU, RAM, monitor |
| Set total capacity | PASS | totalSeats field |
| Set KHELO capacity | PASS | appBookableSeats field |
| Preset tiers | PASS | esports_starter, pro_gaming, ultra_streamer |

| Missing | Priority |
|---------|----------|
| Delete tier | HIGH - No API endpoint |
| Deactivate tier | HIGH - Backend has is_active but no UI |

### 5.5 Bookings

| Feature | Status | Implementation |
|---------|--------|----------------|
| Customer booking appears | PASS | React Query polling |
| Booking details correct | PASS | All fields shown |
| Payment status visible | PASS | Status badge |
| Cancellation reflected | PASS | Real-time status |
| Check-in status reflected | PASS | Check-in time shown |
| Permitted actions | PASS | One-tap check-in, complete, no-show |

### 5.6 Online Booking Controls

| Feature | Status | Implementation |
|---------|--------|----------------|
| Pause online bookings | PASS | Toggle switch |
| Paused cafe no new bookings | PASS | Backend validation |
| Existing bookings preserved | PASS | No deletion |
| Emergency mode | PASS | Blocks all bookings |
| Resume booking | PASS | Toggle off |

### 5.7 Staff Management

| Feature | Status | Implementation |
|---------|--------|----------------|
| Invite staff | PASS | Email + name form |
| Invitation status visible | PASS | Pending/accepted/expired |
| Accept invitation | PASS | Token-based flow |
| Staff under correct cafe | PASS | user_roles.cafe_id set |
| Remove staff | PASS | Delete button |
| Removed staff loses access | PASS | Role deactivated |
| Staff can't access owner features | PASS | require_cafe_owner guard |

### 5.8 Payments

| Feature | Status | Implementation |
|---------|--------|----------------|
| See booking payment status | PASS | Status badge |
| See amount | PASS | Booking amounts |
| Settlement state visible | PASS | Net = Gross - Fees |

| Missing | Priority |
|---------|----------|
| View refund status per booking | MEDIUM |
| Initiate refund request | LOW (may be intentional admin-only) |

### 5.9 Owner Notifications

| Event | Status | Implementation |
|-------|--------|-----------------|
| New booking confirmed | PASS | `payment_service.py` writes a `booking_confirmed` Notification after Razorpay verification |
| Booking cancellation | PASS | `booking_service.py._notify_owner` on `cancel_booking` |
| Payment issue | PASS | `payment_service.py` writes `payment_failed` on invalid-signature path |
| Customer checked in | PARTIAL | Only fires when **staff** (not the owner themself) performs the check-in, via `owner_service.py` |
| Staff activity (invited/removed) | FAIL | No notification on invite/accept/revoke |
| Notification bell + unread badge | PASS | `OwnerNotificationBell` in `OwnerShell.tsx`, polls `/api/v1/notifications/unread-count` every 30s |
| `/owner/notifications` page | PASS | `frontend/src/app/(owner)/owner/notifications/page.tsx` |

**Remaining gap:** staff invite/accept/revoke events still don't notify the owner. Everything else in this section is resolved as of commit `22f79af`.
- Unread count badge
- Notification types: new_booking, check_in, cancellation, payment_issue, staff_activity

---

## 6. Staff Role Audit

### 6.1 Access

| Feature | Status | Implementation |
|---------|--------|----------------|
| Login | PASS | Standard auth |
| Auto Staff Mode | PASS | OwnerShell sets isStaff=true |
| Correct cafe displayed | PASS | user_roles.cafe_id binding |
| Cannot see unrelated cafes | PASS | Backend filtering |
| Cannot access owner controls | PASS | require_cafe_owner guard |

### 6.2 Daily Operations

| Feature | Status | Implementation |
|---------|--------|----------------|
| Today's bookings visible | PASS | Simplified dashboard |
| Upcoming arrivals | PASS | Arrival list |
| Search booking | PASS | By reference/gamer name |
| QR scanner camera | PASS | Camera scanning |
| Invalid QR handled | PASS | Error message shown |
| Already-used QR handled | PASS | Status validation |
| Cancelled booking rejected | PASS | Status check |
| Unpaid booking rejected | PASS | Payment status check |

### 6.3 Check-In

| Feature | Status | Implementation |
|---------|--------|----------------|
| Correct customer shown | PASS | Gamer name displayed |
| Correct cafe shown | PASS | Cafe name in response |
| Correct tier shown | PASS | Hardware tier displayed |
| Confirm check-in | PASS | Check-in button |
| Booking becomes Checked In | PASS | Status update |
| Audit trail | PASS | checked_in_by recorded |

### 6.4 Resolved: Scanner Cache Invalidation

**Location:** `frontend/src/app/(owner)/owner/scanner/page.tsx:294-295`

The scanner's `handleCheckIn` now calls `queryClient.invalidateQueries({ queryKey: queryKeys.owner.all })` and `queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all })` right after `checkinBooking(bookingId)` succeeds, so the customer's My Bookings and the owner dashboard both pick up the check-in without a manual refresh.

---

## 7. Super Admin Role Audit

### 7.1 Admin Security

| Feature | Status | Implementation |
|---------|--------|----------------|
| Login | PASS | Standard auth |
| Backend permissions enforced | PASS | require_admin on all endpoints |
| Normal users blocked | PASS | Returns 403 |
| Audit logging | PARTIAL | Most admin actions logged now; role-change, pause-bookings, promotion-deactivate still not |

### 7.2 Dashboard

| Feature | Status | Implementation |
|---------|--------|----------------|
| Total users by role | PASS | Role breakdown |
| Total cafes by status | PASS | Status breakdown |
| Monthly bookings/revenue | PASS | Metrics displayed |
| Pending applications | PASS | Queue count |
| Active sessions | PASS | Live view |

### 7.3 Cafe Management

| Feature | Status | Implementation |
|---------|--------|----------------|
| Search all cafes | PASS | By name/city/owner |
| Filter by status | PASS | Dropdown filters |
| Cafe details | PASS | Full profile view |
| Approve/Reject | PASS | With reason |
| Suspend/Reactivate | PASS | Toggle buttons |
| Pause bookings | PASS | Without full suspension |

### 7.4 User Management

| Feature | Status | Implementation |
|---------|--------|----------------|
| Search users | PASS | By email |
| Filter by role/status | PASS | Dropdown filters |
| View roles | PASS | Role badges |
| View cafe memberships | PASS | Cafe assignments |
| Suspend/Reactivate | PASS | Toggle buttons |

### 7.5 Booking Investigation

| Feature | Status | Implementation |
|---------|--------|----------------|
| Search any booking | PASS | By reference, ID, gamer, cafe |
| View payment state | PASS | Payment status |
| View booking state | PASS | Status timeline |
| View QR/check-in state | PASS | QR valid/used status |

### 7.6 Payments

| Feature | Status | Implementation |
|---------|--------|----------------|
| See payment records | PASS | All transactions |
| See Razorpay reference | PASS | Order ID, Payment ID |
| See refund state | PASS | Refund ID, timestamp |

| Missing | Priority |
|---------|----------|
| Admin-initiated refund | HIGH |
| Dispute resolution workflow | MEDIUM |

### 7.7 Support / Moderation

| Feature | Status | Priority |
|---------|--------|----------|
| Support ticket system | NOT IMPLEMENTED | HIGH |
| Link issue to user/booking/cafe | NOT IMPLEMENTED | HIGH |
| View/moderate reviews | PASS | Hide/restore |
| Record moderation actions | PARTIAL | Not logged |

### 7.8 Audit Trail

| Feature | Status | Details |
|---------|--------|---------|
| Audit log table | PASS | admin_audit_logs table exists |
| Action tracking | PARTIAL | Cafe verify/suspend/reactivate, user activate/deactivate, review toggle, staff.revoke logged; role-change, pause-bookings, promotion-deactivate not |
| Who approved cafe | PASS | `admin.py:194` |
| Who suspended cafe | PASS | `admin.py:512` |
| Who modified user | PASS | activate/deactivate logged; role changes (`admin.py:319`) still not |

**Remaining gap:** `change_user_role_admin`, `set_cafe_bookings_paused`, `deactivate_promotion_admin` still don't call `write_audit_log`.

---

## 8. Cross-Role Integration Tests

### 8.1 Scenario A - Customer Booking

| Step | Status | Notes |
|------|--------|-------|
| Customer books | PASS | Creates pending_payment |
| Payment succeeds | PASS | Booking confirmed |
| Appears in Customer | PASS | React Query invalidates |
| Appears in Owner | PASS | 30s polling |
| Appears in Staff | PASS | Shares owner routes |
| QR appears | PASS | Generated on confirmation |
| Staff scans QR | PASS | Scanner validates |
| Check-in updates Customer | PASS | `queryClient.invalidateQueries` in scanner |
| Check-in updates Owner | PASS | `queryClient.invalidateQueries` in scanner |
| Session completes | PASS | Manual completion |

### 8.2 Scenario B - Owner Approval

| Step | Status | Notes |
|------|--------|-------|
| Customer applies | PASS | Onboarding flow |
| Admin sees pending | PASS | Dashboard queue |
| Admin approves | PASS | Status to verified |
| Role update | PASS | `RoleSyncProvider` now polls every 30s (was sync-once-on-mount) |

### 8.3 Scenario C - Staff

| Step | Status | Notes |
|------|--------|-------|
| Owner invites | PASS | Invitation created |
| Staff accepts | PASS | Token-based |
| Gets cafe membership | PASS | user_roles.cafe_id |
| Can check-in | PASS | Scanner works |
| Owner sees actions | PASS | Scanner check-in now invalidates owner queries; owner also gets an in-app notification on staff check-in |
| Staff removable | PASS | Delete button |

### 8.4 Scenario D - Cancellation

| Step | Status | Notes |
|------|--------|-------|
| Customer cancels | PASS | 2-hour policy enforced |
| Status to cancelled | PASS | Status update |
| QR inactive | PASS | Void overlay |
| Owner sees | PASS | Status visible |
| Refund updates | PARTIAL | Failures now logged via `logger.warning`/`.error`, but still no admin-facing surface (no ticket/record created) |

### 8.5 Scenario E - Payment Failure

| Step | Status | Notes |
|------|--------|-------|
| Payment fails | PASS | Mock failure works |
| Not confirmed | PASS | Remains pending_payment |
| No QR | PASS | QR hidden |
| Retry available | PASS | Retry button shown |

### 8.6 Scenario F - Cafe Paused

| Step | Status | Notes |
|------|--------|-------|
| Owner pauses | PASS | Toggle works |
| Customer blocked | PASS | Button disabled |
| Existing preserved | PASS | No deletion |
| Resume works | PASS | Button enabled |

---

## 9. Production-Wide Issues

### P0 - Critical — ALL RESOLVED (verified 2026-08-18)

| Issue | Location | Status |
|-------|----------|--------|
| Scanner cache invalidation missing | scanner/page.tsx:294-295 | ✅ FIXED |
| Race condition in booking | booking_repository.py:111-138 | ✅ FIXED (row-level `SELECT ... FOR UPDATE` held through insert+commit) |
| Dead Google OAuth button | login/page.tsx | ✅ FIXED (button removed) |
| Dead Edit Profile button | settings/page.tsx | ✅ FIXED (EditCafeModal wired up) |
| Silent error swallowing | client.ts:128 | ✅ FIXED (Sentry.captureException added) |

### P1 - High Priority — nearly clear (verified 2026-08-18, commit `22f79af`)

| Issue | Location | Impact | Status |
|-------|----------|--------|--------|
| Hardcoded distance | CafeCard.tsx, cafe/[id]/page.tsx | Misleading UX | ✅ FIXED |
| Hardcoded amenities/games | cafe/[id]/page.tsx | Wrong data | ✅ FIXED |
| Mock rewards system | rewards/page.tsx | Features broken | ⚠️ MOSTLY FIXED — XP/achievements real, coupon claim state still localStorage-only |
| Owner notifications missing | No /owner/notifications | Owners unaware | ✅ FIXED (staff invite/revoke events still don't notify) |
| No delete tier API | owner.py:1614-1615 | Can't remove tiers | ✅ FIXED |
| RoleSync doesn't poll | RoleSyncProvider.tsx | Requires reload | ✅ FIXED (30s interval) |
| Refund silent failures | payment_service.py:process_refund | May need manual fix | ✅ FIXED (logs Razorpay failures) |
| Audit logging incomplete | admin.py | Accountability gap | ⚠️ MOSTLY FIXED — role-change, pause-bookings, promotion-deactivate still not logged |

### P2 - Medium Priority (Next Sprint)

| Issue | Location | Fix |
|-------|----------|-----|
| Password reset missing | No forgot-password flow | Implement |
| IDOR info disclosure | booking_service.py:182-196 | Same error message |
| No tier activation toggle | Backend has field, no UI | Add toggle |
| Favorites/wishlist missing | Not implemented | New feature |

---

## 10. Priority Action Items

### Phase 1 - Critical Fixes (Week 1) — ✅ ALL COMPLETE

All five P0 items (scanner cache invalidation, booking-creation locking, dead Google OAuth button, dead Edit Profile button, silent error swallowing) are implemented in the codebase — see section 1 and section 9 above for verified locations. No outstanding code to write for Phase 1.

### Phase 2 - High Priority (Week 2) — ✅ ALL COMPLETE

Real distance calc (Haversine), API-sourced amenities/games, the owner notification center (page + bell + backend triggers), the delete-tier endpoint, and RoleSync polling are all implemented — see section 9 above for verified locations. No outstanding code to write for Phase 2.

### Phase 3 - Polish (Week 3-4)

#### P3-1: Real Rewards Backend — ⚠️ MOSTLY DONE

`GET /api/v1/rewards` (`backend/app/api/v1/rewards.py`) computes XP and unlocks the four achievements (First Blood, Night Owl, Weekend Warrior, Regular Patron) directly from `Booking` rows with `status == COMPLETED` — no new `rewards`/`achievements` tables were needed, it's derived on read.

**Still open:** the `vouchers`/coupon layer. `COUPONS` in `rewards/page.tsx` is still a hardcoded frontend array, and "claiming" just writes an id to `localStorage` — there's no backend table, no server-side enforcement that `requiredXp` is met, and claims don't survive a device/browser change. If a real voucher system matters for launch, this still needs:
```sql
CREATE TABLE vouchers (
  id UUID PRIMARY KEY,
  code VARCHAR(20) UNIQUE,
  discount_value DECIMAL(10,2),
  xp_required INTEGER,
  valid_until TIMESTAMP
);
CREATE TABLE voucher_claims (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  voucher_id UUID REFERENCES vouchers(id),
  claimed_at TIMESTAMP
);
```
plus `POST /api/v1/rewards/coupons/{id}/claim` that checks `requiredXp` server-side before recording a claim.

#### P3-2: Complete Audit Logging — ⚠️ MOSTLY DONE

`write_audit_log` now covers: cafe approve/reject (`admin.py:194`), cafe suspend/reactivate (`:512`, `:538`), user activate/deactivate (`:276`, `:304`), review visibility toggle (`:474`), staff.revoke (`:643`).

**Still open** — three admin mutation endpoints don't call it:
- `PATCH /users/{user_id}/role` — `change_user_role_admin`, `admin.py:319`
- `PATCH /cafes/{cafe_id}/pause-bookings` — `set_cafe_bookings_paused`, `admin.py:552`
- `PATCH /promotions/{promotion_id}/deactivate` — `deactivate_promotion_admin`, `admin.py:417`

#### P3-3: Implement Support Ticket System

**New tables:**
```sql
CREATE TABLE support_tickets (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  subject VARCHAR(255),
  description TEXT,
  status VARCHAR(20) DEFAULT 'open',
  priority VARCHAR(10) DEFAULT 'normal',
  category VARCHAR(50),
  booking_id UUID REFERENCES bookings(id),
  cafe_id UUID REFERENCES cafes(id)
);
```

#### P3-4: Implement Password Reset

```python
@router.post("/auth/forgot-password")
async def forgot_password(email: str):
    # Generate reset token
    # Send email

@router.post("/auth/reset-password")  
async def reset_password(token: str, new_password: str):
    # Validate token
    # Update password
```

---

## 11. Future Scope

### 11.1 Short-Term (1-2 Months)

| Feature | Description | Priority |
|---------|-------------|----------|
| Booking Modifications | Reschedule without cancellation | HIGH |
| Enhanced Search | Elasticsearch integration | HIGH |
| Staff Scheduler | Shift management | MEDIUM |
| Cafe Analytics | Owner dashboard metrics | MEDIUM |
| Push Notifications | Mobile push | HIGH |
| Favorites/Wishlist | Save favorite cafes | MEDIUM |
| Social Features | Friends, compare stats | LOW |

### 11.2 Medium-Term (3-6 Months)

| Feature | Description | Priority |
|---------|-------------|----------|
| Multi-Session Booking | Back-to-back sessions in one checkout | HIGH |
| Split Payment | Split bill with friends | MEDIUM |
| Group Booking | Team/party coordination | MEDIUM |
| Dynamic Pricing | Peak/off-peak rates | HIGH |
| Loyalty Tiers | Bronze/Silver/Gold status | MEDIUM |
| Referral System | Invite friends, earn credits | HIGH |
| Cafe Comparison | Side-by-side view | LOW |

### 11.3 Long-Term (6-12 Months)

| Feature | Description | Priority |
|---------|-------------|----------|
| Mobile App | React Native or Flutter | HIGH |
- Offline mode
- Push notifications
- Camera features

| Feature | Description | Priority |
|---------|-------------|----------|
| Tournament Platform | Esports events | MEDIUM |
| Live Streaming | Stream cafe sessions | LOW |
| Marketplace | Sell gaming gear | LOW |
| API Platform | Third-party integrations | MEDIUM |
| White Label | License platform | LOW |

### 11.4 Scaling Considerations

| Area | Current State | Future Need |
|------|---------------|-------------|
| Database | Single Postgres | Read replicas, sharding |
| Cache | React Query only | Redis for sessions, queues |
| Search | LIKE queries | Elasticsearch |
| Queue | Background tasks | Celery/RQ for jobs |
| CDN | Static assets | Multi-region CDN |
| Monitoring | Sentry | Prometheus + Grafana |

### 11.5 Security Enhancements

| Enhancement | Description | Priority |
|-------------|-------------|----------|
| 2FA | Two-factor authentication | HIGH |
| Device Management | View/revoke sessions | MEDIUM |
| Rate Limiting | API throttling | HIGH |
| Fraud Detection | Suspicious booking patterns | MEDIUM |
| PCI Compliance | Payment security audit | HIGH |

### 11.6 UX Improvements

| Improvement | Description | Priority |
|-------------|-------------|----------|
| Onboarding Tutorial | Guide new users | HIGH |
| Empty States | Better illustrations | MEDIUM |
| Accessibility | WCAG compliance | HIGH |
| Progressive Web App | Full PWA features | MEDIUM |
| Dark Mode | Theme support | LOW |

---

## 12. Appendix

### File References

#### Backend Core Files
| File | Purpose |
|------|---------|
| `backend/app/api/deps.py` | Auth dependencies, role guards |
| `backend/app/api/v1/auth.py` | Authentication endpoints |
| `backend/app/api/v1/bookings.py` | Booking CRUD |
| `backend/app/api/v1/owner.py` | Owner/Staff endpoints |
| `backend/app/api/v1/admin.py` | Admin endpoints |
| `backend/app/services/booking_service.py` | Booking business logic |
| `backend/app/services/payment_service.py` | Payment/Razorpay logic |
| `backend/app/services/owner_service.py` | Owner business logic |

#### Frontend Core Files
| File | Purpose |
|------|---------|
| `frontend/src/store/authStore.ts` | Auth state management |
| `frontend/src/lib/api/client.ts` | Axios client with interceptors |
| `frontend/src/components/layout/AuthGuard.tsx` | Route protection |
| `frontend/src/components/layout/RoleSwitcher.tsx` | Role switching UI |
| `frontend/src/app/(owner)/owner/scanner/page.tsx` | QR scanner |
| `frontend/src/app/(owner)/owner/dashboard/page.tsx` | Owner dashboard |
| `frontend/src/app/(customer)/bookings/new/page.tsx` | Booking flow |

#### Test Files
| File | Coverage |
|------|----------|
| `backend/tests/test_inventory_and_staff.py` | Staff, cafe access |
| `backend/tests/test_staff_invitations.py` | Invitation flow |
| `frontend/playwright.config.ts` | E2E test config |

### Key Metrics to Track Post-Launch

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| Booking success rate | > 95% | < 90% |
| Payment success rate | > 97% | < 95% |
| Check-in success rate | > 98% | < 95% |
| API response time (p95) | < 500ms | > 1s |
| Error rate | < 1% | > 5% |
| Double-booking incidents | 0 | Any |

---

**End of Audit Report**

Generated: August 2026  
Platform Version: Current Development Build  
Auditor: KHELO Development Team
