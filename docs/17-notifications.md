# Notification System Design — KHEL-O

## Overview

This document specifies the multi-channel notification subsystem for KHEL-O, handling SMS, Email, Push Notifications, and In-App messages.

---

## 1. Provider Stack

- **SMS Provider (India):** MSG91 or Twilio (Primary for OTP and critical transactional updates).
- **Email Provider:** SendGrid or AWS SES (Transactional receipts and registration confirmation).
- **Push Notification Provider:** Firebase Cloud Messaging (FCM).

---

## 2. Notification Trigger Matrix

| Event | Channel | Target Audience | Priority | Retry Strategy |
|-------|---------|-----------------|----------|----------------|
| OTP Request | SMS | Gamer / Owner | High | Instant retry (max 3) |
| Booking Confirmation | SMS + Email | Gamer | High | Exponential backoff (3 attempts) |
| Booking Confirmation | SMS | Owner | High | Exponential backoff (3 attempts) |
| Promotion Published | Push | Nearby Gamers | Low | Non-blocking / Best effort |
| Session Reminder (T-30m) | Push | Gamer | Medium | Best effort |
| Refund Processed | SMS | Gamer | High | Exponential backoff (3 attempts) |
