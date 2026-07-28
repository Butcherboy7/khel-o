# Logging & Observability — KHEL-O

## Overview

Standards for application logging, structured formats, correlation tracking, and security redacting across all backend services.

---

## 1. Log Format & Library

All backend components use **structlog** in Python to emit JSON logs:

```json
{
  "timestamp": "2026-01-15T10:30:00.123Z",
  "level": "info",
  "logger": "app.modules.booking.service",
  "message": "Booking created successfully",
  "correlationId": "req_8f11c79a",
  "userId": "uuid-gamer",
  "cafeId": "uuid-cafe",
  "bookingId": "uuid-booking",
  "durationMs": 42.5
}
```

---

## 2. Redaction Policies (WHAT NEVER TO LOG)

The following fields must be masked or scrubbed automatically by logging middleware:
- Passwords & MFA secrets
- Raw JWT Access / Refresh Tokens
- OTP codes
- PAN Numbers & GST Numbers
- Raw credit card details or CVVs
