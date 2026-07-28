# Authentication & Authorization Architecture — KHEL-O

## Overview

KHEL-O utilizes **Google OAuth 2.0** as the primary authentication method, supplemented by **Email & Password** authentication. OTP and SMS verifications are completely removed to reduce operational costs and friction.

---

## 1. Authentication Methods

1. **Google OAuth 2.0 (Primary):** One-tap social sign-in for Gamers and Café Owners.
2. **Email + Password (Secondary):** Standard signup/login with email verification via Resend.
3. **Optional Phone Number:** Phone numbers are voluntarily collected on profile setup or checkout for marketing/promotional purposes (never verified via OTP).
4. **Admin Access:** Email + Password + TOTP MFA.

---

## 2. JWT Token Flow

Upon successful OAuth or Email validation, the backend issues:
- **Access Token:** Short-lived JWT (15 mins) passed in `Authorization: Bearer <token>` headers.
- **Refresh Token:** Long-lived JWT (30 days) stored in Secure, HttpOnly cookies.

---

## 3. RBAC Matrix

| Role | Access Permissions |
|------|-------------------|
| **Gamer** | Search cafés, book sessions, pay via Razorpay, view QR codes, write reviews. |
| **CaféOwner** | Create/manage café profile, manage hardware tiers, publish flash promotions, check-in gamers. |
| **Admin** | Manually create cafés (Pilot Track A), approve/verify cafés (Track B), manage promotions/users, view platform metrics. |
