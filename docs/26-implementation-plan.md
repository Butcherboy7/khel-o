# KHEL-O — Master Implementation Plan

Version: 1.0
Last Updated: 2024
Status: Active

---

## How To Use This Document

This is the single source of truth for implementing the KHEL-O platform.

Every developer and every AI agent working on this project must:

1. Read this document before writing any code
2. Read the referenced docs before starting each phase
3. Complete phases in order — do not skip phases
4. Verify every acceptance criterion before marking a phase done
5. Never make architectural decisions that contradict the referenced docs

---

## Reference Documents (Read These First)

Before starting any phase, the following documents must be loaded as context:

| Document                        | Purpose                               |
| ------------------------------- | ------------------------------------- |
| docs/01-product-vision.md       | Why we exist, what we are building    |
| docs/06-domain-model.md         | All business entities and their rules |
| docs/07-state-machines.md       | All states and transitions            |
| docs/09-business-rules.md       | All business rules, numbered          |
| docs/10-database-design.md      | Database schema (use v0 for now)      |
| docs/11-api-style-guide.md      | API naming, format, conventions       |
| docs/13-backend-architecture.md | Folder structure, layering rules      |
| docs/21-coding-standards.md     | How code must be written              |
| docs/22-definition-of-done.md   | What done means for every feature     |
| docs/25-error-handling.md       | Exception hierarchy and error format  |

---

## Global Constraints

These apply to every phase without exception.

### Authentication

- Google OAuth 2.0 is the primary login method
- Email and password is the secondary login method
- No OTP anywhere
- No SMS anywhere
- Phone number is optional and never verified
- Email is required for every user

### Payments

- Razorpay is the only payment gateway
- No partial refunds in MVP
- Full refund if cancelled more than 2 hours before session
- No refund if cancelled less than 2 hours before session
- Pass Razorpay processing fee to customer transparently
- Platform takes zero cut in MVP
- No convenience fee in MVP

### Notifications

- Email via Resend only
- Push notifications via Web Push / FCM for PWA
- No SMS ever in MVP

### Architecture

- Modular monolith — not microservices
- FastAPI backend
- PostgreSQL database
- Next.js 14 App Router frontend
- Mobile-first PWA
- Alembic for all database migrations — never edit database manually

### Code Style

- snake_case for database columns and Python variables
- camelCase for all JSON API response fields
- PascalCase for Python classes and TypeScript components
- All endpoints must have proper error handling
- All services must be async
- Repository pattern must be followed — no raw queries in services
- No business logic in routers — routers only call services

### Rejected Features (Never Implement These)

- OTP login
- SMS notifications
- Exact PC seat reservations
- Real-time seat tracking
- Social networking features
- Clip sharing
- Player reputation system
- Partial refunds
- Walk-in bookings in MVP

---

## Phase Overview

```
Phase 0 — Architecture Completion
Phase 1 — Authentication
Phase 2 — Café Management (Owner)
Phase 3 — Café Discovery (Player)
Phase 4 — Booking Flow
Phase 5 — Payments (Razorpay)
Phase 6 — Promotions
Phase 7 — Owner Dashboard
Phase 8 — Reviews and Notifications
Phase 9 — Admin Panel
Phase 10 — PWA and Polish
```

Each phase builds on the previous one.
Do not start a phase until all acceptance criteria of the previous phase pass.

---

## Phase 0 — Architecture Completion

### Goal

Complete all missing structural files so the project compiles cleanly,
Swagger loads without errors, and the layered architecture is fully in place.
No business logic yet. Just the skeleton working end to end.

### Reference Docs

- docs/13-backend-architecture.md
- docs/21-coding-standards.md
- docs/11-api-style-guide.md

### What Already Exists (Do Not Break These)

- backend/app/main.py
- backend/app/config.py
- backend/app/database.py
- backend/app/core/exceptions.py
- backend/app/core/logging.py
- backend/app/core/security.py
- backend/app/models/ (all 7 model files)
- backend/app/repositories/base.py
- backend/migrations/versions/001_initial_schema.py
- docker-compose.yml
- .env

### Tasks

#### Backend — Schemas

Create `backend/app/schemas/__init__.py` (empty)

Create `backend/app/schemas/common.py`:

- PaginatedResponse generic class
- Standard API response envelope
  - success: bool
  - data: any
  - error: optional error object
  - meta: pagination info or timestamp

Create `backend/app/schemas/user.py`:

- UserBase (email, fullName, phoneNumber optional)
- UserCreateRequest (email, password, fullName)
- GoogleAuthRequest (idToken)
- UserUpdateRequest (fullName optional, phoneNumber optional, avatarUrl optional)
- UserResponse (id, email, fullName, phoneNumber, role, avatarUrl, isActive, createdAt)
- UserListResponse

Create `backend/app/schemas/cafe.py`:

- CafeBase (name, description, addressLine1, addressLine2, city, state,
  pincode, phoneNumber, email, openingTime, closingTime, totalSeats, amenities)
- CafeCreateRequest
- CafeUpdateRequest (all fields optional)
- CafeResponse (full café object including verificationStatus, isActive,
  averageRating, totalReviews, photos)
- CafeListResponse (id, name, city, verificationStatus, isActive,
  averageRating, photos first image only, hardware tiers summary)
- CafeSearchRequest (city, query, minPrice, maxPrice, amenities, page, limit)

Create `backend/app/schemas/hardware_tier.py`:

- HardwareTierBase (name, description, specs as dict, seatsInTier, pricePerHour)
- HardwareTierCreateRequest
- HardwareTierUpdateRequest (all optional)
- HardwareTierResponse (id, cafeId, name, description, specs, seatsInTier,
  pricePerHour, isActive, createdAt)

Create `backend/app/schemas/booking.py`:

- BookingCreateRequest (cafeId, hardwareTierId, sessionDate, startTime,
  durationHours, promotionId optional, notes optional)
- BookingResponse (all booking fields including bookingReference, status,
  baseAmount, discountAmount, gatewayFee, totalAmount, qrCodeUrl)
- BookingListResponse (summary version)
- BookingCancelRequest (reason optional)
- BookingStatusUpdate (status, reason optional) — for owner and admin

Create `backend/app/schemas/payment.py`:

- PaymentCreateResponse (razorpayOrderId, amount, currency, keyId)
  This is what we return to frontend to initiate Razorpay checkout
- PaymentVerifyRequest (razorpayOrderId, razorpayPaymentId, razorpaySignature)
- PaymentResponse (id, bookingId, status, amount, currency, createdAt)
- RefundResponse (refundId, amount, status, refundedAt)

Create `backend/app/schemas/promotion.py`:

- PromotionBase (title, description, discountPercentage, applicableTierId,
  validFrom, validUntil, daysOfWeek, startHour, endHour, maxUses)
- PromotionCreateRequest
- PromotionUpdateRequest (all optional)
- PromotionResponse (all fields including currentUses, isActive, cafeId)
- ActivePromotionResponse (what player sees — includes cafe name,
  tier name, discountPercentage, validUntil, slotsRemaining)

Create `backend/app/schemas/review.py`:

- ReviewCreateRequest (bookingId, rating 1-5, comment optional)
- ReviewResponse (id, cafeId, gamerId, rating, comment, createdAt,
  gamerName)
- ReviewListResponse

#### Backend — Repositories

All repositories must:

- Inherit from BaseRepository in base.py
- Use async SQLAlchemy sessions
- Accept db: AsyncSession as constructor argument
- Never contain business logic
- Only perform database operations

Create `backend/app/repositories/user_repository.py`:

- get_by_id(user_id)
- get_by_email(email)
- get_by_google_id(google_id)
- create(user_data)
- update(user_id, update_data)
- deactivate(user_id)

Create `backend/app/repositories/cafe_repository.py`:

- get_by_id(cafe_id)
- get_by_owner_id(owner_id)
- get_all_verified(filters, page, limit)
- search(query, city, filters, page, limit)
- create(cafe_data)
- update(cafe_id, update_data)
- update_verification_status(cafe_id, status)
- get_pending_verification(page, limit)

Create `backend/app/repositories/hardware_tier_repository.py`:

- get_by_id(tier_id)
- get_by_cafe_id(cafe_id)
- create(tier_data)
- update(tier_id, update_data)
- deactivate(tier_id)

Create `backend/app/repositories/booking_repository.py`:

- get_by_id(booking_id)
- get_by_reference(booking_reference)
- get_by_gamer_id(gamer_id, page, limit)
- get_by_cafe_id(cafe_id, page, limit, status_filter)
- create(booking_data)
- update_status(booking_id, status)
- update_qr_code(booking_id, qr_code_url)
- get_active_bookings_for_tier(tier_id, session_date, start_time, end_time)
  Used to check seat availability

Create `backend/app/repositories/payment_repository.py`:

- get_by_id(payment_id)
- get_by_booking_id(booking_id)
- get_by_razorpay_order_id(order_id)
- create(payment_data)
- update_status(payment_id, status, payment_id_razorpay, signature)
- mark_refunded(payment_id, refund_id)

Create `backend/app/repositories/promotion_repository.py`:

- get_by_id(promotion_id)
- get_by_cafe_id(cafe_id)
- get_active_for_cafe(cafe_id, current_datetime)
- get_active_for_tier(tier_id, current_datetime)
- create(promotion_data)
- update(promotion_id, update_data)
- increment_uses(promotion_id)
- deactivate(promotion_id)

Create `backend/app/repositories/review_repository.py`:

- get_by_id(review_id)
- get_by_cafe_id(cafe_id, page, limit)
- get_by_booking_id(booking_id)
- get_by_gamer_id(gamer_id)
- get_average_rating(cafe_id) returns float
- create(review_data)
- toggle_visibility(review_id, is_visible)

#### Backend — Services

All services must:

- Accept repository instances via dependency injection
- Contain all business logic
- Raise appropriate custom exceptions from core/exceptions.py
- Never directly import SQLAlchemy models in routers
- Be fully async

Create `backend/app/services/auth_service.py`:

Stub methods with proper signatures and docstrings:

- register_with_email(user_data: UserCreateRequest) -> UserResponse
- login_with_email(email, password) -> dict with access_token and refresh_token
- login_with_google(id_token: str) -> dict with access_token and refresh_token
  (verify Google ID token using Google's tokeninfo endpoint or google-auth library)
- refresh_access_token(refresh_token: str) -> dict with new access_token
- get_current_user(token: str) -> UserResponse

Create `backend/app/services/cafe_service.py`:

Stub methods:

- create_cafe(owner_id, cafe_data: CafeCreateRequest) -> CafeResponse
- get_cafe(cafe_id) -> CafeResponse
- update_cafe(cafe_id, owner_id, update_data: CafeUpdateRequest) -> CafeResponse
- list_cafes(filters: CafeSearchRequest) -> PaginatedResponse[CafeListResponse]
- search_cafes(query, city, filters) -> PaginatedResponse[CafeListResponse]
- verify_cafe(cafe_id, admin_id, status) -> CafeResponse
- add_hardware_tier(cafe_id, owner_id, tier_data) -> HardwareTierResponse
- update_hardware_tier(tier_id, owner_id, update_data) -> HardwareTierResponse
- get_cafe_tiers(cafe_id) -> list[HardwareTierResponse]

Create `backend/app/services/booking_service.py`:

Stub methods:

- create_booking(gamer_id, booking_data: BookingCreateRequest) -> BookingResponse
  Must validate: tier exists, cafe is verified, advance booking minimum 30 mins,
  calculate amounts, apply promotion if provided, set status to pending_payment
- get_booking(booking_id, requesting_user_id) -> BookingResponse
- get_gamer_bookings(gamer_id, page, limit) -> PaginatedResponse
- get_cafe_bookings(cafe_id, owner_id, page, limit, status) -> PaginatedResponse
- cancel_booking(booking_id, requesting_user_id, reason) -> BookingResponse
  Must enforce: 2 hour cancellation window for refund eligibility
- confirm_booking(booking_id) -> BookingResponse
  Called after successful payment
- complete_booking(booking_id, owner_id) -> BookingResponse
- generate_qr_code(booking_id) -> str (returns qr_code_url)

Create `backend/app/services/payment_service.py`:

Stub methods:

- create_razorpay_order(booking_id, gamer_id) -> PaymentCreateResponse
  Creates Razorpay order, creates Payment record with status created
- verify_payment(verify_data: PaymentVerifyRequest) -> PaymentResponse
  Validates Razorpay signature, updates payment status to captured,
  triggers booking confirmation
- handle_webhook(payload, signature) -> None
  Validates webhook signature, processes payment events
- process_refund(booking_id, admin_id) -> RefundResponse
  Only full refunds, only if cancellation within window

Create `backend/app/services/promotion_service.py`:

Stub methods:

- create_promotion(cafe_id, owner_id, promo_data) -> PromotionResponse
  Validate: discount max 50%, valid_until after valid_from,
  end_hour after start_hour
- get_active_promotions_for_cafe(cafe_id) -> list[ActivePromotionResponse]
- get_promotion(promotion_id) -> PromotionResponse
- update_promotion(promotion_id, owner_id, update_data) -> PromotionResponse
- deactivate_promotion(promotion_id, owner_id) -> None
- apply_promotion(promotion_id, booking_data) -> decimal (discount amount)
  Validates promotion is still active and within window

Create `backend/app/services/review_service.py`:

Stub methods:

- submit_review(gamer_id, review_data: ReviewCreateRequest) -> ReviewResponse
  Validate: booking belongs to gamer, booking is completed,
  no existing review for this booking
- get_cafe_reviews(cafe_id, page, limit) -> PaginatedResponse[ReviewResponse]
- get_cafe_average_rating(cafe_id) -> float

Create `backend/app/services/notification_service.py`:

Stub methods:

- send_booking_confirmation(booking_id) -> None
  Send email via Resend with booking details and QR code
- send_payment_failure(booking_id) -> None
- send_session_reminder(booking_id) -> None
  Send 30 minutes before session
- send_refund_confirmation(booking_id) -> None
- send_promotion_notification(promotion_id) -> None

#### Backend — API Routers

Create `backend/app/api/v1/auth.py`:

- POST /auth/register
- POST /auth/login
- POST /auth/google
- POST /auth/refresh
- GET /auth/me

Create `backend/app/api/v1/cafes.py`:

- GET /cafes (list with filters)
- GET /cafes/{cafe_id}
- POST /cafes (owner only)
- PATCH /cafes/{cafe_id} (owner only)
- GET /cafes/{cafe_id}/tiers
- POST /cafes/{cafe_id}/tiers (owner only)
- PATCH /cafes/{cafe_id}/tiers/{tier_id} (owner only)

Create `backend/app/api/v1/bookings.py`:

- POST /bookings
- GET /bookings (gamer's own bookings)
- GET /bookings/{booking_id}
- POST /bookings/{booking_id}/cancel
- GET /bookings/{booking_id}/qr

Create `backend/app/api/v1/payments.py`:

- POST /payments/create-order
- POST /payments/verify
- POST /payments/webhook (no auth, validate signature)

Create `backend/app/api/v1/promotions.py`:

- GET /promotions (active promotions near player)
- POST /promotions (owner only)
- GET /promotions/{promotion_id}
- PATCH /promotions/{promotion_id} (owner only)
- DELETE /promotions/{promotion_id} (owner only)

Create `backend/app/api/v1/reviews.py`:

- POST /reviews
- GET /cafes/{cafe_id}/reviews

Create `backend/app/api/v1/owner.py`:

- GET /owner/dashboard (summary stats)
- GET /owner/bookings (cafe bookings)
- PATCH /owner/bookings/{booking_id}/status

Create `backend/app/api/v1/admin.py`:

- GET /admin/cafes/pending
- PATCH /admin/cafes/{cafe_id}/verify
- GET /admin/users
- PATCH /admin/users/{user_id}/deactivate

Update `backend/app/api/v1/router.py`:
Include all above routers with correct prefixes and tags.

Update `backend/app/api/deps.py`:

- get_db (already exists, keep it)
- get_current_user (decode JWT, return user object)
- get_current_active_user (get_current_user + check is_active)
- require_gamer (get_current_active_user + check role is gamer)
- require_cafe_owner (get_current_active_user + check role is cafe_owner)
- require_admin (get_current_active_user + check role is admin)

#### Frontend — Foundation

Create `frontend/src/app/layout.tsx`:

- Root layout for Next.js App Router
- Dark theme (gaming aesthetic, not childish)
- Tailwind CSS
- Inter or similar clean font
- PWA meta tags (theme-color, apple-mobile-web-app-capable)
- Viewport meta for mobile
- Providers wrapper (auth provider, query client)

Create `frontend/src/app/page.tsx`:

- Home page — café discovery landing
- Hero section with KHEL-O branding and tagline
  "Find your next gaming session"
- Search bar with city input
- Placeholder café cards section (static for now, will be dynamic in Phase 3)
- Promotions highlight section with gamified feel
  (flash deal badge, countdown timer placeholder)
- Mobile-first layout
- Bottom navigation for mobile (Home, Search, Bookings, Profile)
- Clean dark theme with accent color (suggest: electric blue or neon green)

Create `frontend/src/app/(auth)/login/page.tsx`:

- Login page
- Google Sign In button (primary, prominent)
- Email/password form (secondary)
- Link to register
- Mobile-friendly design

Create `frontend/src/app/(auth)/register/page.tsx`:

- Register page
- Google Sign Up button (primary)
- Email, password, full name form (secondary)
- Mobile-friendly design

Create `frontend/src/components/shared/BottomNav.tsx`:

- Mobile bottom navigation bar
- Icons: Home, Search, Bookings, Profile
- Active state highlighting
- Fixed at bottom on mobile
- Hidden on desktop (desktop uses top nav)

Create `frontend/src/components/shared/Navbar.tsx`:

- Top navigation for desktop
- KHEL-O logo/name
- Login and Register buttons when not authenticated
- User menu when authenticated
- Hidden on mobile (mobile uses bottom nav)

#### Frontend — Dependencies

Ensure `frontend/package.json` includes:

- next (14+)
- react, react-dom
- typescript
- tailwindcss
- @tanstack/react-query (data fetching)
- zustand (global state)
- axios (API client)
- next-pwa (PWA support)
- lucide-react (icons)
- @radix-ui/react-* (accessible components)
- date-fns (date formatting)
- react-hook-form (form handling)
- zod (validation)

### Acceptance Criteria

All of the following must be true before Phase 0 is considered done:

- [ ] `docker-compose up --build` starts without any errors
- [ ] `GET http://localhost:8000/health` returns `{"status": "ok"}`
- [ ] `http://localhost:8000/docs` loads Swagger UI with all route groups visible
  (auth, cafes, bookings, payments, promotions, reviews, owner, admin)
- [ ] No Python import errors when backend starts
- [ ] All routers are registered and visible in Swagger even if endpoints
  return 501 Not Implemented for now
- [ ] `cd frontend && npm install` completes without errors
- [ ] `cd frontend && npm run dev` starts Next.js on port 3000
- [ ] `http://localhost:3000` shows the KHEL-O home page
- [ ] `http://localhost:3000/login` shows the login page
- [ ] No TypeScript errors on `npm run build`

---

## Phase 1 — Authentication

### Goal

A user can register and log in using Google OAuth or email and password.
JWT tokens are issued. Role-based access works.
Authenticated users can call `/auth/me` and get their profile.

### Reference Docs

- docs/15-authentication.md
- docs/06-domain-model.md (User entity)
- docs/07-state-machines.md (User states)
- docs/08-events.md (UserRegistered, UserLoggedIn)
- docs/09-business-rules.md (auth rules)

### Backend Tasks

#### auth_service.py — Implement fully

register_with_email:

- Check if email already exists → raise ConflictException
- Hash password using passlib bcrypt
- Create user with role gamer by default
- Return UserResponse

login_with_email:

- Find user by email → raise AuthException if not found
- Verify password hash → raise AuthException if wrong
- Check user is_active → raise ForbiddenException if not
- Generate access token (JWT, 15 min expiry)
- Generate refresh token (JWT, 30 day expiry)
- Return tokens + user

login_with_google:

- Receive Google ID token from frontend
- Verify token with Google API:
  GET https://oauth2.googleapis.com/tokeninfo?id_token={token}
- Extract email, name, google_id, avatar_url from response
- If user exists with this google_id: login and return tokens
- If user exists with this email but no google_id: link accounts, return tokens
- If new user: create account with role gamer, return tokens
- Never require a password for Google users

refresh_access_token:

- Decode refresh token
- Validate it has not expired
- Generate new access token
- Return new access token

get_current_user:

- Decode JWT access token
- Fetch user from database
- Raise AuthException if token invalid or expired
- Raise ForbiddenException if user is inactive
- Return user

#### auth.py router — Implement all 5 endpoints

POST /auth/register:

- Body: UserCreateRequest
- Returns: UserResponse + tokens
- Status: 201

POST /auth/login:

- Body: email, password
- Returns: access_token, refresh_token, user
- Status: 200

POST /auth/google:

- Body: idToken (from Google Sign In on frontend)
- Returns: access_token, refresh_token, user
- Status: 200

POST /auth/refresh:

- Body: refresh_token
- Returns: new access_token
- Status: 200

GET /auth/me:

- Requires: Bearer token in Authorization header
- Returns: UserResponse
- Status: 200

#### deps.py — Implement get_current_user dependency

```python
async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db)
) -> User:
```

Decode token, fetch user, return user model.
All protected routes will use this dependency.

### Frontend Tasks

#### Google OAuth Setup

In `frontend/src/lib/auth.ts`:

- Implement Google Sign In using Google Identity Services
  (load accounts.google.com/gsi/client script)
- On sign in success, receive credential (ID token)
- POST to /auth/google with the ID token
- Store access_token and refresh_token in httpOnly cookie
  or localStorage (localStorage is acceptable for MVP)
- Redirect to home after login

#### Auth Store

In `frontend/src/store/authStore.ts`:

- user: UserResponse | null
- accessToken: string | null
- isAuthenticated: boolean
- login(tokens, user): void
- logout(): void
- setUser(user): void

#### API Client

In `frontend/src/lib/api.ts`:

- Axios instance with base URL from env
- Request interceptor: attach Authorization header if token exists
- Response interceptor: if 401, attempt token refresh, retry request
  if refresh fails, clear auth state and redirect to login

#### Login Page — Wire Up

Connect `frontend/src/app/(auth)/login/page.tsx` to:

- Google auth flow
- Email/password form → POST /auth/login
- On success: store tokens, redirect to home
- On failure: show error message clearly

#### Register Page — Wire Up

Connect `frontend/src/app/(auth)/register/page.tsx` to:

- Google auth flow (same as login, creates account if new)
- Email/password/name form → POST /auth/register
- On success: redirect to home
- On failure: show validation errors

### Acceptance Criteria

- [ ] POST /auth/register with valid email/password creates user and returns tokens
- [ ] POST /auth/register with duplicate email returns 409 with clear error message
- [ ] POST /auth/login with correct credentials returns tokens
- [ ] POST /auth/login with wrong password returns 401
- [ ] POST /auth/google with valid Google ID token creates or logs in user
- [ ] GET /auth/me with valid token returns user profile
- [ ] GET /auth/me with expired token returns 401
- [ ] GET /auth/me with no token returns 401
- [ ] Frontend: Google Sign In button opens Google popup and completes login
- [ ] Frontend: After login, user name appears in navbar
- [ ] Frontend: Logout clears tokens and redirects to home
- [ ] Frontend: Protected routes redirect to login if not authenticated
- [ ] Passwords are never stored in plaintext (verified by checking DB)
- [ ] Google users have null password_hash in database

---

## Phase 2 — Café Management

### Goal

A café owner can create and manage their café profile and hardware tiers.
Admin can verify or reject a café.
Only verified cafés appear in player discovery.

### Reference Docs

- docs/06-domain-model.md (Café, HardwareTier entities)
- docs/07-state-machines.md (Café verification state machine)
- docs/08-events.md (CaféCreated, CaféVerified, CaféRejected)
- docs/09-business-rules.md (café rules)

### Backend Tasks

#### cafe_service.py — Implement fully

create_cafe:

- Only cafe_owner role can create
- One owner can have multiple cafés (for multi-location support)
- Set verification_status to pending on creation
- Return CafeResponse

update_cafe:

- Owner can only update their own café
- Cannot update verification_status through this method
- Raise ForbiddenException if owner_id does not match

verify_cafe (admin only):

- Status can be: verified, rejected, suspended
- When verified: café becomes discoverable by players
- When rejected: owner should be notified (email)
- When suspended: café hidden from discovery

add_hardware_tier:

- Owner can add tiers to their own café only
- Must have at least one active tier to be bookable
- Validate: pricePerHour must be greater than 0
- Validate: seatsInTier must be greater than 0

update_hardware_tier:

- Owner can only update tiers belonging to their café
- Cannot delete a tier if it has confirmed future bookings
  (deactivate instead)

#### cafes.py router — Implement all endpoints

Owner endpoints:

- POST /cafes — create café
- PATCH /cafes/{cafe_id} — update café
- POST /cafes/{cafe_id}/tiers — add tier
- PATCH /cafes/{cafe_id}/tiers/{tier_id} — update tier

Admin endpoints:

- GET /admin/cafes/pending — list pending verification
- PATCH /admin/cafes/{cafe_id}/verify — verify or reject

#### Migration

Create Alembic migration if any schema changes are needed.
Do not edit 001_initial_schema.py.
Create 002_add_indexes.py with:

- Index on cafes.city
- Index on cafes.verification_status
- Index on cafes.owner_id
- Index on hardware_tiers.cafe_id

### Frontend Tasks

#### Owner Dashboard Foundation

Create `frontend/src/app/owner/layout.tsx`:

- Sidebar navigation for desktop
- Bottom navigation for mobile (adapted for owner context)
- Check user role is cafe_owner, redirect if not
- Links: Dashboard, My Café, Hardware Tiers, Bookings, Promotions

Create `frontend/src/app/owner/page.tsx`:

- Welcome message
- Quick stats placeholders (total bookings, revenue — static for now)
- Call to action if no café exists yet: "Set up your café profile"

Create `frontend/src/app/owner/cafe/page.tsx`:

- Form to create/edit café profile
- Fields: name, description, address, city, state, pincode,
  phone, email, opening time, closing time, total seats
- Amenities checklist: WiFi, AC, Food, Parking, etc.
- Photo upload (upload to cloud storage, store URL)
- On submit: POST /cafes or PATCH /cafes/{id}
- Show verification status badge

Create `frontend/src/app/owner/tiers/page.tsx`:

- List existing hardware tiers
- Form to add new tier
- Fields: name, description, GPU, CPU, RAM, monitor Hz,
  monitor size, seats in tier, price per hour
- Toggle tier active/inactive

### Acceptance Criteria

- [ ] POST /cafes with cafe_owner token creates café with pending status
- [ ] POST /cafes with gamer token returns 403
- [ ] PATCH /cafes/{cafe_id} by non-owner returns 403
- [ ] POST /cafes/{cafe_id}/tiers creates hardware tier
- [ ] GET /admin/cafes/pending returns list of unverified cafés (admin only)
- [ ] PATCH /admin/cafes/{cafe_id}/verify with status verified changes status
- [ ] Verified café is_active = true
- [ ] Frontend: Owner can fill and submit café profile form
- [ ] Frontend: Owner can add hardware tiers
- [ ] Frontend: Verification status is visible on owner dashboard

---

## Phase 3 — Café Discovery

### Goal

A player can browse, search, and filter gaming cafés.
A player can view a café profile with hardware tiers, photos, amenities, and reviews.
Only verified and active cafés appear in discovery.

### Reference Docs

- docs/05-user-flows.md (café discovery flow)
- docs/06-domain-model.md (Café entity)
- docs/09-business-rules.md (discovery rules)

### Backend Tasks

#### cafe_service.py — Implement discovery methods

list_cafes:

- Filter by: city (required or use geolocation), isActive, verificationStatus=verified
- Sort by: rating desc, distance (if lat/lng provided)
- Paginate: default 20 per page
- Return: CafeListResponse (lightweight, for cards)

search_cafes:

- Full text search on café name and description
- Filter by: city, minPrice, maxPrice, amenities list
- Return: CafeListResponse paginated

get_cafe:

- Return full CafeResponse including:
  - All hardware tiers
  - Active promotions
  - Average rating
  - Recent reviews (last 5)
  - Photos

#### cafe_repository.py — Implement search

Use PostgreSQL ILIKE for text search.
Filter by verification_status = verified AND is_active = true always.

### Frontend Tasks

Create `frontend/src/app/cafes/page.tsx`:

- Search bar at top (search by name or city)
- Filter panel: price range, amenities, hardware tier type
- Grid of CafeCard components
- Infinite scroll or pagination
- Loading skeleton
- Empty state: "No cafés found in your area yet"
- Map toggle (placeholder for now, implement in Phase 10)

Create `frontend/src/components/cafe/CafeCard.tsx`:

- Café photo (first photo or placeholder)
- Café name, city
- Average rating with stars
- Price starting from (lowest tier price)
- Active promotion badge if any (🔥 Flash Deal)
- Hardware tier tags (Standard, Premium, PS5)
- Click navigates to café detail page

Create `frontend/src/app/cafes/[id]/page.tsx`:

- Hero image or photo gallery
- Café name, address, rating
- Opening hours
- Amenities icons (WiFi, AC, Food, Parking)
- Hardware tiers section:
  Each tier as a card showing:
  - Tier name
  - Specs (GPU, CPU, RAM, monitor)
  - Price per hour
  - Active promotion on this tier if any (gamified badge)
  - Book Now button
- Reviews section (rating breakdown + recent reviews)
- Map placeholder showing location

Create `frontend/src/components/cafe/HardwareTierCard.tsx`:

- Tier name and specs
- Price display
- Promotion badge if active:
  Show original price crossed out, discounted price
  Show countdown timer if promotion ends soon
  Show "X slots left" if below threshold (use maxUses - currentUses)
- Book Now CTA

### Acceptance Criteria

- [ ] GET /cafes returns only verified and active cafés
- [ ] GET /cafes?city=Bengaluru filters by city correctly
- [ ] GET /cafes?query=esports searches name and description
- [ ] GET /cafes/{cafe_id} returns full café with tiers and reviews
- [ ] Unverified café does not appear in GET /cafes
- [ ] Frontend: Home page search navigates to /cafes with query
- [ ] Frontend: Café cards display correctly on mobile (375px width)
- [ ] Frontend: Café detail page shows all tiers with prices
- [ ] Frontend: Active promotion shows discounted price and countdown
- [ ] Frontend: Book Now button is visible on each tier

---

## Phase 4 — Booking Flow

### Goal

A player can select a hardware tier, date, time, and duration, and create a booking.
The booking starts in pending_payment status.
A QR code is generated after payment confirmation.
Cancellation enforces the 2-hour rule.

### Reference Docs

- docs/07-state-machines.md (Booking state machine)
- docs/08-events.md (BookingCreated, BookingConfirmed, BookingCancelled)
- docs/09-business-rules.md (booking rules)
- docs/06-domain-model.md (Booking entity)

### Backend Tasks

#### booking_service.py — Implement fully

create_booking:

- Validate café is verified and active
- Validate hardware tier belongs to café and is active
- Validate session_date is not in the past
- Validate start_time is at least 30 minutes from now
- Validate duration_hours is between 0.5 and 8
- Calculate end_time from start_time + duration_hours
- Check availability:
  Query active bookings for this tier on this date and time range
  If confirmed bookings >= seatsInTier → raise BookingException
  "No seats available for this tier at the selected time"
- Apply promotion if promotion_id provided:
  Validate promotion is active and within time window
  Validate promotion applies to this tier or all tiers
  Validate promotion has remaining uses
  Calculate discount_amount
- Calculate amounts:
  base_amount = price_per_hour × duration_hours
  discount_amount = base_amount × (discount_percentage / 100) if promotion
  subtotal = base_amount - discount_amount
  gateway_fee = subtotal × 0.02 (2% Razorpay fee, round to 2 decimal places)
  total_amount = subtotal + gateway_fee
- Generate booking_reference: "GC-" + year + "-" + 6 random alphanumeric chars
  Example: GC-2024-X7K9P2
- Create booking with status pending_payment
- Return BookingResponse

cancel_booking:

- Validate booking belongs to requesting user OR user is admin
- Validate booking is in confirmed or pending_payment status
- Check cancellation time:
  If session is more than 2 hours away: eligible for refund
  If session is less than 2 hours away: no refund
- Update booking status to cancelled
- Set cancelled_at and cancellation_reason
- If refund eligible: trigger payment_service.process_refund
- Return BookingResponse with cancellation details

generate_qr_code:

- Called as background task after booking is confirmed
- Generate QR code containing JSON:
  {bookingId, bookingReference, cafeId, sessionDate, startTime, tier}
- Save as PNG image
- Upload to storage (for MVP, save to local static files or S3)
- Update booking.qr_code_url in database

#### bookings.py router — Implement all endpoints

POST /bookings:

- Requires gamer authentication
- Body: BookingCreateRequest
- Returns: BookingResponse with payment instructions
- Status: 201

GET /bookings:

- Requires authentication
- Returns gamer's own booking history paginated
- Filter by status optional

GET /bookings/{booking_id}:

- Requires authentication
- Gamer can see own bookings, owner can see café bookings, admin sees all
- Returns: BookingResponse

POST /bookings/{booking_id}/cancel:

- Requires authentication
- Body: BookingCancelRequest (reason optional)
- Returns: BookingResponse with updated status

GET /bookings/{booking_id}/qr:

- Requires authentication (gamer who owns booking or café owner)
- Returns: QR code image URL or redirect to image

### Frontend Tasks

Create `frontend/src/app/bookings/new/page.tsx`:

- Booking form stepper (mobile-friendly, full screen steps):

  Step 1: Select date

  - Date picker, minimum today + 30 minutes

  Step 2: Select time and duration

  - Start time picker
  - Duration selector (1h, 1.5h, 2h, 3h, 4h, custom)
  - Show end time calculated automatically

  Step 3: Review and confirm

  - Show selected café name, tier, date, time
  - Show price breakdown:
    Base amount
    Discount (if promotion applied) ← show savings clearly
    Payment processing fee (₹X) with tooltip
    Total payable
  - Proceed to payment button

Create `frontend/src/app/bookings/page.tsx`:

- List of player's bookings
- Tabs: Upcoming, Past, Cancelled
- BookingCard for each booking showing:
  Café name, tier, date, time, status badge, amount

Create `frontend/src/app/bookings/[id]/page.tsx`:

- Full booking detail
- Status badge (color coded)
- Café details
- Session details (date, time, tier)
- Price breakdown
- QR code (large, scannable display after confirmation)
- Cancel button (only if cancellable)
- Refund eligibility message

Create `frontend/src/components/booking/BookingQR.tsx`:

- Display QR code image prominently
- "Show this at the café" instruction text
- Download QR code button
- Share button (Web Share API on mobile)

### Acceptance Criteria

- [ ] POST /bookings creates booking with pending_payment status
- [ ] POST /bookings with start_time less than 30 mins from now returns 400
- [ ] POST /bookings when tier is fully booked returns 400 with clear message
- [ ] POST /bookings with valid promotion applies discount correctly
- [ ] POST /bookings calculates gateway_fee as 2% of subtotal
- [ ] POST /bookings/{id}/cancel within window updates status to cancelled
- [ ] GET /bookings returns only authenticated user's bookings
- [ ] GET /bookings/{id} by non-owner returns 403
- [ ] QR code is generated after booking confirmed (test with mock confirmation)
- [ ] Frontend: Full booking flow works on mobile
- [ ] Frontend: Price breakdown shows all components including gateway fee
- [ ] Frontend: QR code displays on booking detail page

---

## Phase 5 — Payments (Razorpay)

### Goal

Player pays for booking using Razorpay.
On payment success, booking status moves to confirmed.
On payment failure, booking remains in pending_payment with retry option.
Webhooks handle async payment events.

### Reference Docs

- docs/16-payments.md
- docs/07-state-machines.md (Payment state machine)
- docs/08-events.md (PaymentCaptured, PaymentFailed, RefundProcessed)

### Backend Tasks

#### payment_service.py — Implement fully

create_razorpay_order:

- Validate booking exists and is in pending_payment status
- Validate requesting user owns the booking
- Create Razorpay order via Razorpay SDK:
  amount in paise (multiply rupees by 100)
  currency: INR
  receipt: booking_reference
- Create Payment record in database with status created
- Return PaymentCreateResponse:
  razorpayOrderId, amount (in rupees), currency, keyId (public key)

verify_payment:

- Receive: razorpayOrderId, razorpayPaymentId, razorpaySignature
- Validate signature using HMAC-SHA256:
  message = razorpayOrderId + "|" + razorpayPaymentId
  expected_signature = HMAC-SHA256(RAZORPAY_KEY_SECRET, message)
  compare with received signature
- If signature invalid: raise PaymentException INVALID_SIGNATURE
- If valid: update payment status to captured
- Trigger confirm_booking (updates booking to confirmed)
- Trigger generate_qr_code as background task
- Trigger send_booking_confirmation email as background task
- Return PaymentResponse

handle_webhook:

- Validate Razorpay webhook signature using webhook secret
- Handle events:
  payment.captured: same as verify_payment flow
  payment.failed: update payment status to failed, log reason
  refund.processed: update payment with refund_id, set status refunded
- Always return 200 to Razorpay even if processing fails
  (return 200 but log the error — Razorpay retries on non-200)

process_refund:

- Only called when cancellation is within refund window
- Initiate refund via Razorpay SDK using razorpay_payment_id
- Full refund only
- Update payment status to refunded
- Update booking status to cancelled
- Send refund confirmation email

#### payments.py router — Implement all endpoints

POST /payments/create-order:

- Requires gamer authentication
- Body: { bookingId }
- Returns: PaymentCreateResponse
- Status: 200

POST /payments/verify:

- Requires gamer authentication
- Body: PaymentVerifyRequest
- Returns: PaymentResponse
- Status: 200

POST /payments/webhook:

- No authentication
- Validate Razorpay-Signature header
- Body: Razorpay webhook payload
- Returns: 200 always
- Status: 200

### Frontend Tasks

#### Razorpay Integration

In `frontend/src/lib/razorpay.ts`:

- Load Razorpay checkout script dynamically
- Function initiatePayment(orderData, bookingId):
  Opens Razorpay checkout modal
  On success: POST /payments/verify with the response data
  On failure: show retry button, do not redirect

Update `frontend/src/app/bookings/new/page.tsx`:

- After booking created (POST /bookings), call POST /payments/create-order
- Open Razorpay checkout with the order data
- On Razorpay success callback: call POST /payments/verify
- On verification success: redirect to /bookings/{id} (shows QR)
- On payment failure: show error with retry button
- Show "Do not close this page" message during payment

#### Payment States on Frontend

Show different UI based on booking status:

- pending_payment: Show "Complete Payment" button
- confirmed: Show QR code and session details
- cancelled: Show cancellation reason and refund status

### Acceptance Criteria

- [ ] POST /payments/create-order creates Razorpay order and payment record
- [ ] POST /payments/verify with valid signature confirms booking
- [ ] POST /payments/verify with invalid signature returns 400
- [ ] POST /payments/webhook handles payment.captured event
- [ ] POST /payments/webhook handles payment.failed event
- [ ] POST /payments/webhook always returns 200
- [ ] Booking status changes to confirmed after successful payment
- [ ] QR code is generated after payment confirmation
- [ ] Booking confirmation email is sent after payment
- [ ] Frontend: Razorpay checkout opens correctly
- [ ] Frontend: Success redirects to booking detail with QR
- [ ] Frontend: Failure shows retry button
- [ ] Test with Razorpay test mode keys

---

## Phase 6 — Promotions

### Goal

Café owners can create off-peak promotions with a discount up to 50%.
Promotions are displayed to players with gamified styling.
Discounts are automatically applied when players book within promotion window.

### Reference Docs

- docs/07-state-machines.md (Promotion state machine)
- docs/08-events.md (PromotionCreated, PromotionExpired)
- docs/09-business-rules.md (promotion rules)

### Backend Tasks

#### promotion_service.py — Implement fully

create_promotion:

- Owner can only create promotions for their own café
- Validate discount_percentage is between 1 and 50
- Validate valid_until is after valid_from
- Validate end_hour is after start_hour
- Validate days_of_week contains valid values (0-6)
- If applicable_tier_id provided: validate tier belongs to this café
- Set is_active to true immediately (no admin approval needed)

get_active_promotions_for_cafe:

- Return promotions where:
  is_active = true
  valid_from <= now <= valid_until
  current day of week is in days_of_week
  current hour is between start_hour and end_hour
  current_uses < max_uses (or max_uses is null)

apply_promotion:

- Called during booking creation
- Validate promotion is still active at booking time
- Validate promotion applies to the requested tier
- Validate uses not exceeded
- Return discount amount

#### Background Task — Promotion Expiry

Create a background task that runs every hour:

- Find promotions where valid_until < now and is_active = true
- Set is_active = false
- Log the expiry

### Frontend Tasks

#### Promotion Display

Update `frontend/src/components/cafe/HardwareTierCard.tsx`:

- If active promotion on this tier:
  Show original price with strikethrough
  Show discounted price in accent color (bold)
  Show discount badge: "🔥 30% OFF"
  Show countdown timer to promotion end
  Show slots remaining if max_uses set and running low

Create `frontend/src/components/cafe/PromotionBadge.tsx`:

- Gamified badge component
- Variants: flash-deal, off-peak, happy-hour
- Animated pulse effect for urgency
- Shows discount percentage prominently

Update `frontend/src/app/page.tsx` (home page):

- Active Promotions section
- Horizontally scrollable cards on mobile
- Each card shows:
  Café name
  "⚡ 30% off Premium until 5PM"
  Countdown timer
  Book Now CTA

#### Owner Promotion Management

Create `frontend/src/app/owner/promotions/page.tsx`:

- List of current and past promotions
- Create promotion form:
  Title
  Description
  Discount percentage (slider, max 50)
  Applicable tier (dropdown or all tiers)
  Valid from / valid until (date-time pickers)
  Days of week (checkboxes: Mon-Sun)
  Start hour / end hour (time range picker)
  Max uses (optional)
- Toggle promotion active/inactive
- Show current uses vs max uses progress bar

### Acceptance Criteria

- [ ] POST /promotions creates promotion with is_active = true immediately
- [ ] POST /promotions with discount > 50 returns 400
- [ ] POST /promotions with valid_until before valid_from returns 400
- [ ] GET /cafes/{id} shows active promotions on relevant tiers
- [ ] Booking with valid promotion_id applies discount correctly
- [ ] Booking with expired promotion returns 400
- [ ] Booking with exhausted promotion (uses >= max_uses) returns 400
- [ ] Frontend: Promotion badge displays on tier card
- [ ] Frontend: Countdown timer shows correct time remaining
- [ ] Frontend: Owner can create, view, and toggle promotions

---

## Phase 7 — Owner Dashboard

### Goal

Café owners can see their bookings, manage sessions, and view basic analytics.
Owner can mark sessions as started (by scanning QR) and completed.

### Reference Docs

- docs/07-state-machines.md (Booking state machine)
- docs/06-domain-model.md (Booking, Session)

### Backend Tasks

#### owner.py — Implement fully

GET /owner/dashboard:

- Total bookings this month
- Revenue this month (sum of total_amount for confirmed+completed bookings)
- Upcoming bookings today (count)
- Occupancy rate this week:
  (confirmed booking hours / total possible hours) × 100
- Most popular tier this month

GET /owner/bookings:

- List all bookings for owner's café
- Filter by: status, date, tier
- Sort by: session_date desc
- Include gamer name (first name only for privacy)
- Paginated

PATCH /owner/bookings/{booking_id}/status:

- Owner can update booking status:
  confirmed → completed (after session ends)
  confirmed → no_show (if player does not arrive)
- Cannot revert confirmed to pending
- Cannot cancel on behalf of gamer (gamer must cancel)

### Frontend Tasks

Update `frontend/src/app/owner/page.tsx`:

- Dashboard with real data from GET /owner/dashboard
- Stats cards:
  Bookings this month (number)
  Revenue this month (₹ amount)
  Today's sessions (number)
  Occupancy rate (percentage)
- Today's upcoming sessions list
- Quick action buttons: View All Bookings, Create Promotion

Create `frontend/src/app/owner/bookings/page.tsx`:

- Table/list of all café bookings
- Columns: Reference, Gamer (first name), Tier, Date/Time, Status, Amount
- Status filter tabs: All, Upcoming, Completed, Cancelled, No Show
- Each booking row:
  Click to expand details
  Mark as Completed button (if confirmed and session time has passed)
  Mark as No Show button (if confirmed and session time has passed)
- Mobile: card layout instead of table

### Acceptance Criteria

- [ ] GET /owner/dashboard returns correct aggregated stats
- [ ] GET /owner/bookings returns only bookings for owner's café
- [ ] GET /owner/bookings by wrong owner returns 403
- [ ] PATCH /owner/bookings/{id}/status can mark confirmed as completed
- [ ] PATCH /owner/bookings/{id}/status cannot mark completed back to confirmed
- [ ] Frontend: Dashboard stats load and display correctly
- [ ] Frontend: Owner can view and filter their bookings
- [ ] Frontend: Owner can mark booking as completed or no-show

---

## Phase 8 — Reviews and Notifications

### Goal

Players can submit one review per completed booking.
Email notifications are sent for key events.
Push notifications (Web Push) alert players before sessions.

### Reference Docs

- docs/17-notifications.md
- docs/08-events.md (ReviewSubmitted, SessionReminder)

### Backend Tasks

#### review_service.py — Implement fully

submit_review:

- Validate booking belongs to requesting gamer
- Validate booking status is completed
- Validate no existing review for this booking (one per booking)
- Validate rating is between 1 and 5
- Create review
- Update café average_rating in cafes table (or compute dynamically)

#### notification_service.py — Implement with Resend

send_booking_confirmation:

- To: gamer email
- Subject: "Your gaming session is confirmed! 🎮"
- Content: booking reference, café name, date, time, tier, total paid
- Include QR code as embedded image or link

send_payment_failure:

- To: gamer email
- Subject: "Payment unsuccessful — retry your booking"
- Content: booking reference, retry link

send_session_reminder:

- To: gamer email
- Subject: "Your session starts in 30 minutes! 🎮"
- Content: café address, tier, start time, link to QR code

send_refund_confirmation:

- To: gamer email
- Subject: "Refund processed for your booking"
- Content: booking reference, refund amount

#### Background Job — Session Reminders

Create a background job that runs every 15 minutes:

- Find confirmed bookings starting in 30 to 45 minutes
- Send reminder email and web push notification
- Mark reminder_sent = true to prevent duplicate emails

### Frontend Tasks

Create `frontend/src/components/review/ReviewForm.tsx`:

- Star rating selector (1-5 stars)
- Comment textarea (optional)
- Submit review button
- Show on booking detail page ONLY if status is completed and not reviewed

Update `frontend/src/app/cafes/[id]/page.tsx`:

- Show review summary: average rating, total count, star breakdown
- List of reviews: gamer name, rating stars, comment, date

#### Web Push Notifications

In `frontend/src/lib/push.ts`:

- Request notification permission from player
- Subscribe to Web Push service
- Send subscription object to backend POST /users/push-subscription

### Acceptance Criteria

- [ ] POST /reviews creates review only for completed bookings
- [ ] POST /reviews for non-completed booking returns 400
- [ ] POST /reviews duplicate for same booking returns 409
- [ ] GET /cafes/{id}/reviews returns paginated reviews
- [ ] Booking confirmation email is sent via Resend API
- [ ] Session reminder email is sent 30 minutes before session
- [ ] Frontend: Review form appears only on completed bookings
- [ ] Frontend: Review appears on café detail page after submission

---

## Phase 9 — Admin Panel

### Goal

Platform admin can manage users, verify cafés, view platform metrics, and handle manual refunds if needed.

### Reference Docs

- docs/06-domain-model.md (Admin actions)
- docs/09-business-rules.md (admin rules)

### Backend Tasks

#### admin.py — Implement fully

GET /admin/stats:

- Total registered users (gamers, owners)
- Total cafés (verified, pending, rejected)
- Total bookings (all time, this month)
- Total GMV (Gross Merchandise Value)
- Platform status overview

GET /admin/cafes:

- Filter by: verification_status, city
- Search by: café name, owner email
- Paginated

PATCH /admin/cafes/{cafe_id}/verify:

- Body: { status: "verified" | "rejected" | "suspended", reason: string optional }
- Update verification_status
- Send notification email to owner

GET /admin/users:

- Search by email, name, role
- Paginated

PATCH /admin/users/{user_id}/deactivate:

- Deactivate user account
- Cancel any pending/confirmed bookings for this user

### Frontend Tasks

Create `frontend/src/app/admin/layout.tsx`:

- Admin sidebar: Overview, Cafés, Users, Bookings, System
- Protect route: require role = admin

Create `frontend/src/app/admin/page.tsx`:

- Platform metrics overview dashboard
- Pending café verification queue alert banner
- Quick action links

Create `frontend/src/app/admin/cafes/page.tsx`:

- List of cafés with verification status filters
- Pending verification section:
  Show café name, owner details, address, photos, tiers
  Approve button (one click verify)
  Reject button (with reason modal)

Create `frontend/src/app/admin/users/page.tsx`:

- User management table
- Search and filter by role
- Deactivate user toggle

### Acceptance Criteria

- [ ] All /admin endpoints require admin role (non-admin gets 403)
- [ ] Admin can approve pending café → café becomes verified immediately
- [ ] Admin can reject pending café with reason → owner notified
- [ ] Admin can deactivate user → user cannot log in
- [ ] Frontend: Admin dashboard displays platform metrics
- [ ] Frontend: Admin can verify cafés with one click

---

## Phase 10 — PWA and Polish

### Goal

Make KHEL-O fully installable as a PWA on mobile devices.
Ensure fast load times, offline fallback page, and smooth animations.
Complete end-to-end testing of the entire user journey.

### Reference Docs

- docs/14-frontend-architecture.md
- docs/22-definition-of-done.md

### Frontend Tasks

#### PWA Configuration

Create `frontend/public/manifest.json`:

- name: "KHEL-O — Gaming Café Marketplace"
- short_name: "KHEL-O"
- start_url: "/"
- display: "standalone"
- background_color: "#09090b"
- theme_color: "#7c3aed"
- icons: 192x192, 512x512, maskable icon

Configure `next-pwa` in `frontend/next.config.js`:

- Enable PWA in production mode
- Cache static assets, Google fonts, images
- Offline fallback page (`frontend/src/app/offline/page.tsx`)

Create `frontend/src/app/offline/page.tsx`:

- Friendly offline message: "You are currently offline"
- "Check your connection and try again" button
- Cached bookings visible offline if possible

#### Performance Optimization

- Image optimization: use Next.js `<Image>` component for all photos
- Dynamic imports for heavy components (maps, charts)
- Font optimization: load Google Fonts via `next/font`
- Target Lighthouse performance score > 85 on mobile

#### Mobile Install Prompt

Create `frontend/src/components/shared/InstallPWA.tsx`:

- Detect `beforeinstallprompt` browser event
- Show subtle banner: "Add KHEL-O to Home Screen for faster access"
- Install button triggers browser install prompt
- Dismissible, saved in localStorage (don't show again for 7 days if dismissed)

#### End-to-End User Journey Polish

Test and polish the full journey on mobile view (375px width):

1. Open app → Home page loads in under 2 seconds
2. Search "Pune" → See GG Zone and FragHouse cards
3. Click GG Zone → View hardware tiers and active 30% off deal
4. Click Book Now on RTX 3060 tier → Booking form opens
5. Select date, 2 hours → Price breakdown shows base ₹240 - discount ₹72 + fee ₹3.36 = ₹171.36
6. Confirm booking → Razorpay opens in test mode
7. Complete test payment → Redirected to booking detail page
8. View QR code → QR code displays cleanly
9. Check email → Confirmation email received with QR code
10. Owner view → Log in as owner → See the new booking under Today's Sessions
11. Owner marks session as Completed → Status updates to completed
12. Player view → Go to booking detail → Leave 5-star review
13. Café detail page → See the new review listed

### Acceptance Criteria

- [ ] PWA manifest is valid (verified via Chrome DevTools Audit)
- [ ] App is installable on Android (Chrome) and iOS (Safari Add to Home Screen)
- [ ] Offline fallback page displays when network is disconnected
- [ ] Mobile bottom navigation operates smoothly with active state indicators
- [ ] No layout shift (CLS < 0.1) on page load
- [ ] Full user journey (Discovery → Booking → Payment → QR → Review) completes end-to-end without errors
- [ ] All 10 phases pass all acceptance criteria
- [ ] Definition of Done (docs/22-definition-of-done.md) is met for the entire codebase

---

## Document Sign-Off

This implementation plan is complete and locked.
All code written for KHEL-O must conform to the phases and acceptance criteria defined above.

```

```
