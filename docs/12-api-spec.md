# High-Level API Specification — KHEL-O

## Overview

This specification details all system endpoints for the KHEL-O MVP. Endpoints are grouped by functional module and specify HTTP methods, access permissions, payload requirements, and success response structures.

---

## 1. Authentication Domain (`/api/v1/auth`)

### 1.1 Request OTP
- **POST** `/api/v1/auth/request-otp`
- **Auth:** Public
- **Role:** Any
- **Body:** `{ "phoneNumber": "+919876543210" }`
- **Response:** `200 OK` `{ "message": "OTP sent successfully", "expiresInSeconds": 300 }`

### 1.2 Verify OTP & Login
- **POST** `/api/v1/auth/verify-otp`
- **Auth:** Public
- **Role:** Any
- **Body:** `{ "phoneNumber": "+919876543210", "otp": "123456" }`
- **Response:** `200 OK` `{ "accessToken": "eyJ...", "refreshToken": "eyJ...", "user": { "id": "uuid", "role": "gamer" } }`

### 1.3 Refresh Access Token
- **POST** `/api/v1/auth/refresh`
- **Auth:** Bearer (Refresh Token)
- **Role:** Any
- **Body:** `{ "refreshToken": "eyJ..." }`
- **Response:** `200 OK` `{ "accessToken": "eyJ..." }`

---

## 2. Café Discovery & Public Profile (`/api/v1/cafes`)

### 2.1 List/Search Cafés
- **GET** `/api/v1/cafes`
- **Auth:** Optional
- **Query Params:** `city`, `area`, `search_query`, `hardware_tier`, `min_rating`, `page`, `page_size`
- **Response:** `200 OK` List of café summaries with cover photo, average rating, and starting price.

### 2.2 Get Café Details
- **GET** `/api/v1/cafes/{cafe_id}`
- **Auth:** Optional
- **Response:** `200 OK` Full café profile including operational hours, photo gallery, amenities, active hardware tiers, and active promotions.

---

## 3. Hardware Tiers (`/api/v1/cafes/{cafe_id}/hardware-tiers`)

### 3.1 List Hardware Tiers
- **GET** `/api/v1/cafes/{cafe_id}/hardware-tiers`
- **Auth:** Optional
- **Response:** `200 OK` List of active hardware tiers with specifications and pricing.

### 3.2 Create Hardware Tier
- **POST** `/api/v1/cafes/{cafe_id}/hardware-tiers`
- **Auth:** Bearer
- **Role:** `CafeOwner`
- **Body:** `{ "name": "Premium", "gpuModel": "RTX 3060", "quantity": 10, "pricePerHour": 12000 }`
- **Response:** `201 Created` Tier object.

---

## 4. Bookings (`/api/v1/bookings`)

### 4.1 Check Availability
- **GET** `/api/v1/bookings/availability`
- **Auth:** Public
- **Query Params:** `cafe_id`, `hardware_tier_id`, `booking_date`, `start_time`, `duration_hours`
- **Response:** `200 OK` `{ "available": true, "remainingSeats": 4 }`

### 4.2 Create Booking
- **POST** `/api/v1/bookings`
- **Auth:** Bearer
- **Role:** `Gamer`
- **Body:** `{ "cafeId": "uuid", "hardwareTierId": "uuid", "bookingDate": "2026-02-01", "startTime": "14:00", "durationHours": 2 }`
- **Response:** `201 Created` Booking object with status `payment_pending` and Razorpay order payload.

### 4.3 Cancel Booking
- **POST** `/api/v1/bookings/{booking_id}/cancel`
- **Auth:** Bearer
- **Role:** `Gamer`, `Admin`
- **Body:** `{ "reason": "Change of plans" }`
- **Response:** `200 OK` `{ "status": "cancelled", "refundAmount": 18570 }`

---

## 5. Payments (`/api/v1/payments`)

### 5.1 Razorpay Webhook Handler
- **POST** `/api/v1/payments/webhook`
- **Auth:** Signature Validation Header
- **Role:** System / Webhook
- **Body:** Razorpay webhook payload (`payment.captured`, `payment.failed`, `refund.processed`).
- **Response:** `200 OK` `{ "status": "processed" }`

---

## 6. Promotions (`/api/v1/promotions`)

### 6.1 Create Promotion
- **POST** `/api/v1/promotions`
- **Auth:** Bearer
- **Role:** `CafeOwner`
- **Body:** `{ "cafeId": "uuid", "hardwareTierId": "uuid", "discountPercentage": 30, "startDate": "2026-02-01", "endDate": "2026-02-15", "applicableDays": ["monday"], "timeWindowStart": "14:00", "timeWindowEnd": "17:00" }`
- **Response:** `201 Created` Created promotion record.

---

## 7. Owner Dashboard (`/api/v1/owner`)

### 7.1 Owner Today's Bookings
- **GET** `/api/v1/owner/bookings/today`
- **Auth:** Bearer
- **Role:** `CafeOwner`
- **Response:** `200 OK` List of today's bookings with player name, tier, timeslot, and status.

### 7.2 Check-In Gamer
- **POST** `/api/v1/owner/bookings/{booking_id}/check-in`
- **Auth:** Bearer
- **Role:** `CafeOwner`
- **Body:** `{ "assignedMachine": "PC-04" }`
- **Response:** `200 OK` Session started response.

---

## 8. Admin Domain (`/api/v1/admin`)

### 8.1 List Pending Verification Cafés
- **GET** `/api/v1/admin/cafes/pending`
- **Auth:** Bearer
- **Role:** `Admin`
- **Response:** `200 OK` List of unverified cafés.

### 8.2 Verify / Reject Café
- **POST** `/api/v1/admin/cafes/{cafe_id}/verify`
- **Auth:** Bearer
- **Role:** `Admin`
- **Body:** `{ "action": "approve | reject", "reason": "Optional notes" }`
- **Response:** `200 OK` Updated café status.
