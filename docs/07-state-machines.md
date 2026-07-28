# State Machines — KHEL-O

## Overview

This document defines state machines for every stateful entity in the KHEL-O system. For each state machine, it lists all states, all transitions, the trigger for each transition, and any side effects (notifications, events, webhooks).

State machines are the authoritative source for understanding how entities change over time. They directly inform:
- Backend service logic (what transitions are valid).
- Database `status` columns (what values are allowed).
- Event catalog (`08-events.md`) — which events are raised on each transition.
- Notification design (`17-notifications.md`) — which notifications are sent on each transition.

---

## 1. Booking State Machine

### States

| State | Description |
|-------|-------------|
| `payment_pending` | Booking created, waiting for payment. |
| `confirmed` | Payment captured, booking is active. Gamer is expected. |
| `checked_in` | Gamer has arrived and been checked in by the owner. Session is active. |
| `completed` | Session finished. Booking is done. |
| `cancelled` | Booking was cancelled by the gamer (before check-in). |
| `no_show` | Gamer did not arrive within 15 minutes of session start. |
| `expired` | Payment was not received within 30 minutes. Booking is void. |

### Transitions

| From | To | Trigger | Actor | Side Effects |
|------|----|---------|-------|-------------|
| `payment_pending` | `confirmed` | Payment captured (Razorpay webhook: `payment.captured`) | System | Generate confirmation code, generate QR code, send SMS to gamer, send SMS to owner, emit `BookingConfirmed` event. |
| `payment_pending` | `expired` | 30 minutes elapsed without payment | System (background job) | Release tier capacity, emit `BookingExpired` event. |
| `payment_pending` | `cancelled` | Gamer cancels before payment | Gamer | Release tier capacity, emit `BookingCancelled` event. No refund (no payment was made). |
| `confirmed` | `checked_in` | Owner checks in the gamer | Owner | Create Session record, emit `SessionStarted` event. |
| `confirmed` | `cancelled` | Gamer cancels the booking | Gamer | Initiate refund per cancellation policy, release tier capacity, send cancellation SMS to gamer, send cancellation notification to owner, emit `BookingCancelled` event, emit `RefundInitiated` event (if applicable). |
| `confirmed` | `no_show` | Owner marks no-show (15 min after start time) | Owner | No refund, release tier capacity, send no-show notification to gamer, emit `BookingNoShow` event. |
| `checked_in` | `completed` | Session end time reached OR owner ends session early | System / Owner | Update Session record (actual_end_time), send post-session notification to gamer, prompt review, emit `SessionEnded` event, emit `BookingCompleted` event. |

### State Diagram

```
                          ┌──────────────┐
                          │              │
               ┌─────────►│   expired    │
               │  (timeout)│              │
               │          └──────────────┘
               │
        ┌──────┴───────┐         ┌──────────────┐
        │              │ payment │              │
   ───► │payment_pending├────────►│  confirmed   │
        │              │captured │              │
        └──────┬───────┘         └──┬───┬───┬───┘
               │                    │   │   │
               │ cancel             │   │   │ cancel
               │ (no payment)       │   │   │ (refund)
               ▼                    │   │   ▼
        ┌──────────────┐            │   │  ┌──────────────┐
        │              │            │   │  │              │
        │  cancelled   │◄───────────┘   │  │  cancelled   │
        │              │                │  │              │
        └──────────────┘                │  └──────────────┘
                                        │
                              check-in  │  no-show
                              ┌─────────┘  ┌──────────────┐
                              │            │              │
                              ▼            │   no_show    │
                       ┌──────────────┐    │              │
                       │              │    └──────────────┘
                       │  checked_in  │
                       │              │
                       └──────┬───────┘
                              │
                              │ session ends
                              ▼
                       ┌──────────────┐
                       │              │
                       │  completed   │
                       │              │
                       └──────────────┘
```

### Invalid Transitions (explicitly forbidden)

- `confirmed` → `payment_pending` (cannot un-pay)
- `completed` → any state (terminal state)
- `cancelled` → any state (terminal state)
- `no_show` → any state (terminal state)
- `expired` → any state (terminal state)
- `checked_in` → `confirmed` (cannot un-check-in)
- `checked_in` → `cancelled` (cannot cancel after check-in)

---

## 2. Payment State Machine

### States

| State | Description |
|-------|-------------|
| `created` | Razorpay order created. Payment not yet attempted. |
| `authorized` | Payment authorized but not yet captured (for card payments with manual capture). |
| `captured` | Payment successfully captured. Money received. |
| `failed` | Payment attempt failed. |
| `refund_initiated` | Refund has been requested through Razorpay. |
| `refunded` | Full refund processed and confirmed by Razorpay. |
| `partially_refunded` | Partial refund processed and confirmed. |

### Transitions

| From | To | Trigger | Actor | Side Effects |
|------|----|---------|-------|-------------|
| `created` | `authorized` | Razorpay webhook: `payment.authorized` | System | Emit `PaymentAuthorized` event. For UPI/wallet, this step is often skipped. |
| `created` | `captured` | Razorpay webhook: `payment.captured` | System | Update booking to `confirmed`, send receipt email, emit `PaymentCaptured` event. |
| `created` | `failed` | Razorpay webhook: `payment.failed` or user cancels | System | Emit `PaymentFailed` event. Booking remains in `payment_pending`. |
| `authorized` | `captured` | Razorpay auto-capture or manual capture API call | System | Update booking to `confirmed`, send receipt email, emit `PaymentCaptured` event. |
| `authorized` | `failed` | Authorization expires or is voided | System | Emit `PaymentFailed` event. |
| `captured` | `refund_initiated` | Gamer cancels booking, refund API called | System | Emit `RefundInitiated` event. |
| `captured` | `refunded` | Razorpay webhook: `refund.processed` (full amount) | System | Emit `RefundProcessed` event, send refund SMS to gamer. |
| `captured` | `partially_refunded` | Razorpay webhook: `refund.processed` (partial amount) | System | Emit `RefundProcessed` event, send refund SMS with partial amount. |
| `refund_initiated` | `refunded` | Razorpay confirms full refund | System | Emit `RefundProcessed` event. |
| `refund_initiated` | `partially_refunded` | Razorpay confirms partial refund | System | Emit `RefundProcessed` event. |
| `failed` | `captured` | Gamer retries payment successfully | System | Same as `created` → `captured`. |

### State Diagram

```
        ┌──────────────┐
        │              │
   ───► │   created    │
        │              │
        └──┬───┬───┬───┘
           │   │   │
  authorize│   │   │ fail
           │   │   │
           ▼   │   ▼
  ┌────────┐   │  ┌──────────────┐
  │authorized  │  │   failed     │
  └───┬──┬─┘   │  └──────┬───────┘
      │  │     │         │ retry success
 capture │fail │capture  │
      │  │     │         │
      ▼  ▼     ▼         ▼
  ┌──────────────────────────┐
  │        captured          │
  └──────────┬───────────────┘
             │
             │ refund requested
             ▼
  ┌──────────────────────┐
  │  refund_initiated    │
  └──────┬───────┬───────┘
         │       │
    full │       │ partial
         ▼       ▼
  ┌──────────┐  ┌────────────────┐
  │ refunded │  │partially_refunded│
  └──────────┘  └────────────────┘
```

---

## 3. Promotion State Machine

### States

| State | Description |
|-------|-------------|
| `draft` | Promotion created but not yet published. Not visible to gamers. |
| `active` | Promotion is live. Visible to gamers. Discounts are applied to qualifying bookings. |
| `paused` | Promotion temporarily paused by owner. Not visible. Discounts not applied. |
| `ended` | Promotion manually ended by owner before the end date. |
| `expired` | Promotion end date has passed. Automatically transitioned by the system. |

### Transitions

| From | To | Trigger | Actor | Side Effects |
|------|----|---------|-------|-------------|
| `draft` | `active` | Owner publishes the promotion | Owner | Send push notifications to nearby gamers, display on café profile and home feed, emit `PromotionPublished` event. |
| `active` | `paused` | Owner pauses the promotion | Owner | Remove from gamer-facing views, stop applying discounts, emit `PromotionPaused` event. |
| `paused` | `active` | Owner resumes the promotion | Owner | Re-display to gamers, resume discounts, emit `PromotionResumed` event. |
| `active` | `ended` | Owner ends the promotion early | Owner | Remove from gamer-facing views, stop applying discounts, emit `PromotionEnded` event. |
| `active` | `expired` | System detects end date has passed | System (background job) | Remove from gamer-facing views, stop applying discounts, emit `PromotionExpired` event. |
| `paused` | `ended` | Owner ends the promotion while paused | Owner | Emit `PromotionEnded` event. |
| `paused` | `expired` | System detects end date has passed while paused | System | Emit `PromotionExpired` event. |

### State Diagram

```
        ┌──────────────┐
        │              │
   ───► │    draft     │
        │              │
        └──────┬───────┘
               │
               │ publish
               ▼
        ┌──────────────┐
   ┌───►│   active     │◄───┐
   │    └──┬───┬───┬───┘    │
   │       │   │   │        │
   │ resume│   │   │ end    │
   │       │   │   │        │
   │       │   │   ▼        │
   │       │   │ ┌────────┐ │
   │       │   │ │ ended  │ │
   │       │   │ └────────┘ │
   │       │   │            │
   │       │   │ expire     │
   │       │   │            │
   │       │   ▼            │
   │       │ ┌────────────┐ │
   │       │ │  expired   │ │
   │       │ └────────────┘ │
   │       │                │
   │       │ pause          │
   │       ▼                │
   │    ┌──────────────┐    │
   │    │   paused     ├────┘
   │    └──┬───┬───────┘  resume
   │       │   │
   │       │   │ end / expire
   │       │   ▼
   │       │ ┌────────────────┐
   │       │ │ ended/expired  │
   │       │ └────────────────┘
   │       │
   └───────┘
```

### Invalid Transitions

- `ended` → any state (terminal state)
- `expired` → any state (terminal state)
- `draft` → `paused` (must be published first)
- `draft` → `ended` (must be published first)

---

## 4. Café Verification State Machine

### States

| State | Description |
|-------|-------------|
| `draft` | Café profile created but not yet submitted for verification. |
| `pending_verification` | Café profile submitted. Waiting for admin review. |
| `info_requested` | Admin has requested additional information from the owner. |
| `verified` | Café has been approved. Visible to gamers. Can accept bookings. |
| `rejected` | Café has been rejected by admin. Not visible to gamers. |
| `suspended` | Café has been suspended by admin (post-verification). Not visible. |
| `temporarily_closed` | Owner has temporarily closed the café. Visible but not bookable. |

### Transitions

| From | To | Trigger | Actor | Side Effects |
|------|----|---------|-------|-------------|
| `draft` | `pending_verification` | Owner completes profile and submits | Owner | Notify admin of new verification request, emit `CaféSubmitted` event. |
| `pending_verification` | `verified` | Admin approves the café | Admin | Send approval SMS and email to owner, make café visible to gamers, emit `CaféVerified` event. |
| `pending_verification` | `rejected` | Admin rejects the café | Admin | Send rejection SMS with reason to owner, emit `CaféRejected` event. |
| `pending_verification` | `info_requested` | Admin requests more information | Admin | Send info request notification to owner, emit `CaféInfoRequested` event. |
| `info_requested` | `pending_verification` | Owner provides requested info and resubmits | Owner | Notify admin of resubmission. |
| `rejected` | `pending_verification` | Owner updates profile and resubmits | Owner | Notify admin of resubmission. |
| `verified` | `suspended` | Admin suspends the café | Admin | Remove from gamer-facing views, cancel all future bookings (with refunds), send suspension notice to owner, emit `CaféSuspended` event. |
| `suspended` | `verified` | Admin unsuspends the café | Admin | Re-display to gamers, send reinstatement notice to owner, emit `CaféReinstated` event. |
| `verified` | `temporarily_closed` | Owner temporarily closes the café | Owner | Block new bookings, display "temporarily closed" banner, emit `CaféTemporarilyClosed` event. |
| `temporarily_closed` | `verified` | Owner reopens the café | Owner | Resume accepting bookings, remove banner, emit `CaféReopened` event. |

### State Diagram

```
        ┌──────────────┐
        │              │
   ───► │    draft     │
        │              │
        └──────┬───────┘
               │ submit
               ▼
        ┌──────────────────────┐
   ┌───►│ pending_verification │◄─────────────┐
   │    └──┬──────┬────────┬───┘              │
   │       │      │        │                  │
   │  approve  request    reject              │
   │       │    info       │              resubmit
   │       │      │        │                  │
   │       │      ▼        ▼                  │
   │       │  ┌────────┐ ┌──────────┐         │
   │       │  │info_   │ │ rejected ├─────────┘
   │       │  │requested├─┘
   │       │  └────────┘
   │       │     │ resubmit
   │       │     └──────────────────┐
   │       │                        │
   │       ▼                        │
   │    ┌──────────────┐            │
   │    │   verified   │◄───────────┘
   │    └──┬───────┬───┘
   │       │       │
   │  suspend  temp_close
   │       │       │
   │       ▼       ▼
   │  ┌──────────┐ ┌──────────────────┐
   │  │suspended │ │temporarily_closed│
   │  └──┬───────┘ └──────┬───────────┘
   │     │                │
   │  unsuspend        reopen
   │     │                │
   │     └────────────────┘
   │            │
   └────────────┘ (back to verified)
```

---

## 5. Session State Machine

### States

| State | Description |
|-------|-------------|
| `active` | Gaming session is in progress. |
| `completed` | Session ended normally (at expected end time or ended early by owner). |
| `terminated` | Session was terminated abnormally (by admin, or due to a system/safety issue). |

### Transitions

| From | To | Trigger | Actor | Side Effects |
|------|----|---------|-------|-------------|
| `active` | `completed` | Expected end time reached | System (background job) | Update actual_end_time, update booking status to `completed`, send post-session notification to gamer, prompt review, emit `SessionEnded` event. |
| `active` | `completed` | Owner ends session early | Owner | Update actual_end_time to now, update booking status to `completed`, emit `SessionEnded` event. |
| `active` | `terminated` | Admin terminates session | Admin | Update actual_end_time to now, update booking status to `completed`, log reason, emit `SessionTerminated` event. |

### State Diagram

```
        ┌──────────────┐
        │              │
   ───► │   active     │
        │              │
        └──┬───────┬───┘
           │       │
      end  │       │ terminate
      (normal)     │ (admin)
           │       │
           ▼       ▼
  ┌──────────┐  ┌──────────────┐
  │completed │  │ terminated   │
  └──────────┘  └──────────────┘
```

### Invalid Transitions

- `completed` → any state (terminal state)
- `terminated` → any state (terminal state)

---

## Implementation Notes

### State Transition Enforcement

All state transitions must be enforced in the **service layer**, not in the database or API layer. The service layer should:

1. Validate that the current state allows the requested transition.
2. Perform the transition.
3. Emit the appropriate domain event.
4. Persist the new state.

Invalid transitions should raise a `InvalidStateTransitionError` (see `25-error-handling.md`).

```python
# Example: Booking state transition enforcement
VALID_TRANSITIONS: dict[BookingStatus, set[BookingStatus]] = {
    BookingStatus.PAYMENT_PENDING: {BookingStatus.CONFIRMED, BookingStatus.EXPIRED, BookingStatus.CANCELLED},
    BookingStatus.CONFIRMED: {BookingStatus.CHECKED_IN, BookingStatus.CANCELLED, BookingStatus.NO_SHOW},
    BookingStatus.CHECKED_IN: {BookingStatus.COMPLETED},
    BookingStatus.COMPLETED: set(),  # terminal
    BookingStatus.CANCELLED: set(),  # terminal
    BookingStatus.NO_SHOW: set(),    # terminal
    BookingStatus.EXPIRED: set(),    # terminal
}

def transition_booking(booking: Booking, new_status: BookingStatus) -> None:
    if new_status not in VALID_TRANSITIONS[booking.status]:
        raise InvalidStateTransitionError(
            entity="Booking",
            current_state=booking.status,
            requested_state=new_status,
        )
    booking.status = new_status
```

### Background Jobs for Time-Based Transitions

The following transitions are triggered by background scheduled jobs:

| Job | Frequency | Transition |
|-----|-----------|-----------|
| Expire pending bookings | Every 5 minutes | `payment_pending` → `expired` (bookings older than 30 minutes without payment) |
| Expire promotions | Every 15 minutes | `active`/`paused` → `expired` (promotions past end_date) |
| Complete sessions | Every 5 minutes | `active` → `completed` (sessions past expected_end_time) |
