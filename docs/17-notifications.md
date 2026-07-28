# Notification Architecture — KHEL-O

## Overview

KHEL-O utilizes **Email (via Resend)**, **Web Push (via FCM/Service Workers)**, and **In-App Notifications**. SMS notifications have been completely eliminated.

---

## 1. Provider Stack

- **Transactional Email:** Resend (Simple API, fast delivery, generous free tier).
- **Web Push Notifications:** Firebase Cloud Messaging (FCM) + Service Workers (PWA integration).
- **In-App Notifications:** Real-time web socket / polling alerts in header navigation.

---

## 2. Notification Triggers

| Event | Channel | Target | Content / Copy |
|-------|---------|--------|----------------|
| **Booking Confirmed** | Email | Gamer | Confirmation details + Embedded Static QR Code image. |
| **Payment Failed** | Email | Gamer | Payment attempt failed notification + retry link. |
| **Session Reminder (T-30m)** | Email + Web Push | Gamer | "🎮 Get Ready! Your session at {CafeName} starts in 30 minutes." |
| **Refund Processed** | Email | Gamer | Full refund notification for cancellation >2h before session. |
| **Flash Deal Published** | Web Push + In-App | Nearby Gamers | "🔥 Flash Deal Alert! 30% off at {CafeName} for the next 3 hours!" |
