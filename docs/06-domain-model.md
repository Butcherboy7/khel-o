# Domain Model — KHEL-O

## Overview

This document defines every business entity in the KHEL-O system. For each entity, it provides: a description, a complete attribute list, relationships to other entities, and business rules that govern the entity's behavior.

This is the **source of truth** for database design (`10-database-design.md`) and API design (`12-api-spec.md`). Any conflict between this document and others should be resolved in favor of this document.

---

## Entity: User

### Description
The base entity representing any authenticated person in the system. Every Gamer, CaféOwner, and Admin is a User first. The User entity holds shared attributes like phone number, email, and authentication state.

### Attributes

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| id | UUID | Yes | Primary identifier. Auto-generated. |
| phone_number | String(15) | Yes | Indian mobile number with country code (+91XXXXXXXXXX). Unique. |
| email | String(255) | No | Email address. Used for receipts and optional communication. |
| name | String(100) | Yes | Display name. |
| profile_photo_url | String(500) | No | URL to the profile photo in cloud storage. |
| city | String(100) | Yes | User's city. Selected from a predefined list. |
| role | Enum | Yes | One of: `gamer`, `cafe_owner`, `admin`. |
| status | Enum | Yes | One of: `active`, `suspended`, `banned`, `deleted`. Default: `active`. |
| created_at | Timestamp | Yes | Account creation time (UTC). |
| updated_at | Timestamp | Yes | Last profile update time (UTC). |
| last_login_at | Timestamp | No | Last successful login time (UTC). |
| is_phone_verified | Boolean | Yes | Whether the phone number has been verified via OTP. Default: `false`. |
| is_email_verified | Boolean | Yes | Whether the email has been verified. Default: `false`. |

### Relationships
- A User with role `gamer` has a one-to-one relationship with **Gamer** (extended gamer profile).
- A User with role `cafe_owner` has a one-to-one relationship with **CaféOwner** (extended owner profile).
- A User has many **Notifications**.

### Business Rules
- BR-USER-001: A phone number must be unique across all users.
- BR-USER-002: A phone number cannot be registered under two different roles simultaneously unless explicitly permitted by an admin.
- BR-USER-003: A suspended user cannot log in or make bookings.
- BR-USER-004: A deleted user's PII is anonymized within 30 days. Bookings and payments are retained with anonymized references.
- BR-USER-005: OTP-based authentication is the primary login method for Gamer and CaféOwner roles.
- BR-USER-006: Admin users authenticate via email + password + MFA.

---

## Entity: Gamer

### Description
Extended profile for users with the `gamer` role. Contains gamer-specific preferences and metadata.

### Attributes

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| id | UUID | Yes | Same as the associated User ID. |
| user_id | UUID | Yes | Foreign key to User. |
| preferred_tier | String(50) | No | Preferred hardware tier name (e.g., "Premium"). |
| total_bookings | Integer | Yes | Lifetime count of completed bookings. Default: 0. |
| total_spent | Integer | Yes | Lifetime total amount spent (in paisa). Default: 0. |
| referral_code | String(10) | No | Unique referral code for the gamer (generated on registration). |
| referred_by | UUID | No | ID of the gamer who referred this user. |

### Relationships
- Belongs to one **User**.
- Has many **Bookings**.
- Has many **Reviews**.

### Business Rules
- BR-GAMER-001: `total_bookings` and `total_spent` are updated asynchronously after each completed booking.
- BR-GAMER-002: `referral_code` is auto-generated and unique.

---

## Entity: CaféOwner

### Description
Extended profile for users with the `cafe_owner` role. Contains business-related information required for verification and compliance.

### Attributes

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| id | UUID | Yes | Same as the associated User ID. |
| user_id | UUID | Yes | Foreign key to User. |
| business_name | String(200) | Yes | Registered business name. |
| pan_number | String(10) | Yes | PAN number for business verification. Encrypted at rest. |
| gst_number | String(15) | No | GST registration number. |
| business_address | String(500) | Yes | Full business address. |
| is_verified | Boolean | Yes | Whether the business documents have been verified by admin. Default: `false`. |
| verified_at | Timestamp | No | When verification was completed. |

### Relationships
- Belongs to one **User**.
- Has many **Cafés** (one in MVP, multiple in future multi-location support).

### Business Rules
- BR-OWNER-001: A CaféOwner must provide PAN for verification.
- BR-OWNER-002: GST number is optional but recommended for invoicing.
- BR-OWNER-003: An unverified CaféOwner can create a café profile but it will not be visible to gamers until the café is verified.

---

## Entity: Café

### Description
A gaming café listed on the platform. Contains location, operating details, media, and amenities. This is the central entity of the marketplace supply side.

### Attributes

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| id | UUID | Yes | Primary identifier. Auto-generated. |
| owner_id | UUID | Yes | Foreign key to CaféOwner. |
| name | String(200) | Yes | Café display name. |
| description | Text | No | About the café (max 2000 characters). |
| address | String(500) | Yes | Full street address. |
| city | String(100) | Yes | City name. |
| area | String(100) | Yes | Area/locality name. |
| latitude | Decimal(10,7) | Yes | GPS latitude. |
| longitude | Decimal(10,7) | Yes | GPS longitude. |
| phone_number | String(15) | Yes | Café contact number. |
| photos | JSON (Array of URLs) | No | Up to 10 photo URLs. First is cover image. |
| amenities | JSON (Array of Strings) | No | List of amenity tags (e.g., ["ac", "parking", "food"]). |
| operating_hours | JSON | Yes | Day-of-week schedule. Example: `{"monday": {"open": "10:00", "close": "00:00"}, ...}` |
| status | Enum | Yes | One of: `draft`, `pending_verification`, `info_requested`, `verified`, `rejected`, `suspended`, `temporarily_closed`. Default: `draft`. |
| verification_notes | Text | No | Admin notes from verification process. |
| average_rating | Decimal(3,2) | Yes | Average review rating (1.00–5.00). Default: 0.00. |
| total_reviews | Integer | Yes | Count of reviews. Default: 0. |
| is_active | Boolean | Yes | Whether the café accepts bookings. Default: `true`. |
| created_at | Timestamp | Yes | Profile creation time (UTC). |
| updated_at | Timestamp | Yes | Last update time (UTC). |

### Relationships
- Belongs to one **CaféOwner**.
- Has many **HardwareTiers**.
- Has many **Bookings** (through HardwareTiers).
- Has many **Promotions**.
- Has many **Reviews**.

### Business Rules
- BR-CAFE-001: Only cafés with status `verified` are visible to gamers.
- BR-CAFE-002: A café must have at least one active hardware tier to accept bookings.
- BR-CAFE-003: `average_rating` is recalculated when a new review is submitted. Formula: sum of all ratings / total_reviews.
- BR-CAFE-004: Photos are stored in cloud storage. URLs are stored in the database.
- BR-CAFE-005: Operating hours must cover at least one day of the week.
- BR-CAFE-006: A `temporarily_closed` café retains its profile but does not accept bookings.
- BR-CAFE-007: A `suspended` café is not visible to gamers and cannot accept bookings. Only an admin can suspend or unsuspend a café.

---

## Entity: HardwareTier

### Description
A category of gaming hardware at a café. Represents a class of machines (not specific PCs) that share similar specs. Gamers book a tier, not a machine.

### Attributes

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| id | UUID | Yes | Primary identifier. Auto-generated. |
| cafe_id | UUID | Yes | Foreign key to Café. |
| name | String(100) | Yes | Tier name (e.g., "Standard", "Premium", "PS5", "VIP"). |
| description | Text | No | Description of the tier experience. |
| gpu_model | String(100) | Yes | GPU model (e.g., "NVIDIA RTX 3060"). |
| cpu_model | String(100) | No | CPU model (e.g., "Intel i5-12400F"). |
| ram_gb | Integer | No | RAM in GB (e.g., 16, 32). |
| monitor_size | String(20) | No | Monitor size (e.g., "24 inch"). |
| monitor_refresh_rate | Integer | No | Monitor refresh rate in Hz (e.g., 144, 240). |
| monitor_resolution | String(20) | No | Monitor resolution (e.g., "1920x1080"). |
| quantity | Integer | Yes | Number of machines available in this tier. |
| price_per_hour | Integer | Yes | Price per hour in paisa. |
| is_active | Boolean | Yes | Whether this tier is available for booking. Default: `true`. |
| created_at | Timestamp | Yes | Creation time (UTC). |
| updated_at | Timestamp | Yes | Last update time (UTC). |

### Relationships
- Belongs to one **Café**.
- Has many **Bookings**.
- Has many **Promotions** (a promotion targets a specific tier).

### Business Rules
- BR-HW-001: `quantity` represents the total number of machines in this tier. Availability for a time slot = quantity − confirmed bookings in that slot.
- BR-HW-002: Deactivating a tier (is_active = false) prevents new bookings but does not affect existing confirmed bookings.
- BR-HW-003: `price_per_hour` is stored in paisa (integer) to avoid floating-point errors.
- BR-HW-004: A café must have at least one active tier.

---

## Entity: Booking

### Description
A reservation made by a gamer for a specific hardware tier at a specific café for a specific date and time window.

### Attributes

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| id | UUID | Yes | Primary identifier. Auto-generated. |
| gamer_id | UUID | Yes | Foreign key to User (with gamer role). |
| cafe_id | UUID | Yes | Foreign key to Café. |
| hardware_tier_id | UUID | Yes | Foreign key to HardwareTier. |
| promotion_id | UUID | No | Foreign key to Promotion (if a promotion was applied). |
| booking_date | Date | Yes | The date of the session. |
| start_time | Time | Yes | Session start time. |
| end_time | Time | Yes | Session end time (calculated: start_time + duration). |
| duration_hours | Integer | Yes | Duration in hours (1–6). |
| status | Enum | Yes | One of: `payment_pending`, `confirmed`, `checked_in`, `completed`, `cancelled`, `no_show`, `expired`. Default: `payment_pending`. |
| confirmation_code | String(8) | No | Alphanumeric booking code. Generated on confirmation. |
| qr_code_url | String(500) | No | URL to the generated QR code image. |
| base_amount | Integer | Yes | Base price before discounts and fees (in paisa). |
| discount_amount | Integer | Yes | Promotion discount amount (in paisa). Default: 0. |
| convenience_fee | Integer | Yes | Platform convenience fee (in paisa). |
| gst_amount | Integer | Yes | GST on convenience fee (in paisa). |
| total_amount | Integer | Yes | Final amount charged (in paisa). = base_amount − discount_amount + convenience_fee + gst_amount. |
| cancellation_reason | Text | No | Reason for cancellation (if applicable). |
| cancelled_at | Timestamp | No | When the booking was cancelled. |
| checked_in_at | Timestamp | No | When the gamer checked in. |
| created_at | Timestamp | Yes | Booking creation time (UTC). |
| updated_at | Timestamp | Yes | Last update time (UTC). |

### Relationships
- Belongs to one **User** (Gamer).
- Belongs to one **Café**.
- Belongs to one **HardwareTier**.
- Optionally belongs to one **Promotion**.
- Has one **Payment**.
- Has one **Session** (created on check-in).
- Has one **Review** (optional, after completion).

### Business Rules
- BR-BOOK-001: A booking must be made at least 30 minutes before the session start time.
- BR-BOOK-002: A booking cannot be made more than 7 days in advance.
- BR-BOOK-003: The session time must fall within the café's operating hours.
- BR-BOOK-004: The system must check tier availability before confirming a booking. Availability = tier.quantity − count of confirmed/checked_in bookings overlapping the requested time window.
- BR-BOOK-005: `confirmation_code` is generated only when booking transitions to `confirmed` state (after payment).
- BR-BOOK-006: A gamer can have a maximum of 3 active (confirmed) bookings at any time.
- BR-BOOK-007: `total_amount = base_amount − discount_amount + convenience_fee + gst_amount`. All amounts in paisa.
- BR-BOOK-008: A booking in `payment_pending` state that does not receive payment within 30 minutes is automatically expired.

---

## Entity: Payment

### Description
A financial transaction associated with a booking. Records the payment gateway details, amount breakdown, and refund information.

### Attributes

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| id | UUID | Yes | Primary identifier. Auto-generated. |
| booking_id | UUID | Yes | Foreign key to Booking. Unique (one payment per booking). |
| razorpay_order_id | String(50) | Yes | Razorpay order ID. |
| razorpay_payment_id | String(50) | No | Razorpay payment ID (populated on success). |
| razorpay_signature | String(200) | No | Razorpay webhook signature (for verification). |
| amount | Integer | Yes | Total amount charged (in paisa). |
| currency | String(3) | Yes | Currency code. Always "INR". |
| convenience_fee | Integer | Yes | Convenience fee component (in paisa). |
| gst_amount | Integer | Yes | GST on convenience fee (in paisa). |
| discount_amount | Integer | Yes | Discount applied (in paisa). |
| status | Enum | Yes | One of: `created`, `authorized`, `captured`, `failed`, `refund_initiated`, `refunded`, `partially_refunded`. Default: `created`. |
| payment_method | String(50) | No | Method used: `upi`, `card`, `net_banking`, `wallet`. |
| refund_amount | Integer | No | Refund amount (in paisa). Default: 0. |
| refund_id | String(50) | No | Razorpay refund ID. |
| refund_status | Enum | No | One of: `pending`, `processed`, `failed`. |
| refund_reason | String(200) | No | Reason for refund. |
| idempotency_key | String(100) | Yes | Unique key to prevent duplicate payment processing. |
| created_at | Timestamp | Yes | Payment record creation time (UTC). |
| updated_at | Timestamp | Yes | Last update time (UTC). |

### Relationships
- Belongs to one **Booking**.

### Business Rules
- BR-PAY-001: Each booking has exactly one payment record.
- BR-PAY-002: The payment record is created when the booking is initiated (status: `created`).
- BR-PAY-003: Payment verification must match Razorpay webhook signature.
- BR-PAY-004: Refunds are processed through Razorpay API. Full refund for cancellations >2 hours before session. 50% refund for 1–2 hours before. No refund for <1 hour.
- BR-PAY-005: `idempotency_key` prevents duplicate charges if a webhook is received multiple times.
- BR-PAY-006: All monetary values are stored in paisa (integer).
- BR-PAY-007: GST at 18% is calculated on the convenience fee only, not on the base amount.

---

## Entity: Promotion

### Description
A time-bound discount offer created by a café owner for a specific hardware tier during specific hours. Promotions are the core demand-generation mechanism of the platform.

### Attributes

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| id | UUID | Yes | Primary identifier. Auto-generated. |
| cafe_id | UUID | Yes | Foreign key to Café. |
| hardware_tier_id | UUID | Yes | Foreign key to HardwareTier. |
| title | String(100) | Yes | Promotion title. |
| description | Text | No | Detailed description (max 500 characters). |
| discount_percentage | Integer | Yes | Discount as a whole number (5–50). |
| start_date | Date | Yes | Promotion start date. |
| end_date | Date | Yes | Promotion end date. |
| applicable_days | JSON (Array) | Yes | Days of the week (e.g., ["monday", "tuesday", "wednesday"]). |
| time_window_start | Time | Yes | Daily start time for the promotion. |
| time_window_end | Time | Yes | Daily end time for the promotion. |
| status | Enum | Yes | One of: `draft`, `active`, `paused`, `ended`, `expired`. Default: `draft`. |
| total_bookings_generated | Integer | Yes | Count of bookings that used this promotion. Default: 0. |
| total_revenue_generated | Integer | Yes | Revenue from bookings that used this promotion (in paisa). Default: 0. |
| created_at | Timestamp | Yes | Creation time (UTC). |
| updated_at | Timestamp | Yes | Last update time (UTC). |

### Relationships
- Belongs to one **Café**.
- Belongs to one **HardwareTier**.
- Has many **Bookings** (bookings that applied this promotion).

### Business Rules
- BR-PROMO-001: Maximum discount percentage is 50% (configurable by admin).
- BR-PROMO-002: A promotion cannot overlap with another active promotion for the same tier and the same time window on the same days.
- BR-PROMO-003: A promotion can run for a maximum of 30 days.
- BR-PROMO-004: Promotions automatically expire on the end date (status → `expired`).
- BR-PROMO-005: Only promotions with status `active` apply discounts to bookings.
- BR-PROMO-006: `total_bookings_generated` and `total_revenue_generated` are updated asynchronously when a booking using this promotion is completed.

---

## Entity: Review

### Description
A rating and optional text review submitted by a gamer for a café after completing a booking.

### Attributes

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| id | UUID | Yes | Primary identifier. Auto-generated. |
| booking_id | UUID | Yes | Foreign key to Booking. Unique (one review per booking). |
| gamer_id | UUID | Yes | Foreign key to User (gamer). |
| cafe_id | UUID | Yes | Foreign key to Café. |
| rating | Integer | Yes | Star rating (1–5). |
| comment | Text | No | Review text (max 500 characters). |
| status | Enum | Yes | One of: `published`, `flagged`, `removed`. Default: `published`. |
| flagged_reason | Text | No | Reason the review was flagged (by owner or admin). |
| created_at | Timestamp | Yes | Review submission time (UTC). |
| updated_at | Timestamp | Yes | Last update time (UTC). |

### Relationships
- Belongs to one **Booking**.
- Belongs to one **User** (Gamer).
- Belongs to one **Café**.

### Business Rules
- BR-REV-001: Only one review per booking.
- BR-REV-002: A review can only be submitted for a booking with status `completed`.
- BR-REV-003: A gamer can edit their review within 24 hours of submission.
- BR-REV-004: A flagged review is not visible to gamers but remains in the system for admin review.
- BR-REV-005: Removing a review recalculates the café's average rating.
- BR-REV-006: `rating` must be between 1 and 5 (inclusive).

---

## Entity: Notification

### Description
A notification sent to a user via one or more channels (SMS, email, push, in-app).

### Attributes

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| id | UUID | Yes | Primary identifier. Auto-generated. |
| user_id | UUID | Yes | Foreign key to User. |
| type | Enum | Yes | Notification type: `booking_confirmed`, `booking_cancelled`, `payment_failed`, `session_reminder`, `promotion_published`, `cafe_verified`, `review_received`, `refund_processed`, `no_show`, `welcome`. |
| channel | Enum | Yes | Delivery channel: `sms`, `email`, `push`, `in_app`. |
| title | String(200) | No | Notification title (for push and in-app). |
| body | Text | Yes | Notification content. |
| metadata | JSON | No | Additional data (e.g., booking_id, cafe_id, promotion_id). |
| status | Enum | Yes | One of: `pending`, `sent`, `delivered`, `failed`. Default: `pending`. |
| sent_at | Timestamp | No | When the notification was sent. |
| read_at | Timestamp | No | When the user read the in-app notification. |
| created_at | Timestamp | Yes | Creation time (UTC). |

### Relationships
- Belongs to one **User**.

### Business Rules
- BR-NOTIF-001: Notifications are created by event consumers, not directly by API handlers.
- BR-NOTIF-002: SMS and email notifications are sent asynchronously via background tasks.
- BR-NOTIF-003: Failed notifications are retried up to 3 times with exponential backoff.
- BR-NOTIF-004: In-app notifications are stored and displayed until read by the user.

---

## Entity: Session

### Description
An active gaming session at a café. Created when a booking is checked in. Represents the actual time the gamer spends at the café.

### Attributes

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| id | UUID | Yes | Primary identifier. Auto-generated. |
| booking_id | UUID | Yes | Foreign key to Booking. Unique. |
| cafe_id | UUID | Yes | Foreign key to Café. |
| gamer_id | UUID | Yes | Foreign key to User (gamer). |
| hardware_tier_id | UUID | Yes | Foreign key to HardwareTier. |
| assigned_machine | String(50) | No | Identifier of the assigned machine (e.g., "PC-07"). Free-text, entered by owner. |
| start_time | Timestamp | Yes | Actual session start time (UTC). |
| expected_end_time | Timestamp | Yes | Expected session end time (UTC). Based on booking duration. |
| actual_end_time | Timestamp | No | Actual session end time (UTC). Populated when session ends. |
| status | Enum | Yes | One of: `active`, `completed`, `terminated`. Default: `active`. |
| created_at | Timestamp | Yes | Creation time (UTC). |
| updated_at | Timestamp | Yes | Last update time (UTC). |

### Relationships
- Belongs to one **Booking**.
- Belongs to one **Café**.
- Belongs to one **User** (Gamer).
- Belongs to one **HardwareTier**.

### Business Rules
- BR-SESS-001: A session is created only when a booking is checked in.
- BR-SESS-002: If the gamer doesn't check out, the session auto-completes at `expected_end_time`.
- BR-SESS-003: `terminated` status is used if a session is ended prematurely by admin or system (e.g., safety issue).
- BR-SESS-004: `assigned_machine` is optional and for owner's internal tracking only.

---

## Entity: AdminUser

### Description
An internal platform administrator. Admin users have elevated privileges for platform management.

### Attributes

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| id | UUID | Yes | Primary identifier. Auto-generated. |
| user_id | UUID | Yes | Foreign key to User. |
| email | String(255) | Yes | Admin email. Used for login. Unique. |
| password_hash | String(255) | Yes | Bcrypt hash of the admin password. |
| mfa_enabled | Boolean | Yes | Whether MFA is enabled. Default: `true`. |
| mfa_secret | String(100) | No | TOTP secret for MFA. Encrypted at rest. |
| permissions | JSON (Array) | Yes | List of permission strings (e.g., ["manage_cafes", "manage_users", "manage_bookings", "manage_promotions", "view_analytics"]). |
| last_login_at | Timestamp | No | Last login time. |
| created_at | Timestamp | Yes | Account creation time (UTC). |
| updated_at | Timestamp | Yes | Last update time (UTC). |

### Relationships
- Belongs to one **User**.
- Has many **AuditLog** entries (actions performed).

### Business Rules
- BR-ADMIN-001: Admin accounts are created internally, not via public registration.
- BR-ADMIN-002: MFA is mandatory for all admin accounts.
- BR-ADMIN-003: All admin actions are logged in the audit log.
- BR-ADMIN-004: Admins cannot modify their own permissions.

---

## Entity Relationship Summary

```
User (1) ──── (0..1) Gamer
User (1) ──── (0..1) CaféOwner
User (1) ──── (0..1) AdminUser
User (1) ──── (0..*) Notification

CaféOwner (1) ──── (1..*) Café

Café (1) ──── (1..*) HardwareTier
Café (1) ──── (0..*) Promotion
Café (1) ──── (0..*) Review
Café (1) ──── (0..*) Booking
Café (1) ──── (0..*) Session

HardwareTier (1) ──── (0..*) Booking
HardwareTier (1) ──── (0..*) Promotion

Gamer (1) ──── (0..*) Booking
Gamer (1) ──── (0..*) Review

Booking (1) ──── (1) Payment
Booking (1) ──── (0..1) Session
Booking (1) ──── (0..1) Review
Booking (0..*) ──── (0..1) Promotion
```

---

## Glossary

| Term | Definition |
|------|-----------|
| Paisa | Smallest unit of Indian currency. 1 INR = 100 paisa. All monetary values are stored in paisa as integers. |
| Hardware Tier | A category of gaming machines at a café, grouped by specs (GPU, CPU, monitor). |
| Booking | A reservation for a future gaming session at a specific tier. |
| Session | The actual gaming session that happens when a gamer checks in. |
| Promotion | A time-bound discount offer for a specific hardware tier. |
| Convenience Fee | The fee charged by KHEL-O to the gamer on each booking. This is KHEL-O's revenue. |
| GST | Goods and Services Tax. 18% GST is applicable on the convenience fee. |
