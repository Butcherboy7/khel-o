# Business Rules — KHEL-O

## Overview

This document defines every explicit business rule in the KHEL-O system. Business rules are the constraints, policies, and calculations that govern how the platform operates. Each rule is numbered for easy reference in code, tests, and discussions.

Rules are organized by domain and are referenced by the domain model (`06-domain-model.md`), state machines (`07-state-machines.md`), and API spec (`12-api-spec.md`).

---

## 1. Booking Rules

### BR-BOOK-001: Minimum Advance Booking Time
A booking must be made at least **30 minutes** before the session start time. Bookings for a session starting in less than 30 minutes are rejected.

**Rationale:** Gives the café owner time to prepare and reduces last-minute no-shows.

### BR-BOOK-002: Maximum Advance Booking Window
A booking cannot be made more than **7 days** in advance.

**Rationale:** Prevents over-reservation and keeps inventory fresh.

### BR-BOOK-003: Operating Hours Constraint
The booked session (start time to end time) must fall entirely within the café's operating hours for the selected day. Bookings that extend beyond closing time are rejected.

### BR-BOOK-004: Duration Limits
Bookings must have a duration of **1, 2, 3, 4, 5, or 6 hours** (whole hours only). Fractional-hour bookings are not supported in MVP.

### BR-BOOK-005: Tier Availability Check
Before confirming a booking, the system must verify that the hardware tier has available capacity. Available capacity for a time slot is calculated as:

```
availability = tier.quantity - count(bookings WHERE
    hardware_tier_id = tier.id AND
    status IN ('confirmed', 'checked_in') AND
    time_window_overlaps(booking.start_time, booking.end_time, requested_start, requested_end)
)
```

If `availability <= 0`, the booking is rejected.

### BR-BOOK-006: Maximum Active Bookings Per Gamer
A gamer can have a maximum of **3** bookings in `confirmed` state at any time. This prevents abuse and hoarding of slots.

### BR-BOOK-007: Payment Timeout
A booking in `payment_pending` state that does not receive successful payment within **30 minutes** is automatically expired by a background job.

### BR-BOOK-008: No Overlapping Bookings Per Gamer
A gamer cannot have two confirmed bookings that overlap in time (even at different cafés). The system must check for time conflicts before confirming.

### BR-BOOK-009: Confirmation Code Format
Booking confirmation codes are **8-character alphanumeric** strings (uppercase letters and digits, excluding ambiguous characters: 0, O, I, 1, L). Generated upon payment confirmation.

### BR-BOOK-010: No Booking on Closed Days
The system must prevent bookings on days when the café is closed per its operating hours schedule.

---

## 2. Cancellation and Refund Rules

### BR-CANCEL-001: Cancellation Window — Full Refund
If a gamer cancels a `confirmed` booking **more than 2 hours** before the session start time, they receive a **full refund** of the total amount paid.

### BR-CANCEL-002: Cancellation Window — Partial Refund
If a gamer cancels a `confirmed` booking **between 1 and 2 hours** before the session start time, they receive a **50% refund** of the total amount paid.

### BR-CANCEL-003: Cancellation Window — No Refund
If a gamer cancels a `confirmed` booking **less than 1 hour** before the session start time, **no refund** is issued.

### BR-CANCEL-004: No Cancellation After Check-In
A booking that has been checked in (`checked_in` status) cannot be cancelled. The gamer has already started using the service.

### BR-CANCEL-005: No Refund for No-Show
If a gamer is marked as a no-show, **no refund** is processed regardless of timing.

### BR-CANCEL-006: Refund Timeline
Refunds are processed through Razorpay. Expected timeline:
- UPI: 1–3 business days.
- Cards: 5–7 business days.
- Net Banking: 5–7 business days.
- Wallets: 1–3 business days.

The platform displays: "Refund will be processed within 5–7 business days."

### BR-CANCEL-007: Owner Cancellation (Café Suspension)
If an admin suspends a café, all future `confirmed` bookings at that café are automatically cancelled with **full refunds**, regardless of timing.

### BR-CANCEL-008: Convenience Fee Refund
On full refund, the convenience fee and GST are also refunded. On partial refund, the convenience fee is proportionally refunded.

---

## 3. Promotion Rules

### BR-PROMO-001: Maximum Discount
The maximum discount percentage for a promotion is **50%**. This limit is configurable by admin.

### BR-PROMO-002: Minimum Discount
The minimum discount percentage for a promotion is **5%**. A 0% discount is not a promotion.

### BR-PROMO-003: Maximum Duration
A promotion can run for a maximum of **30 days** (end_date - start_date ≤ 30 days).

### BR-PROMO-004: No Overlapping Promotions
Two active promotions for the **same hardware tier** at the **same café** cannot have overlapping time windows on the same days. The system must validate this before allowing a promotion to be published.

Overlap check:
```
overlap_exists = any promotion WHERE
    cafe_id = new_promo.cafe_id AND
    hardware_tier_id = new_promo.hardware_tier_id AND
    status = 'active' AND
    date_range_overlaps(promo.start_date, promo.end_date, new.start_date, new.end_date) AND
    days_overlap(promo.applicable_days, new.applicable_days) AND
    time_window_overlaps(promo.time_window_start, promo.time_window_end, new.time_window_start, new.time_window_end)
```

### BR-PROMO-005: Promotion Start Date
A promotion's start date must be **today or in the future**. Backdated promotions are not allowed.

### BR-PROMO-006: Automatic Discount Application
When a gamer makes a booking that falls within an active promotion's time window, date range, applicable days, and hardware tier, the discount is **automatically applied**. The gamer does not need to enter a promo code.

### BR-PROMO-007: Only Active Promotions Apply
Only promotions with status `active` apply discounts. Promotions that are `draft`, `paused`, `ended`, or `expired` do not apply.

### BR-PROMO-008: Discount Calculation
The discount amount is calculated as:
```
discount_amount = floor(base_amount × discount_percentage / 100)
```
The discount is applied before convenience fee and GST calculation.

### BR-PROMO-009: Auto-Expiry
Promotions automatically transition to `expired` status when the end date passes. A background job checks for expired promotions every 15 minutes.

### BR-PROMO-010: Verified Cafés Only
Only verified cafés (status `verified`) can have active promotions. If a café is suspended, all its active promotions are paused.

---

## 4. Hardware Tier Rules

### BR-HW-001: Minimum Tiers
A café must have at least **one active hardware tier** to accept bookings.

### BR-HW-002: Tier Quantity
The `quantity` field represents the total number of machines in the tier, not available machines. Availability is computed at booking time by subtracting confirmed bookings.

### BR-HW-003: Tier Deactivation
When a tier is deactivated (`is_active = false`):
- No new bookings can be made for this tier.
- Existing confirmed bookings for this tier remain valid.
- The tier is hidden from the café profile page.

### BR-HW-004: Price Validation
`price_per_hour` must be a positive integer (in paisa). Minimum price: ₹20/hour (2000 paisa). Maximum price: ₹1000/hour (100000 paisa).

### BR-HW-005: Tier Name Uniqueness
Hardware tier names must be unique within a café. Two tiers at the same café cannot share the same name.

---

## 5. Pricing Rules

### BR-PRICE-001: Amount Calculation
```
base_amount = price_per_hour × duration_hours
discount_amount = floor(base_amount × discount_percentage / 100)  [if promotion applies]
net_amount = base_amount - discount_amount
convenience_fee = calculate_convenience_fee(net_amount)
gst_amount = floor(convenience_fee × 18 / 100)
total_amount = net_amount + convenience_fee + gst_amount
```

### BR-PRICE-002: Convenience Fee Structure
The convenience fee is a **platform fee** charged to the gamer. The fee structure is configurable:
- **Option A (percentage):** X% of the net amount (after discount). Default: 5%.
- **Option B (flat):** Flat ₹Y per booking. Default: ₹15.
- The system should support either model. The default for MVP is **percentage-based (5%)**.

### BR-PRICE-003: GST on Convenience Fee
GST at **18%** is applied on the convenience fee only. GST is not applied on the base gaming session amount (the café owner handles their own GST).

### BR-PRICE-004: All Amounts in Paisa
All monetary values throughout the system are stored as **integers in paisa** (1 INR = 100 paisa). This avoids floating-point arithmetic errors.

### BR-PRICE-005: Display in INR
All amounts are displayed to users in INR (₹) with two decimal places. Conversion: `display_amount = paisa_amount / 100`.

### BR-PRICE-006: Transparency
The booking summary must clearly show:
- Base amount
- Discount (if applicable, with promotion name)
- Convenience fee
- GST
- Total amount

No hidden charges.

---

## 6. Payment Rules

### BR-PAY-001: Online Payment Only
All bookings require **online payment** in MVP. Walk-in bookings without advance payment are not supported.

### BR-PAY-002: Supported Payment Methods
The platform supports all methods offered by Razorpay for Indian payments:
- UPI (primary, most common)
- Debit Cards
- Credit Cards
- Net Banking
- Wallets (Paytm, PhonePe, etc.)

### BR-PAY-003: Currency
All transactions are in **INR** (Indian Rupees).

### BR-PAY-004: Idempotency
Payment processing must be idempotent. The system uses an `idempotency_key` (derived from `booking_id`) to ensure:
- Processing the same Razorpay webhook twice does not create duplicate payment records.
- Processing the same webhook twice does not double-confirm a booking.

### BR-PAY-005: Webhook Verification
All Razorpay webhooks must be verified using the webhook secret signature before processing. Unsigned or incorrectly signed webhooks are rejected and logged.

### BR-PAY-006: Payment Retry
A gamer can retry payment up to **3 times** for a single booking. After 3 failed attempts, the booking is automatically cancelled.

### BR-PAY-007: Payment Record Immutability
Once a payment record is created, the `amount`, `convenience_fee`, `gst_amount`, and `discount_amount` fields are never modified. Corrections are handled via refund records.

---

## 7. Review Rules

### BR-REV-001: One Review Per Booking
A gamer can submit only **one review per booking**. The booking must be in `completed` status.

### BR-REV-002: Rating Range
Ratings must be integers between **1 and 5** (inclusive).

### BR-REV-003: Comment Length
Review comments are optional and limited to **500 characters**.

### BR-REV-004: Edit Window
A gamer can edit their review within **24 hours** of submission. After 24 hours, the review is locked.

### BR-REV-005: Average Rating Calculation
```
cafe.average_rating = SUM(all published review ratings for this café) / COUNT(all published reviews)
```
Recalculated when a review is submitted, edited, or removed.

### BR-REV-006: Flagged Review Visibility
A flagged review (status: `flagged`) is hidden from public view but retained in the database for admin moderation.

### BR-REV-007: No Self-Reviews
A café owner cannot submit reviews for their own café. The system must prevent this by checking the reviewer's user ID against the café's owner ID.

---

## 8. User and Account Rules

### BR-USER-001: Phone Number Uniqueness
A phone number can be registered under only one user account.

### BR-USER-002: OTP Rate Limiting
A phone number can request a maximum of **5 OTPs per hour**. After 5 attempts, the number is temporarily blocked from receiving OTPs for **1 hour**.

### BR-USER-003: OTP Validity
An OTP is valid for **5 minutes** from the time it is generated. Expired OTPs are rejected.

### BR-USER-004: OTP Attempt Limit
A user gets a maximum of **5 attempts** to enter the correct OTP. After 5 failed attempts, the phone number is locked for **15 minutes**.

### BR-USER-005: Account Suspension
A suspended user:
- Cannot log in.
- Cannot make bookings.
- Active bookings remain but new ones are blocked.
- Can only be unsuspended by an admin.

### BR-USER-006: Account Deletion
When a user requests account deletion:
- Account is soft-deleted immediately (status → `deleted`).
- PII (name, phone, email, PAN) is anonymized within **30 days**.
- Booking and payment records are retained with anonymized user references for financial compliance.

### BR-USER-007: Role Restriction
In MVP, a phone number cannot be both a Gamer and a CaféOwner. The user must choose one role at registration time.

---

## 9. Café Verification Rules

### BR-VERIFY-001: Verification Required
A café must be verified by an admin before it becomes visible to gamers. Unverified cafés cannot accept bookings.

### BR-VERIFY-002: Verification SLA
The platform targets a verification turnaround of **24–48 hours** from submission.

### BR-VERIFY-003: Resubmission
A rejected café can be updated and resubmitted for verification. There is no limit on the number of resubmissions.

### BR-VERIFY-004: PAN Verification
The owner's PAN number is required during registration. In MVP, PAN is stored and manually verified. Automated PAN verification may be added later.

### BR-VERIFY-005: Photo Requirements
A café must have at least **1 photo** to submit for verification. Up to **10 photos** are allowed. Photos must show the actual gaming setup.

---

## 10. Session Rules

### BR-SESS-001: Session Creation
A session is created only when a booking transitions from `confirmed` to `checked_in`.

### BR-SESS-002: Auto-Completion
A session automatically transitions to `completed` when the `expected_end_time` is reached. A background job checks every 5 minutes.

### BR-SESS-003: Early Departure
If a gamer leaves before the session end time:
- The owner manually ends the session.
- No partial refund is issued for early departure in MVP.
- The actual_end_time is recorded for analytics.

### BR-SESS-004: No-Show Window
A gamer is considered a no-show if they do not check in within **15 minutes** of the session start time.

---

## 11. India-Specific Compliance Rules

### BR-INDIA-001: GST on Service Fees
GST at **18%** is applicable on the convenience fee charged by KHEL-O. This falls under "Information Technology Enabled Services (ITES)" or "Intermediary Services" under GST law.

### BR-INDIA-002: GST Display
GST amount must be clearly displayed as a separate line item in the booking summary and payment receipt.

### BR-INDIA-003: Payment Gateway Compliance
All payment processing must comply with RBI guidelines:
- Two-factor authentication (2FA) for card payments (handled by Razorpay).
- No storage of full card numbers on KHEL-O servers.
- PCI-DSS compliance is handled by Razorpay.

### BR-INDIA-004: Invoice Generation
A digital invoice or receipt must be generated for every successful transaction. The receipt must include:
- KHEL-O's GSTIN (once registered).
- Transaction amount breakdown (base, discount, convenience fee, GST).
- Razorpay transaction reference.
- Date and time of transaction.

### BR-INDIA-005: Data Localization
User data must be stored in data centers within India, per the preference for data localization in the Indian regulatory landscape. Use AWS Mumbai (ap-south-1) or equivalent.

### BR-INDIA-006: Phone Number Format
All phone numbers must be stored in the format `+91XXXXXXXXXX` (E.164 format, India country code).

### BR-INDIA-007: PAN Format Validation
PAN numbers must match the format: 5 uppercase letters, 4 digits, 1 uppercase letter (e.g., `ABCDE1234F`).

### BR-INDIA-008: GST Number Format Validation
GST numbers must match the format: 2 digits (state code) + PAN (10 chars) + 1 digit + 1 letter + 1 checksum character (e.g., `27ABCDE1234F1Z5`).

---

## 12. Rate Limiting Rules

### BR-RATE-001: API Rate Limits
- Unauthenticated endpoints: **100 requests per minute per IP**.
- Authenticated endpoints: **300 requests per minute per user**.
- OTP request: **5 per hour per phone number**.
- Booking creation: **10 per hour per user**.

### BR-RATE-002: Rate Limit Response
When a rate limit is exceeded, the API returns **HTTP 429 Too Many Requests** with headers:
- `X-RateLimit-Limit`: The limit for that endpoint.
- `X-RateLimit-Remaining`: Remaining requests in the window.
- `X-RateLimit-Reset`: Unix timestamp when the limit resets.

---

## 13. Notification Rules

### BR-NOTIF-001: Critical Notifications
The following notifications must always be sent (cannot be opted out):
- Booking confirmation (SMS).
- Payment receipt (email, if email on file).
- Refund notification (SMS).
- Account suspension notice (SMS).

### BR-NOTIF-002: Optional Notifications
The following notifications can be opted out by the user:
- Session reminder (push).
- Promotion alerts (push).
- Marketing communications.

### BR-NOTIF-003: Notification Timing
- Session reminder: **30 minutes** before session start.
- Post-session review prompt: **Immediately** after session completion.
- Promotion alert: **Within 5 minutes** of promotion being published.

---

## Rule Index

| Rule ID | Short Description |
|---------|-------------------|
| BR-BOOK-001 | 30-minute minimum advance booking |
| BR-BOOK-002 | 7-day maximum advance booking |
| BR-BOOK-003 | Operating hours constraint |
| BR-BOOK-004 | Duration: 1–6 hours, whole hours only |
| BR-BOOK-005 | Tier availability check |
| BR-BOOK-006 | Max 3 active bookings per gamer |
| BR-BOOK-007 | 30-minute payment timeout |
| BR-BOOK-008 | No overlapping bookings per gamer |
| BR-BOOK-009 | Confirmation code format |
| BR-BOOK-010 | No booking on closed days |
| BR-CANCEL-001 | Full refund >2 hours before |
| BR-CANCEL-002 | 50% refund 1–2 hours before |
| BR-CANCEL-003 | No refund <1 hour before |
| BR-CANCEL-004 | No cancellation after check-in |
| BR-CANCEL-005 | No refund for no-show |
| BR-CANCEL-006 | Refund timeline 5–7 business days |
| BR-CANCEL-007 | Full refund on café suspension |
| BR-CANCEL-008 | Convenience fee refund policy |
| BR-PROMO-001 | Max 50% discount |
| BR-PROMO-002 | Min 5% discount |
| BR-PROMO-003 | Max 30-day promotion duration |
| BR-PROMO-004 | No overlapping promotions same tier |
| BR-PROMO-005 | Start date today or future |
| BR-PROMO-006 | Automatic discount application |
| BR-PROMO-007 | Only active promotions apply |
| BR-PROMO-008 | Discount calculation formula |
| BR-PROMO-009 | Auto-expiry on end date |
| BR-PROMO-010 | Verified cafés only |
| BR-HW-001 | Min 1 active tier per café |
| BR-HW-002 | Quantity = total machines in tier |
| BR-HW-003 | Tier deactivation behavior |
| BR-HW-004 | Price range: ₹20–₹1000/hour |
| BR-HW-005 | Tier name unique within café |
| BR-PRICE-001 | Amount calculation formula |
| BR-PRICE-002 | Convenience fee structure (5%) |
| BR-PRICE-003 | GST 18% on convenience fee only |
| BR-PRICE-004 | All amounts in paisa |
| BR-PRICE-005 | Display in INR |
| BR-PRICE-006 | Transparent pricing display |
| BR-PAY-001 | Online payment only |
| BR-PAY-002 | Supported payment methods |
| BR-PAY-003 | INR currency only |
| BR-PAY-004 | Idempotent payment processing |
| BR-PAY-005 | Webhook signature verification |
| BR-PAY-006 | Max 3 payment retries |
| BR-PAY-007 | Payment record immutability |
| BR-REV-001 | One review per booking |
| BR-REV-002 | Rating range 1–5 |
| BR-REV-003 | Max 500 character comment |
| BR-REV-004 | 24-hour edit window |
| BR-REV-005 | Average rating calculation |
| BR-REV-006 | Flagged review hidden |
| BR-REV-007 | No self-reviews |
| BR-USER-001 | Phone uniqueness |
| BR-USER-002 | OTP rate limit 5/hour |
| BR-USER-003 | OTP valid 5 minutes |
| BR-USER-004 | OTP attempt limit 5 |
| BR-USER-005 | Suspended user restrictions |
| BR-USER-006 | Account deletion and anonymization |
| BR-USER-007 | Single role per phone number |
| BR-VERIFY-001 | Verification required for visibility |
| BR-VERIFY-002 | 24–48 hour verification SLA |
| BR-VERIFY-003 | Unlimited resubmissions |
| BR-VERIFY-004 | PAN required |
| BR-VERIFY-005 | Min 1 photo for verification |
| BR-SESS-001 | Session created on check-in |
| BR-SESS-002 | Auto-completion at end time |
| BR-SESS-003 | No refund for early departure |
| BR-SESS-004 | 15-minute no-show window |
| BR-INDIA-001 | GST 18% on service fees |
| BR-INDIA-002 | GST displayed separately |
| BR-INDIA-003 | RBI payment compliance via Razorpay |
| BR-INDIA-004 | Invoice generation required |
| BR-INDIA-005 | Data stored in India |
| BR-INDIA-006 | Phone format +91XXXXXXXXXX |
| BR-INDIA-007 | PAN format validation |
| BR-INDIA-008 | GST number format validation |
| BR-RATE-001 | API rate limits |
| BR-RATE-002 | 429 response with headers |
| BR-NOTIF-001 | Critical notifications (no opt-out) |
| BR-NOTIF-002 | Optional notifications |
| BR-NOTIF-003 | Notification timing |
