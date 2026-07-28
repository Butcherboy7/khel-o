# Business Rules — KHEL-O

## 1. Booking & Cancellation Rules

- **BR-BOOK-001 (Advance Booking):** Minimum advance booking window is **30 minutes** before session start time. Maximum advance window is **7 days**.
- **BR-CANCEL-001 (Full Refund):** Cancellations made **> 2 hours** before session start time receive a 100% refund (minus Razorpay processing fee).
- **BR-CANCEL-002 (No Refund):** Cancellations made **< 2 hours** before session start time receive **0% refund**.
- **BR-CANCEL-003 (No Partial Refunds):** Partial refunds are explicitly unsupported in MVP to maintain operational simplicity.
- **BR-CANCEL-004 (Disputes):** All dispute resolutions are handled manually by platform admins.

## 2. Pricing & Payment Gateway Fee Rules

- **BR-PRICE-001 (Pass-Through Fee):** Customers pay the session base price + transparent Razorpay processing fee (~2%).
- **BR-PRICE-002 (Zero Platform Cut):** Platform convenience fee is ₹0. Café owners keep 100% of their hourly rates.
- **BR-PRICE-003 (Currency):** All monetary transactions are processed in INR and stored as exact decimal/paisa values.

## 3. Promotion Rules

- **BR-PROMO-001 (Instant Publishing):** Promotions published by café owners go live immediately without requiring prior admin approval.
- **BR-PROMO-002 (Admin Moderation):** Admins reserve the right to unpublish or remove any promotion violating terms.
- **BR-PROMO-003 (Max Discount):** Maximum promotional discount cap is **50%**.

## 4. Compliance & GST Rules

- **BR-GST-001 (Pilot Phase - First 100 Cafés):** GST registration is optional for café onboarding during the pilot phase.
- **BR-GST-002 (Post-Pilot Phase):** GST registration becomes mandatory for self-serve café onboarding post-pilot.
- **BR-COMP-001 (Razorpay Privacy Compliance):** Privacy policy must explicitly disclose Razorpay as the payment processor and detail data shared (name, email, phone, booking amount).
