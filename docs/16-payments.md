# Payment Integration Architecture — KHEL-O

## Overview

KHEL-O integrates **Razorpay** as its sole payment gateway.

---

## 1. Zero-Fee Pass-Through Model

- Platform Convenience Fee = **₹0** (100% of session base price goes to café owner).
- Customer pays the exact Razorpay processing fee (~2% for UPI/Cards) passed through transparently at checkout.
- Clear checkout display: `"Payment processing fee: ₹X"` with explanatory tooltip.

---

## 2. Cancellation & Refund Policy

- **> 2 Hours Before Session:** 100% Full Refund.
- **< 2 Hours Before Session:** 0% Refund (No partial refunds).

---

## 3. Razorpay Privacy & Compliance Requirements

To comply with Razorpay onboarding requirements:
1. **Privacy Policy Link:** Explicitly state Razorpay as the payment processor and detail data shared (Name, Email, Phone, Amount).
2. **Terms of Service:** Direct references to Razorpay terms.
3. **Branding:** Display official Razorpay logos and security badges on checkout modals.
4. **Signature Verification:** All incoming webhooks (`payment.captured`) MUST validate the HMAC-SHA256 signature against the configured `RAZORPAY_KEY_SECRET`.
5. **PCI-DSS:** No card data touches KHEL-O servers; all card interactions occur within Razorpay checkout frames.
