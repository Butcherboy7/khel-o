# Event Catalog — KHEL-O

## Overview

This document catalogs every domain event in the KHEL-O system. Events are the backbone of the system's reactive behavior — they trigger notifications, update analytics, and propagate state changes across modules.

Events follow a simple pattern:
1. A state change occurs (e.g., booking confirmed).
2. The service layer emits a domain event (e.g., `BookingConfirmed`).
3. Event consumers react (e.g., send SMS, update analytics, create notification record).

### Event Naming Convention

- Events are named in **PascalCase**.
- Events use **past tense** (e.g., `BookingConfirmed`, not `ConfirmBooking`).
- Events are grouped by **domain** (Booking, Payment, Café, Promotion, User, Session, Review).

### Event Envelope

Every event has a standard envelope:

```json
{
  "eventId": "uuid-v4",
  "eventType": "BookingConfirmed",
  "timestamp": "2026-01-15T10:30:00Z",
  "version": "1.0",
  "source": "booking-service",
  "correlationId": "uuid-v4",
  "payload": { ... }
}
```

---

## Booking Events

### BookingCreated

| Field | Value |
|-------|-------|
| **Event Name** | `BookingCreated` |
| **Trigger** | Gamer initiates a booking and a Razorpay order is created. |
| **Source State** | → `payment_pending` |
| **Consumers** | Payment service (creates Razorpay order), Analytics (track booking funnel). |
| **Side Effects** | Start 30-minute payment timeout timer. |

**Payload:**

```json
{
  "bookingId": "uuid",
  "gamerId": "uuid",
  "cafeId": "uuid",
  "hardwareTierId": "uuid",
  "bookingDate": "2026-01-15",
  "startTime": "14:00",
  "endTime": "16:00",
  "durationHours": 2,
  "baseAmount": 24000,
  "discountAmount": 7200,
  "convenienceFee": 1500,
  "gstAmount": 270,
  "totalAmount": 18570,
  "promotionId": "uuid | null"
}
```

---

### BookingConfirmed

| Field | Value |
|-------|-------|
| **Event Name** | `BookingConfirmed` |
| **Trigger** | Payment captured successfully via Razorpay webhook. |
| **Source State** | `payment_pending` → `confirmed` |
| **Consumers** | Notification service (SMS to gamer, SMS to owner, email receipt to gamer), Analytics (track confirmed booking). |
| **Side Effects** | Generate confirmation code and QR code. Schedule session reminder notification for T-30 minutes. |

**Payload:**

```json
{
  "bookingId": "uuid",
  "gamerId": "uuid",
  "cafeId": "uuid",
  "confirmationCode": "A1B2C3D4",
  "totalAmount": 18570,
  "bookingDate": "2026-01-15",
  "startTime": "14:00",
  "endTime": "16:00",
  "hardwareTierName": "Premium",
  "cafeName": "GG Zone",
  "cafeAddress": "123 Kothrud, Pune"
}
```

---

### BookingCancelled

| Field | Value |
|-------|-------|
| **Event Name** | `BookingCancelled` |
| **Trigger** | Gamer cancels a confirmed booking OR gamer cancels a payment_pending booking. |
| **Source State** | `confirmed` → `cancelled` OR `payment_pending` → `cancelled` |
| **Consumers** | Notification service (SMS to gamer with refund info, notification to owner), Payment service (initiate refund if payment was captured), Analytics (track cancellation). |
| **Side Effects** | Release tier capacity for the time slot. Cancel scheduled session reminder. |

**Payload:**

```json
{
  "bookingId": "uuid",
  "gamerId": "uuid",
  "cafeId": "uuid",
  "previousStatus": "confirmed",
  "cancellationReason": "User cancelled",
  "refundAmount": 18570,
  "refundType": "full | partial | none",
  "cancelledAt": "2026-01-15T10:00:00Z"
}
```

---

### BookingExpired

| Field | Value |
|-------|-------|
| **Event Name** | `BookingExpired` |
| **Trigger** | Background job detects booking in `payment_pending` for >30 minutes. |
| **Source State** | `payment_pending` → `expired` |
| **Consumers** | Analytics (track drop-off). |
| **Side Effects** | Release tier capacity. |

**Payload:**

```json
{
  "bookingId": "uuid",
  "gamerId": "uuid",
  "cafeId": "uuid",
  "createdAt": "2026-01-15T09:00:00Z",
  "expiredAt": "2026-01-15T09:30:00Z"
}
```

---

### BookingNoShow

| Field | Value |
|-------|-------|
| **Event Name** | `BookingNoShow` |
| **Trigger** | Owner marks the booking as no-show (gamer did not arrive within 15 minutes). |
| **Source State** | `confirmed` → `no_show` |
| **Consumers** | Notification service (notify gamer), Analytics (track no-show rate). |
| **Side Effects** | No refund processed. Release tier capacity. |

**Payload:**

```json
{
  "bookingId": "uuid",
  "gamerId": "uuid",
  "cafeId": "uuid",
  "bookingDate": "2026-01-15",
  "startTime": "14:00",
  "markedAt": "2026-01-15T14:15:00Z"
}
```

---

### BookingCompleted

| Field | Value |
|-------|-------|
| **Event Name** | `BookingCompleted` |
| **Trigger** | Session ends (auto-complete or manual end by owner). |
| **Source State** | `checked_in` → `completed` |
| **Consumers** | Notification service (post-session prompt to gamer), Analytics (update completed count, revenue), Gamer profile (update total_bookings, total_spent), Promotion analytics (update total_bookings_generated if promotion applied). |
| **Side Effects** | Prompt gamer to submit a review. |

**Payload:**

```json
{
  "bookingId": "uuid",
  "gamerId": "uuid",
  "cafeId": "uuid",
  "hardwareTierId": "uuid",
  "totalAmount": 18570,
  "promotionId": "uuid | null",
  "sessionStartTime": "2026-01-15T14:00:00Z",
  "sessionEndTime": "2026-01-15T16:00:00Z"
}
```

---

## Payment Events

### PaymentAuthorized

| Field | Value |
|-------|-------|
| **Event Name** | `PaymentAuthorized` |
| **Trigger** | Razorpay webhook: `payment.authorized`. |
| **Source State** | `created` → `authorized` |
| **Consumers** | Payment service (auto-capture if configured). |
| **Side Effects** | None (intermediate state, may be skipped for UPI). |

**Payload:**

```json
{
  "paymentId": "uuid",
  "bookingId": "uuid",
  "razorpayPaymentId": "pay_ABC123",
  "amount": 18570,
  "paymentMethod": "card"
}
```

---

### PaymentCaptured

| Field | Value |
|-------|-------|
| **Event Name** | `PaymentCaptured` |
| **Trigger** | Razorpay webhook: `payment.captured`. |
| **Source State** | `created`/`authorized` → `captured` |
| **Consumers** | Booking service (confirm booking), Notification service (receipt email). |
| **Side Effects** | Transition booking to `confirmed`. |

**Payload:**

```json
{
  "paymentId": "uuid",
  "bookingId": "uuid",
  "razorpayPaymentId": "pay_ABC123",
  "razorpayOrderId": "order_XYZ789",
  "amount": 18570,
  "convenienceFee": 1500,
  "gstAmount": 270,
  "paymentMethod": "upi",
  "capturedAt": "2026-01-15T10:30:00Z"
}
```

---

### PaymentFailed

| Field | Value |
|-------|-------|
| **Event Name** | `PaymentFailed` |
| **Trigger** | Razorpay webhook: `payment.failed` or user cancels payment. |
| **Source State** | `created`/`authorized` → `failed` |
| **Consumers** | Notification service (notify gamer of failure), Analytics (track payment failure rate). |
| **Side Effects** | Booking remains in `payment_pending`. Gamer can retry. |

**Payload:**

```json
{
  "paymentId": "uuid",
  "bookingId": "uuid",
  "razorpayOrderId": "order_XYZ789",
  "failureReason": "Insufficient funds",
  "failedAt": "2026-01-15T10:30:00Z"
}
```

---

### RefundInitiated

| Field | Value |
|-------|-------|
| **Event Name** | `RefundInitiated` |
| **Trigger** | Booking cancelled with refund eligible. Refund API called to Razorpay. |
| **Source State** | `captured` → `refund_initiated` |
| **Consumers** | Notification service (notify gamer that refund is processing). |
| **Side Effects** | None. Waiting for Razorpay confirmation. |

**Payload:**

```json
{
  "paymentId": "uuid",
  "bookingId": "uuid",
  "refundAmount": 18570,
  "refundType": "full",
  "reason": "Booking cancelled by gamer"
}
```

---

### RefundProcessed

| Field | Value |
|-------|-------|
| **Event Name** | `RefundProcessed` |
| **Trigger** | Razorpay webhook: `refund.processed`. |
| **Source State** | `refund_initiated` → `refunded` / `partially_refunded` |
| **Consumers** | Notification service (SMS to gamer with refund confirmation and amount). |
| **Side Effects** | Update payment record with refund details. |

**Payload:**

```json
{
  "paymentId": "uuid",
  "bookingId": "uuid",
  "razorpayRefundId": "rfnd_ABC123",
  "refundAmount": 18570,
  "refundStatus": "processed",
  "processedAt": "2026-01-15T12:00:00Z"
}
```

---

## Café Events

### CaféSubmitted

| Field | Value |
|-------|-------|
| **Event Name** | `CaféSubmitted` |
| **Trigger** | Owner completes café profile and submits for verification. |
| **Source State** | `draft` → `pending_verification` |
| **Consumers** | Admin notification service (alert admins of new verification request). |
| **Side Effects** | None. |

**Payload:**

```json
{
  "cafeId": "uuid",
  "ownerId": "uuid",
  "cafeName": "GG Zone",
  "city": "Pune",
  "submittedAt": "2026-01-15T10:00:00Z"
}
```

---

### CaféVerified

| Field | Value |
|-------|-------|
| **Event Name** | `CaféVerified` |
| **Trigger** | Admin approves the café. |
| **Source State** | `pending_verification` → `verified` |
| **Consumers** | Notification service (SMS and email to owner), Search index (add café to search). |
| **Side Effects** | Café becomes visible to gamers. |

**Payload:**

```json
{
  "cafeId": "uuid",
  "ownerId": "uuid",
  "cafeName": "GG Zone",
  "city": "Pune",
  "verifiedAt": "2026-01-15T14:00:00Z",
  "verifiedBy": "admin-uuid"
}
```

---

### CaféRejected

| Field | Value |
|-------|-------|
| **Event Name** | `CaféRejected` |
| **Trigger** | Admin rejects the café with a reason. |
| **Source State** | `pending_verification` → `rejected` |
| **Consumers** | Notification service (SMS to owner with rejection reason). |
| **Side Effects** | None. Owner can update and resubmit. |

**Payload:**

```json
{
  "cafeId": "uuid",
  "ownerId": "uuid",
  "cafeName": "GG Zone",
  "rejectionReason": "Photos do not match claimed hardware",
  "rejectedAt": "2026-01-15T14:00:00Z",
  "rejectedBy": "admin-uuid"
}
```

---

### CaféInfoRequested

| Field | Value |
|-------|-------|
| **Event Name** | `CaféInfoRequested` |
| **Trigger** | Admin requests additional information during verification. |
| **Source State** | `pending_verification` → `info_requested` |
| **Consumers** | Notification service (notify owner with details of what's needed). |
| **Side Effects** | None. |

**Payload:**

```json
{
  "cafeId": "uuid",
  "ownerId": "uuid",
  "infoRequested": "Please upload a photo of your PS5 setup.",
  "requestedAt": "2026-01-15T14:00:00Z",
  "requestedBy": "admin-uuid"
}
```

---

### CaféSuspended

| Field | Value |
|-------|-------|
| **Event Name** | `CaféSuspended` |
| **Trigger** | Admin suspends a verified café. |
| **Source State** | `verified` → `suspended` |
| **Consumers** | Notification service (SMS to owner), Booking service (cancel future bookings with refunds), Search index (remove café). |
| **Side Effects** | All future confirmed bookings are cancelled with full refunds. |

**Payload:**

```json
{
  "cafeId": "uuid",
  "ownerId": "uuid",
  "suspensionReason": "Multiple complaints about hardware mismatch",
  "suspendedAt": "2026-01-15T14:00:00Z",
  "suspendedBy": "admin-uuid"
}
```

---

### CaféTemporarilyClosed

| Field | Value |
|-------|-------|
| **Event Name** | `CaféTemporarilyClosed` |
| **Trigger** | Owner marks café as temporarily closed. |
| **Source State** | `verified` → `temporarily_closed` |
| **Consumers** | Search index (update listing status). |
| **Side Effects** | Block new bookings. |

**Payload:**

```json
{
  "cafeId": "uuid",
  "ownerId": "uuid",
  "closedAt": "2026-01-15T10:00:00Z"
}
```

---

### CaféReopened

| Field | Value |
|-------|-------|
| **Event Name** | `CaféReopened` |
| **Trigger** | Owner reopens a temporarily closed café. |
| **Source State** | `temporarily_closed` → `verified` |
| **Consumers** | Search index (update listing status). |
| **Side Effects** | Resume accepting bookings. |

**Payload:**

```json
{
  "cafeId": "uuid",
  "ownerId": "uuid",
  "reopenedAt": "2026-01-15T10:00:00Z"
}
```

---

## Promotion Events

### PromotionPublished

| Field | Value |
|-------|-------|
| **Event Name** | `PromotionPublished` |
| **Trigger** | Owner publishes a promotion (draft → active). |
| **Source State** | `draft` → `active` |
| **Consumers** | Notification service (push notification to nearby gamers), Search/feed (add to home feed and café profile). |
| **Side Effects** | Promotion discounts start applying to qualifying bookings. |

**Payload:**

```json
{
  "promotionId": "uuid",
  "cafeId": "uuid",
  "cafeName": "GG Zone",
  "hardwareTierId": "uuid",
  "hardwareTierName": "Premium",
  "discountPercentage": 30,
  "startDate": "2026-01-15",
  "endDate": "2026-01-31",
  "applicableDays": ["monday", "tuesday", "wednesday", "thursday", "friday"],
  "timeWindowStart": "14:00",
  "timeWindowEnd": "17:00",
  "cafeCity": "Pune",
  "cafeArea": "Kothrud",
  "cafeLatitude": 18.5074,
  "cafeLongitude": 73.8077
}
```

---

### PromotionPaused

| Field | Value |
|-------|-------|
| **Event Name** | `PromotionPaused` |
| **Trigger** | Owner pauses an active promotion. |
| **Source State** | `active` → `paused` |
| **Consumers** | Search/feed (remove from gamer views). |
| **Side Effects** | Stop applying discounts. |

**Payload:**

```json
{
  "promotionId": "uuid",
  "cafeId": "uuid",
  "pausedAt": "2026-01-20T10:00:00Z"
}
```

---

### PromotionResumed

| Field | Value |
|-------|-------|
| **Event Name** | `PromotionResumed` |
| **Trigger** | Owner resumes a paused promotion. |
| **Source State** | `paused` → `active` |
| **Consumers** | Search/feed (re-add to gamer views). |
| **Side Effects** | Resume applying discounts. |

**Payload:**

```json
{
  "promotionId": "uuid",
  "cafeId": "uuid",
  "resumedAt": "2026-01-20T14:00:00Z"
}
```

---

### PromotionEnded

| Field | Value |
|-------|-------|
| **Event Name** | `PromotionEnded` |
| **Trigger** | Owner manually ends a promotion. |
| **Source State** | `active`/`paused` → `ended` |
| **Consumers** | Search/feed (remove from views), Analytics (final promotion performance snapshot). |
| **Side Effects** | Stop applying discounts. |

**Payload:**

```json
{
  "promotionId": "uuid",
  "cafeId": "uuid",
  "endedAt": "2026-01-25T10:00:00Z",
  "totalBookingsGenerated": 45,
  "totalRevenueGenerated": 675000
}
```

---

### PromotionExpired

| Field | Value |
|-------|-------|
| **Event Name** | `PromotionExpired` |
| **Trigger** | System background job detects end_date has passed. |
| **Source State** | `active`/`paused` → `expired` |
| **Consumers** | Search/feed (remove from views), Analytics (final promotion performance snapshot). |
| **Side Effects** | Stop applying discounts. |

**Payload:**

```json
{
  "promotionId": "uuid",
  "cafeId": "uuid",
  "expiredAt": "2026-01-31T23:59:59Z",
  "totalBookingsGenerated": 78,
  "totalRevenueGenerated": 1170000
}
```

---

## User Events

### UserRegistered

| Field | Value |
|-------|-------|
| **Event Name** | `UserRegistered` |
| **Trigger** | New user completes registration (OTP verified + profile created). |
| **Consumers** | Notification service (welcome SMS), Analytics (track user growth). |
| **Side Effects** | Generate referral code (for gamers). |

**Payload:**

```json
{
  "userId": "uuid",
  "role": "gamer",
  "phoneNumber": "+91XXXXXXXXXX",
  "city": "Pune",
  "registeredAt": "2026-01-15T10:00:00Z"
}
```

---

### UserSuspended

| Field | Value |
|-------|-------|
| **Event Name** | `UserSuspended` |
| **Trigger** | Admin suspends a user account. |
| **Consumers** | Auth service (invalidate tokens), Booking service (handle active bookings). |
| **Side Effects** | Revoke all active tokens. If the user is an owner, café status may be affected. |

**Payload:**

```json
{
  "userId": "uuid",
  "role": "gamer",
  "suspensionReason": "Repeated no-shows",
  "suspendedBy": "admin-uuid",
  "suspendedAt": "2026-01-15T14:00:00Z"
}
```

---

### UserDeleted

| Field | Value |
|-------|-------|
| **Event Name** | `UserDeleted` |
| **Trigger** | User requests account deletion. |
| **Consumers** | Data anonymization service (schedule PII cleanup within 30 days), Auth service (invalidate tokens). |
| **Side Effects** | Soft delete immediately. PII anonymization scheduled. |

**Payload:**

```json
{
  "userId": "uuid",
  "role": "gamer",
  "deletedAt": "2026-01-15T10:00:00Z",
  "anonymizationDeadline": "2026-02-14T10:00:00Z"
}
```

---

## Session Events

### SessionStarted

| Field | Value |
|-------|-------|
| **Event Name** | `SessionStarted` |
| **Trigger** | Owner checks in a gamer (booking status → checked_in). |
| **Source State** | → `active` |
| **Consumers** | Analytics (track active sessions). |
| **Side Effects** | Create session record. |

**Payload:**

```json
{
  "sessionId": "uuid",
  "bookingId": "uuid",
  "gamerId": "uuid",
  "cafeId": "uuid",
  "hardwareTierId": "uuid",
  "assignedMachine": "PC-07",
  "startTime": "2026-01-15T14:00:00Z",
  "expectedEndTime": "2026-01-15T16:00:00Z"
}
```

---

### SessionEnded

| Field | Value |
|-------|-------|
| **Event Name** | `SessionEnded` |
| **Trigger** | Session auto-completes at expected end time OR owner ends session early. |
| **Source State** | `active` → `completed` |
| **Consumers** | Notification service (post-session prompt), Analytics (session duration, occupancy). |
| **Side Effects** | Update booking to `completed`. |

**Payload:**

```json
{
  "sessionId": "uuid",
  "bookingId": "uuid",
  "gamerId": "uuid",
  "cafeId": "uuid",
  "startTime": "2026-01-15T14:00:00Z",
  "actualEndTime": "2026-01-15T15:45:00Z",
  "expectedEndTime": "2026-01-15T16:00:00Z",
  "endedBy": "owner | system"
}
```

---

### SessionTerminated

| Field | Value |
|-------|-------|
| **Event Name** | `SessionTerminated` |
| **Trigger** | Admin terminates a session for safety or policy reasons. |
| **Source State** | `active` → `terminated` |
| **Consumers** | Notification service (notify gamer and owner), Audit log. |
| **Side Effects** | Log termination reason. |

**Payload:**

```json
{
  "sessionId": "uuid",
  "bookingId": "uuid",
  "terminationReason": "Policy violation reported",
  "terminatedBy": "admin-uuid",
  "terminatedAt": "2026-01-15T15:00:00Z"
}
```

---

## Review Events

### ReviewSubmitted

| Field | Value |
|-------|-------|
| **Event Name** | `ReviewSubmitted` |
| **Trigger** | Gamer submits a review after a completed booking. |
| **Consumers** | Café service (recalculate average rating), Notification service (notify owner of new review). |
| **Side Effects** | Update café's `average_rating` and `total_reviews`. |

**Payload:**

```json
{
  "reviewId": "uuid",
  "bookingId": "uuid",
  "gamerId": "uuid",
  "cafeId": "uuid",
  "rating": 4,
  "comment": "Great setup, RTX 3060 ran Valorant smoothly. AC was too cold though.",
  "submittedAt": "2026-01-15T16:30:00Z"
}
```

---

### ReviewFlagged

| Field | Value |
|-------|-------|
| **Event Name** | `ReviewFlagged` |
| **Trigger** | Owner or admin flags a review for moderation. |
| **Consumers** | Admin notification service (alert for moderation). |
| **Side Effects** | Hide review from public view until moderated. |

**Payload:**

```json
{
  "reviewId": "uuid",
  "cafeId": "uuid",
  "flaggedBy": "uuid",
  "flaggedReason": "Fake review — this person never visited",
  "flaggedAt": "2026-01-15T17:00:00Z"
}
```

---

### ReviewRemoved

| Field | Value |
|-------|-------|
| **Event Name** | `ReviewRemoved` |
| **Trigger** | Admin removes a review after moderation. |
| **Consumers** | Café service (recalculate average rating). |
| **Side Effects** | Update café's `average_rating` and `total_reviews`. |

**Payload:**

```json
{
  "reviewId": "uuid",
  "cafeId": "uuid",
  "removedBy": "admin-uuid",
  "removalReason": "Violates content guidelines",
  "removedAt": "2026-01-16T10:00:00Z"
}
```

---

## Event Summary Matrix

| Event | Domain | Trigger | Key Side Effects |
|-------|--------|---------|-----------------|
| BookingCreated | Booking | Gamer initiates booking | Create Razorpay order, start payment timer |
| BookingConfirmed | Booking | Payment captured | SMS to gamer + owner, generate QR code |
| BookingCancelled | Booking | Gamer cancels | Refund (if eligible), release capacity |
| BookingExpired | Booking | Payment timeout | Release capacity |
| BookingNoShow | Booking | Owner marks no-show | Notify gamer, no refund |
| BookingCompleted | Booking | Session ends | Prompt review, update analytics |
| PaymentAuthorized | Payment | Razorpay authorized | Auto-capture (if configured) |
| PaymentCaptured | Payment | Razorpay captured | Confirm booking, send receipt |
| PaymentFailed | Payment | Razorpay failed | Notify gamer, allow retry |
| RefundInitiated | Payment | Cancellation refund | Notify gamer refund in progress |
| RefundProcessed | Payment | Razorpay refund processed | SMS with refund amount |
| CaféSubmitted | Café | Owner submits for verification | Alert admins |
| CaféVerified | Café | Admin approves | SMS/email to owner, café goes live |
| CaféRejected | Café | Admin rejects | SMS to owner with reason |
| CaféInfoRequested | Café | Admin requests info | Notify owner |
| CaféSuspended | Café | Admin suspends | Cancel future bookings, refund, notify |
| CaféTemporarilyClosed | Café | Owner closes temporarily | Block bookings |
| CaféReopened | Café | Owner reopens | Resume bookings |
| PromotionPublished | Promotion | Owner publishes | Push to nearby gamers |
| PromotionPaused | Promotion | Owner pauses | Remove from views |
| PromotionResumed | Promotion | Owner resumes | Re-add to views |
| PromotionEnded | Promotion | Owner ends | Stop discounts |
| PromotionExpired | Promotion | System auto-expire | Stop discounts |
| UserRegistered | User | New registration | Welcome SMS |
| UserSuspended | User | Admin suspends | Invalidate tokens |
| UserDeleted | User | User requests deletion | Schedule PII anonymization |
| SessionStarted | Session | Owner checks in gamer | Create session record |
| SessionEnded | Session | Session time ends | Complete booking, prompt review |
| SessionTerminated | Session | Admin terminates | Log reason, notify |
| ReviewSubmitted | Review | Gamer submits review | Update café rating |
| ReviewFlagged | Review | Owner/admin flags | Hide review, alert admin |
| ReviewRemoved | Review | Admin removes | Recalculate café rating |
