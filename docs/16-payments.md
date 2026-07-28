# Payment Integration Design — KHEL-O

## Overview

This document details the payment gateway integration for KHEL-O, utilizing **Razorpay** as the primary payment processor in India.

---

## 1. Sequence Diagram (Text-based)

```
Gamer           Frontend            Backend            Razorpay API
  │                 │                  │                    │
  │── Create Booking──►                │                    │
  │                 │── POST /bookings─►                    │
  │                 │                  │── Create Order ───►│
  │                 │                  │◄── Order Payload ──│
  │                 │◄── Order & ID ───│                    │
  │                 │                  │                    │
  │── Pay via Modal ───────────────────────────────────────►│
  │                                                         │
  │◄── Payment Success Callback ────────────────────────────│
  │                 │                  │                    │
  │                 │                  │◄── Webhook ────────│
  │                 │                  │ (payment.captured) │
  │                 │                  │── Verify Signature │
  │                 │                  │── Confirm Booking  │
```

---

## 2. Calculation Breakdown Example

For a 2-hour session on Premium Tier (Base Rate: ₹120/hr = 12000 paisa) with a 30% Off promotion:

- `baseAmount`: ₹120 × 2 = ₹240 (24000 paisa)
- `discountAmount`: 30% of ₹240 = ₹72 (7200 paisa)
- `netAmount`: ₹240 − ₹72 = ₹168 (16800 paisa)
- `convenienceFee` (5% platform fee): 5% of ₹168 = ₹8.40 → ₹8.40 (840 paisa)
- `gstAmount` (18% on convenience fee): 18% of ₹8.40 = ₹1.51 (151 paisa)
- **`totalAmount`**: ₹168 + ₹8.40 + ₹1.51 = **₹177.91** (17791 paisa)

---

## 3. Webhook Verification & Idempotency

- Webhook signature header `X-Razorpay-Signature` must be validated against HMAC SHA256 using the webhook secret.
- Idempotency key pattern: `razorpay_event_id` stored in database to prevent double processing of captured events.
