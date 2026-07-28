# Authentication & Authorization — KHEL-O

## Overview

This document details the authentication and authorization (RBAC) architecture for KHEL-O, specifically tailored for the Indian market preference for OTP-based login via mobile numbers.

---

## 1. Authentication Strategy

- **Primary Identity:** Indian Mobile Phone Number (`+91XXXXXXXXXX`).
- **Secondary Identity (Admin):** Email + Password + Mandatory TOTP MFA.
- **Tokens:** Short-lived JWT Access Tokens (15 min validity) and Long-lived Refresh Tokens (30 days validity).

---

## 2. Role-Based Access Control (RBAC) Matrix

| Endpoint Group / Action | Gamer | CaféOwner | Admin | Public |
|-------------------------|-------|-----------|-------|--------|
| Browse / Search Cafés | ✅ | ✅ | ✅ | ✅ |
| View Café Profile & Hardware Tiers | ✅ | ✅ | ✅ | ✅ |
| Create / Manage Bookings | ✅ | ❌ | ❌ | ❌ |
| Initiate Payment / Pay | ✅ | ❌ | ❌ | ❌ |
| Submit Review | ✅ | ❌ | ❌ | ❌ |
| Manage Café Profile / Hardware Tiers | ❌ | ✅ (Own café) | ✅ | ❌ |
| Create / Manage Promotions | ❌ | ✅ (Own café) | ✅ | ❌ |
| Check-in Gamer / Manage Today's Bookings | ❌ | ✅ (Own café) | ✅ | ❌ |
| Approve / Reject / Suspend Café | ❌ | ❌ | ✅ | ❌ |
| View Platform Analytics | ❌ | ❌ | ✅ | ❌ |

---

## 3. JWT Token Payload Structure

### Access Token
```json
{
  "sub": "user-uuid-1234",
  "role": "gamer",
  "phoneNumber": "+919876543210",
  "iat": 1769587200,
  "exp": 1769588100,
  "type": "access"
}
```
