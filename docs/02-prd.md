# Product Requirements Document — KHEL-O

## 1. Objectives

### Primary Objective

Build a marketplace and demand-generation platform that helps gaming cafés in India fill their empty PCs during off-peak hours by connecting them with nearby gamers through targeted promotions, easy discovery, and seamless online booking.

### Secondary Objectives

1. Reduce friction in the gamer's journey from "I want to play" to "I'm sitting at a PC."
2. Give café owners a free, easy-to-use dashboard that provides immediate value.
3. Establish KHEL-O as the trusted marketplace for gaming café discovery and booking in India.
4. Create a scalable revenue model based on convenience fees, premium memberships, and brand partnerships.

---

## 2. Success Metrics

| Metric | Definition | MVP Target (Month 6) | Measurement Method |
|--------|-----------|----------------------|-------------------|
| Active Cafés | Cafés with at least 1 booking in the last 30 days | 50+ | Database query |
| Active Players | Players with at least 1 booking in the last 30 days | 5,000+ | Database query |
| Monthly Bookings | Total completed bookings per month | 2,000+ | Booking records |
| GMV | Total transaction value flowing through the platform | ₹10,00,000+/month | Payment records |
| Off-Peak Occupancy Improvement | Percentage increase in off-peak bookings for active cafés | +20% | Before/after comparison per café |
| Booking Completion Rate | (Completed bookings / Initiated bookings) × 100 | >70% | Funnel analytics |
| Repeat Usage Rate | Percentage of players who book again within 30 days | >30% | Cohort analysis |
| Average Time to First Booking | Time from player registration to first completed booking | <7 days | Event tracking |
| Café Onboarding Time | Time from owner signup to profile going live | <24 hours | Event tracking |

---

## 3. User Personas Summary

Full persona details are in `04-user-personas.md`. Summary:

| Persona | Type | Key Need |
|---------|------|----------|
| Rajesh (Small Café Owner) | Primary | Needs more weekday customers. Has 15 PCs, 30% weekday occupancy. |
| Priya (Multi-Location Owner) | Primary | Needs unified management across 3 locations. Wants data-driven promotion decisions. |
| Arjun (College Gamer) | Secondary | Wants affordable gaming on a budget. Plays during free periods. Price-sensitive. |
| Sneha (Competitive Gamer) | Secondary | Needs high-end hardware for tournament practice. Cares about RTX tier and 240Hz. |

---

## 4. MVP Feature List — MoSCoW Prioritization

### 4.1 Player Features

#### Must Have (P0)

| ID | Feature | Description |
|----|---------|-------------|
| P-M01 | Player Registration | Register via phone number with OTP verification. Collect name, city, and optional email. |
| P-M02 | Player Login | OTP-based login. JWT access token and refresh token issued on success. |
| P-M03 | Café Discovery | Browse and search cafés by city, area, and name. Filter by hardware tier, price range, and rating. |
| P-M04 | Map View | View cafés on a map with location pins. Requires café latitude/longitude. |
| P-M05 | Café Profile | View café details: name, address, photos, hardware tiers, pricing, amenities, operating hours, and reviews. |
| P-M06 | Hardware Tier View | View available hardware tiers for a café with specifications and per-hour pricing. |
| P-M07 | Make a Reservation | Select café → date → time slot → duration → hardware tier → confirm → pay. |
| P-M08 | Online Payment | Pay via Razorpay (UPI, cards, wallets, net banking). Convenience fee added transparently. |
| P-M09 | Booking Confirmation | Receive confirmation via SMS and in-app notification with booking details and QR code. |
| P-M10 | Booking History | View past and upcoming bookings with status (upcoming, completed, cancelled, no-show). |
| P-M11 | Cancel Booking | Cancel an upcoming booking. Refund processed per cancellation policy. |

#### Should Have (P1)

| ID | Feature | Description |
|----|---------|-------------|
| P-S01 | Promotion Discovery | View active promotions from nearby cafés on the home screen and café profile. |
| P-S02 | Review Submission | Submit a rating (1–5 stars) and optional text review after a completed session. |
| P-S03 | Push Notifications | Receive push notifications for booking confirmations, reminders, promotions, and payment updates. |
| P-S04 | Profile Management | Update name, email, city, and profile photo. |
| P-S05 | Session Reminder | Receive a reminder notification 30 minutes before the booked session. |

#### Could Have (P2)

| ID | Feature | Description |
|----|---------|-------------|
| P-C01 | Saved Cafés | Save/favorite cafés for quick access. |
| P-C02 | Search History | View recent searches and recently viewed cafés. |
| P-C03 | Promotion Alerts | Opt-in to receive alerts when a favorite café publishes a new promotion. |
| P-C04 | Referral Program | Share a referral code. Both referrer and referee get a discount on next booking. |

#### Will Not Have (MVP)

| ID | Feature | Reason |
|----|---------|--------|
| P-W01 | Social networking | Not a social platform. Does not drive bookings. |
| P-W02 | Clip sharing / highlights | Entertainment feature. No revenue impact. |
| P-W03 | Player reputation system | Adds complexity. No MVP value. |
| P-W04 | Strategy discussions / forums | Community feature. Post-PMF. |
| P-W05 | Live ping monitoring | Technical novelty. No business value. |
| P-W06 | Exact PC reservation | Creates maintenance burden for owners. Hardware tier model is superior. |
| P-W07 | Food ordering (core) | Optional module only. Not a differentiator. |

---

### 4.2 Owner Features

#### Must Have (P0)

| ID | Feature | Description |
|----|---------|-------------|
| O-M01 | Owner Registration | Register via phone number with OTP. Business verification starts after profile creation. |
| O-M02 | Owner Login | OTP-based login. JWT tokens. Role: CaféOwner. |
| O-M03 | Café Profile Management | Create and edit café profile: name, description, address (with geocoding), photos, amenities, operating hours. |
| O-M04 | Hardware Tier Management | Create, edit, and deactivate hardware tiers. Each tier has: name, specs, quantity, per-hour pricing. |
| O-M05 | Pricing Management | Set and update per-hour pricing for each hardware tier. Support for peak/off-peak pricing. |
| O-M06 | Booking Management | View incoming bookings. Confirm arrival (check-in). Mark no-shows. View booking history. |
| O-M07 | Promotion Management | Create, edit, publish, pause, and expire promotions. Each promotion has: tier, time window, discount percentage, validity dates. |
| O-M08 | Basic Analytics | View dashboard with: total bookings (today/week/month), revenue, occupancy rate, top-performing tiers, and promotion performance. |

#### Should Have (P1)

| ID | Feature | Description |
|----|---------|-------------|
| O-S01 | Review Management | View reviews submitted by gamers. Report inappropriate reviews. |
| O-S02 | Notification Preferences | Configure which notifications to receive (new booking, cancellation, review). |
| O-S03 | Operating Hours Management | Set regular and holiday operating hours. System blocks bookings outside operating hours. |
| O-S04 | Revenue Reports | Download CSV/PDF reports of bookings and revenue by date range. |

#### Could Have (P2)

| ID | Feature | Description |
|----|---------|-------------|
| O-C01 | Multi-Location Management | Manage multiple café locations from a single owner account. |
| O-C02 | Staff Accounts | Invite staff members with limited permissions (view bookings, check-in players). |
| O-C03 | Demand Insights | View heatmap of demand by hour/day. Suggested promotion times. |
| O-C04 | QR-Based Food Ordering | Optional module. Gamer scans QR at seat to order food/drinks. |

#### Will Not Have (MVP)

| ID | Feature | Reason |
|----|---------|--------|
| O-W01 | Constant hardware sync | Over-engineering. Self-reported tiers are sufficient. |
| O-W02 | Real-time PC status dashboard | Not needed with hardware tier model. |
| O-W03 | CRM / customer management | Post-PMF feature. |
| O-W04 | Loyalty program management | Post-PMF feature. |

---

### 4.3 Admin Features

#### Must Have (P0)

| ID | Feature | Description |
|----|---------|-------------|
| A-M01 | Admin Login | Email + password login. MFA required. Role: Admin. |
| A-M02 | Café Verification | Review submitted café profiles. Approve or reject with reason. |
| A-M03 | User Management | View all users (gamers and owners). Suspend or ban accounts. |
| A-M04 | Booking Oversight | View all bookings across the platform. Filter by café, date, status. |
| A-M05 | Platform Analytics | Dashboard with: total users, total cafés, total bookings, GMV, active promotions, booking completion rate. |

#### Should Have (P1)

| ID | Feature | Description |
|----|---------|-------------|
| A-S01 | Promotion Management | View all promotions. Approve, reject, or suspend promotions that violate guidelines. |
| A-S02 | Review Moderation | Review flagged reviews. Remove inappropriate content. |
| A-S03 | Refund Management | View refund requests. Approve or deny manual refund requests. |

#### Could Have (P2)

| ID | Feature | Description |
|----|---------|-------------|
| A-C01 | City Management | Add and manage supported cities/areas. |
| A-C02 | Audit Logs | View logs of all admin actions for accountability. |
| A-C03 | Configurable Business Rules | Update system-wide rules (cancellation window, max discount %) from admin panel. |

---

## 5. Features Explicitly Out of Scope for MVP

These are features that will NOT be built in the MVP phase. This list is explicit to prevent scope creep.

1. Social networking, messaging, or chat between players.
2. Video clip sharing or highlight reels.
3. Player ranking, reputation, or leveling systems.
4. Game strategy discussions, forums, or community spaces.
5. Live network ping monitoring or speed testing.
6. Exact PC reservation (specific machine ID).
7. Constant hardware synchronization or automated hardware inventory.
8. Food ordering as a core feature (only optional module).
9. Multi-language support (English only for MVP).
10. Native mobile apps (web-first, responsive design, PWA if appropriate).
11. Tournament management features.
12. Brand partnership / sponsored content features.
13. Advanced demand prediction or ML-based recommendations.

---

## 6. Assumptions

1. Gaming café owners are willing to self-report hardware tiers and pricing accurately.
2. Café owners have a smartphone and can manage their dashboard via mobile browser.
3. Gamers in target cities are comfortable with OTP-based login and UPI payments.
4. Razorpay can be integrated with acceptable pricing for our convenience fee model.
5. 3–5 cities are sufficient for initial launch to test the marketplace hypothesis.
6. The hardware tier model (not specific PC reservation) is acceptable to both owners and gamers.
7. Internet connectivity is reliable enough in target cities for online booking.
8. Café owners can verify their business via PAN/GST documents.

---

## 7. Open Questions

| # | Question | Impact | Status |
|---|----------|--------|--------|
| 1 | What is the exact convenience fee percentage or flat amount? | Revenue model, payment flow. | To be decided. |
| 2 | What is the cancellation window (hours before session) for a full refund? | Business rules, refund flow. | Proposed: 2 hours. |
| 3 | Should we allow partial refunds for late cancellations? | Payment complexity. | Proposed: 50% refund for cancellations 1–2 hours before. |
| 4 | What is the maximum discount percentage allowed for promotions? | Business rules. | Proposed: 50%. |
| 5 | Do we require GST registration from café owners during onboarding? | Legal compliance. | To be confirmed with legal. |
| 6 | Should we support walk-in bookings (no advance payment)? | Product scope. | Proposed: No for MVP. Online payment only. |
| 7 | What is the minimum advance booking time? | Booking rules. | Proposed: 30 minutes before session start. |
| 8 | How do we handle disputes (gamer says PC quality was poor)? | Support process. | Manual resolution via admin for MVP. |
| 9 | Should promotions require admin approval before going live? | Operational overhead. | Proposed: No for MVP. Owners publish directly. |
| 10 | What happens if a café has zero availability in a tier? | UX, booking flow. | Show tier as "Fully Booked" for that slot. |

---

## 8. Dependencies

| Dependency | Type | Purpose |
|-----------|------|---------|
| Razorpay | External Service | Payment processing (UPI, cards, wallets). |
| Google Maps API | External Service | Café location display, geocoding, distance calculation. |
| SMS Provider (MSG91 or Twilio) | External Service | OTP delivery for login. |
| Email Provider (SendGrid or AWS SES) | External Service | Transactional emails (booking confirmation, receipts). |
| Firebase Cloud Messaging (FCM) | External Service | Push notifications to mobile devices (PWA). |
| PostgreSQL | Infrastructure | Primary database. |
| Redis | Infrastructure | Session caching, rate limiting, OTP storage. |
| AWS / GCP | Infrastructure | Cloud hosting (Mumbai region). |

---

## 9. Constraints

1. **Budget:** Early-stage startup. Minimize infrastructure costs. No enterprise-grade tooling unless free tier available.
2. **Team size:** Small engineering team. Modular monolith preferred over microservices to reduce operational overhead.
3. **Timeline:** MVP must be ready for closed beta within 3 months.
4. **Regulatory:** Must comply with Indian IT Act, GST regulations for digital services, and RBI payment gateway guidelines.
5. **Performance:** The platform must work well on mid-range smartphones with 4G connections. Indian internet speeds vary.
6. **Accessibility:** Web-first. Must be responsive. No native mobile app in MVP.
