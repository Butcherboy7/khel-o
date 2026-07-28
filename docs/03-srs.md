# Software Requirements Specification — KHEL-O

## 1. Introduction

### 1.1 Purpose

This document specifies the functional and non-functional requirements for the KHEL-O platform — a marketplace and demand-generation platform for gaming cafés in India. It serves as the binding contract between product and engineering.

### 1.2 Scope

The SRS covers the MVP release of KHEL-O, including the player-facing application, café owner dashboard, and admin panel. It defines what the system must do (functional requirements) and how well it must do it (non-functional requirements).

### 1.3 Definitions

| Term | Definition |
|------|-----------|
| Player / Gamer | A consumer who discovers and books gaming sessions at cafés. |
| Owner | A café owner who manages their café listing, hardware tiers, pricing, and promotions. |
| Admin | A KHEL-O internal team member who manages platform operations. |
| Hardware Tier | A category of gaming hardware (e.g., Standard, Premium, PS5) that groups similar machines. |
| Session | A booked time slot at a café for a specific hardware tier. |
| Promotion | A time-bound discount offer created by a café owner for specific hardware tiers and time windows. |
| Convenience Fee | A fee charged to the gamer on each booking, representing KHEL-O's revenue. |

---

## 2. Functional Requirements

### 2.1 Authentication and User Management

| ID | Requirement | Priority |
|----|------------|----------|
| FR-AUTH-001 | The system shall allow players to register using an Indian mobile phone number (+91). | Must Have |
| FR-AUTH-002 | The system shall verify phone numbers via a 6-digit OTP sent over SMS. | Must Have |
| FR-AUTH-003 | The system shall issue a JWT access token (short-lived, 15 minutes) and a refresh token (long-lived, 30 days) upon successful authentication. | Must Have |
| FR-AUTH-004 | The system shall allow token refresh without requiring re-authentication, as long as the refresh token is valid. | Must Have |
| FR-AUTH-005 | The system shall allow café owners to register using a mobile phone number with OTP verification. | Must Have |
| FR-AUTH-006 | The system shall collect the owner's business name, business address, PAN number, and optional GST number during owner registration. | Must Have |
| FR-AUTH-007 | The system shall support role-based access control with three roles: Gamer, CaféOwner, and Admin. | Must Have |
| FR-AUTH-008 | The system shall prevent a single phone number from being registered as both Gamer and CaféOwner simultaneously, unless explicitly allowed by an admin. | Must Have |
| FR-AUTH-009 | The system shall allow admins to log in via email and password with mandatory multi-factor authentication (MFA). | Must Have |
| FR-AUTH-010 | The system shall lock an account after 5 consecutive failed OTP attempts for 15 minutes. | Must Have |
| FR-AUTH-011 | The system shall allow users to update their profile (name, email, city, profile photo). | Should Have |
| FR-AUTH-012 | The system shall allow users to delete their account, which triggers soft deletion and data anonymization within 30 days. | Should Have |

### 2.2 Café Management

| ID | Requirement | Priority |
|----|------------|----------|
| FR-CAFE-001 | The system shall allow an owner to create a café profile with: name, description, address, city, area, latitude, longitude, phone number, photos (up to 10), amenities list, and operating hours. | Must Have |
| FR-CAFE-002 | The system shall geocode the café address to obtain latitude and longitude if not provided manually. | Must Have |
| FR-CAFE-003 | The system shall allow an owner to update their café profile at any time. | Must Have |
| FR-CAFE-004 | The system shall store café operating hours as day-of-week schedules with opening and closing times. | Must Have |
| FR-CAFE-005 | The system shall allow an owner to mark their café as temporarily closed. | Must Have |
| FR-CAFE-006 | The system shall require admin verification before a new café profile becomes visible to gamers. | Must Have |
| FR-CAFE-007 | The system shall allow admins to approve or reject café profiles with an optional rejection reason. | Must Have |
| FR-CAFE-008 | The system shall display only verified cafés to gamers in search results and on the map. | Must Have |
| FR-CAFE-009 | The system shall allow gamers to search for cafés by city, area, and café name. | Must Have |
| FR-CAFE-010 | The system shall allow gamers to filter cafés by: hardware tier type, price range, rating, amenities, and distance. | Must Have |
| FR-CAFE-011 | The system shall display cafés on a map with location markers. | Must Have |
| FR-CAFE-012 | The system shall sort search results by relevance, distance, rating, or price. | Should Have |
| FR-CAFE-013 | The system shall display a café profile page with all details, hardware tiers, active promotions, and reviews. | Must Have |
| FR-CAFE-014 | The system shall calculate and display the average rating for each café based on submitted reviews. | Must Have |

### 2.3 Hardware Tier Management

| ID | Requirement | Priority |
|----|------------|----------|
| FR-HW-001 | The system shall allow an owner to create hardware tiers for their café. Each tier has: name, description, GPU model, CPU model, RAM, monitor refresh rate, monitor resolution, and quantity (number of machines in this tier). | Must Have |
| FR-HW-002 | The system shall allow an owner to set per-hour pricing for each hardware tier. | Must Have |
| FR-HW-003 | The system shall allow an owner to update hardware tier details and pricing. | Must Have |
| FR-HW-004 | The system shall allow an owner to deactivate a hardware tier (removes it from booking availability without deleting historical data). | Must Have |
| FR-HW-005 | The system shall prevent bookings for a deactivated hardware tier. | Must Have |
| FR-HW-006 | The system shall display hardware tier specifications and pricing on the café profile page. | Must Have |
| FR-HW-007 | The system shall support predefined tier templates (Standard, Premium, PS5, VIP) that owners can customize. | Could Have |

### 2.4 Booking

| ID | Requirement | Priority |
|----|------------|----------|
| FR-BOOK-001 | The system shall allow a gamer to make a reservation by selecting: café, date, start time, duration (in 1-hour increments), and hardware tier. | Must Have |
| FR-BOOK-002 | The system shall check hardware tier availability before allowing a booking. Availability is determined by: (tier quantity) minus (number of confirmed bookings for that tier in the requested time window). | Must Have |
| FR-BOOK-003 | The system shall calculate the total booking amount: (hourly rate × duration) + convenience fee − applicable promotion discount. | Must Have |
| FR-BOOK-004 | The system shall apply any active promotion discount automatically if the booking time falls within the promotion window. | Must Have |
| FR-BOOK-005 | The system shall block bookings outside the café's operating hours. | Must Have |
| FR-BOOK-006 | The system shall enforce a minimum advance booking time of 30 minutes before session start. | Must Have |
| FR-BOOK-007 | The system shall enforce a maximum advance booking window of 7 days. | Must Have |
| FR-BOOK-008 | The system shall generate a unique booking confirmation code (alphanumeric, 8 characters) for each confirmed booking. | Must Have |
| FR-BOOK-009 | The system shall generate a QR code containing the booking confirmation code for easy check-in. | Must Have |
| FR-BOOK-010 | The system shall allow a gamer to cancel an upcoming booking. Cancellation is subject to the cancellation policy (see Business Rules). | Must Have |
| FR-BOOK-011 | The system shall allow a gamer to view their booking history with filters for status (upcoming, completed, cancelled, no-show). | Must Have |
| FR-BOOK-012 | The system shall allow an owner to view all bookings for their café with filters for date, status, and hardware tier. | Must Have |
| FR-BOOK-013 | The system shall allow an owner to mark a booking as "checked in" when the gamer arrives. | Must Have |
| FR-BOOK-014 | The system shall allow an owner to mark a booking as "no-show" if the gamer does not arrive within 15 minutes of the session start time. | Must Have |
| FR-BOOK-015 | The system shall automatically mark a booking as "completed" when the session end time is reached and the booking was checked in. | Must Have |
| FR-BOOK-016 | The system shall prevent double-booking. If a tier's capacity is fully booked for a time slot, no additional bookings shall be accepted. | Must Have |
| FR-BOOK-017 | The system shall allow booking durations of 1, 2, 3, 4, 5, or 6 hours. | Must Have |

### 2.5 Payment

| ID | Requirement | Priority |
|----|------------|----------|
| FR-PAY-001 | The system shall integrate with Razorpay for payment processing. | Must Have |
| FR-PAY-002 | The system shall create a Razorpay order when a gamer initiates a booking. | Must Have |
| FR-PAY-003 | The system shall support payment via UPI, debit/credit cards, net banking, and wallets through Razorpay. | Must Have |
| FR-PAY-004 | The system shall verify payment completion via Razorpay webhooks before confirming a booking. | Must Have |
| FR-PAY-005 | The system shall handle payment failures gracefully. If payment fails, the booking shall remain in "payment_pending" state and the gamer can retry. | Must Have |
| FR-PAY-006 | The system shall process refunds through Razorpay when a booking is cancelled per the cancellation policy. | Must Have |
| FR-PAY-007 | The system shall add a convenience fee (percentage or flat amount, configurable) to every booking. | Must Have |
| FR-PAY-008 | The system shall display the convenience fee transparently in the booking summary before payment. | Must Have |
| FR-PAY-009 | The system shall calculate and include GST (18%) on the convenience fee. | Must Have |
| FR-PAY-010 | The system shall store a complete payment record for every transaction including: amount, convenience fee, GST, discount applied, payment gateway reference, and status. | Must Have |
| FR-PAY-011 | The system shall support partial refunds for late cancellations. | Should Have |
| FR-PAY-012 | The system shall implement idempotency for payment operations to prevent duplicate charges. | Must Have |

### 2.6 Promotion

| ID | Requirement | Priority |
|----|------------|----------|
| FR-PROMO-001 | The system shall allow an owner to create a promotion with: title, description, hardware tier, discount percentage, start date, end date, applicable time window (e.g., 2 PM–5 PM), and applicable days of week. | Must Have |
| FR-PROMO-002 | The system shall allow an owner to publish, pause, and end a promotion. | Must Have |
| FR-PROMO-003 | The system shall automatically apply promotion discounts to bookings that fall within the promotion's time window, date range, and hardware tier. | Must Have |
| FR-PROMO-004 | The system shall prevent overlapping promotions for the same hardware tier and time window. | Must Have |
| FR-PROMO-005 | The system shall display active promotions on the café profile page. | Must Have |
| FR-PROMO-006 | The system shall display active promotions from nearby cafés on the gamer's home screen. | Should Have |
| FR-PROMO-007 | The system shall send notifications to nearby gamers when a new promotion is published. | Should Have |
| FR-PROMO-008 | The system shall enforce a maximum discount percentage (configurable, default 50%). | Must Have |
| FR-PROMO-009 | The system shall automatically expire promotions when the end date is reached. | Must Have |
| FR-PROMO-010 | The system shall track promotion performance: number of bookings generated, revenue impact. | Should Have |

### 2.7 Review

| ID | Requirement | Priority |
|----|------------|----------|
| FR-REV-001 | The system shall allow a gamer to submit a review for a café after completing a booking. | Should Have |
| FR-REV-002 | Each review shall include: a rating (1–5 stars) and an optional text comment (max 500 characters). | Should Have |
| FR-REV-003 | The system shall allow only one review per booking. | Should Have |
| FR-REV-004 | The system shall allow a gamer to edit their review within 24 hours of submission. | Should Have |
| FR-REV-005 | The system shall calculate and update the café's average rating whenever a new review is submitted. | Should Have |
| FR-REV-006 | The system shall allow owners to report inappropriate reviews. Reported reviews are flagged for admin moderation. | Should Have |
| FR-REV-007 | The system shall allow admins to remove reviews that violate content guidelines. | Should Have |

### 2.8 Notification

| ID | Requirement | Priority |
|----|------------|----------|
| FR-NOTIF-001 | The system shall send an SMS notification to the gamer upon booking confirmation. | Must Have |
| FR-NOTIF-002 | The system shall send a push notification to the gamer 30 minutes before the booked session. | Should Have |
| FR-NOTIF-003 | The system shall send an SMS notification to the owner when a new booking is made. | Must Have |
| FR-NOTIF-004 | The system shall send an SMS notification to the gamer when a booking is cancelled and refund is initiated. | Must Have |
| FR-NOTIF-005 | The system shall send an in-app notification to the gamer when a nearby café publishes a new promotion. | Should Have |
| FR-NOTIF-006 | The system shall send an email receipt to the gamer after successful payment. | Should Have |
| FR-NOTIF-007 | The system shall allow users to manage their notification preferences (opt-in/opt-out per channel). | Should Have |

### 2.9 Admin

| ID | Requirement | Priority |
|----|------------|----------|
| FR-ADMIN-001 | The system shall provide an admin dashboard with platform-wide analytics: total users, cafés, bookings, GMV, and active promotions. | Must Have |
| FR-ADMIN-002 | The system shall allow admins to view, search, and filter all users (gamers and owners). | Must Have |
| FR-ADMIN-003 | The system shall allow admins to suspend or ban user accounts with a reason. | Must Have |
| FR-ADMIN-004 | The system shall allow admins to view all bookings with filters for café, date range, status, and city. | Must Have |
| FR-ADMIN-005 | The system shall allow admins to approve or reject pending café verifications. | Must Have |
| FR-ADMIN-006 | The system shall allow admins to view and moderate flagged reviews. | Should Have |
| FR-ADMIN-007 | The system shall allow admins to view and manage promotions across all cafés. | Should Have |
| FR-ADMIN-008 | The system shall log all admin actions for audit purposes. | Should Have |

### 2.10 Session

| ID | Requirement | Priority |
|----|------------|----------|
| FR-SESS-001 | The system shall create a session record when a booking is checked in by the owner. | Must Have |
| FR-SESS-002 | The session shall track: start time, expected end time, actual end time, hardware tier, and assigned machine (optional, free-text). | Must Have |
| FR-SESS-003 | The system shall automatically mark a session as completed when the expected end time is reached. | Must Have |
| FR-SESS-004 | The system shall allow an owner to end a session early (e.g., if the gamer leaves before the booked end time). | Should Have |
| FR-SESS-005 | The system shall allow an owner to extend a session if the gamer wants to continue and the tier has availability. | Could Have |

---

## 3. Non-Functional Requirements

### 3.1 Performance

| ID | Requirement |
|----|------------|
| NFR-PERF-001 | API response time for read operations (search, list, get) shall be under 200ms at the 95th percentile under normal load. |
| NFR-PERF-002 | API response time for write operations (create booking, process payment) shall be under 500ms at the 95th percentile under normal load. |
| NFR-PERF-003 | The system shall support at least 500 concurrent users without degradation. |
| NFR-PERF-004 | Search results (café discovery) shall be returned within 300ms including database query and serialization. |
| NFR-PERF-005 | The system shall handle at least 100 bookings per minute at peak load. |

### 3.2 Scalability

| ID | Requirement |
|----|------------|
| NFR-SCALE-001 | The system shall be designed as a modular monolith that can be decomposed into services later if needed. |
| NFR-SCALE-002 | Database design shall support horizontal read scaling via read replicas. |
| NFR-SCALE-003 | The system shall use connection pooling for database connections. |
| NFR-SCALE-004 | The system shall support stateless API servers, allowing horizontal scaling behind a load balancer. |
| NFR-SCALE-005 | Background tasks (notifications, analytics aggregation) shall be decoupled from request processing. |

### 3.3 Availability

| ID | Requirement |
|----|------------|
| NFR-AVAIL-001 | The system shall target 99.5% uptime (approximately 44 hours downtime per year). |
| NFR-AVAIL-002 | Planned maintenance windows shall be scheduled during 2 AM–5 AM IST. |
| NFR-AVAIL-003 | The system shall implement health check endpoints for all critical services. |
| NFR-AVAIL-004 | Database backups shall be taken daily with point-in-time recovery capability for 7 days. |

### 3.4 Security

| ID | Requirement |
|----|------------|
| NFR-SEC-001 | All API communication shall be over HTTPS (TLS 1.2+). |
| NFR-SEC-002 | All passwords (admin accounts) shall be hashed using bcrypt with a cost factor of at least 12. |
| NFR-SEC-003 | JWT tokens shall be signed using RS256 or HS256 with a secret of at least 256 bits. |
| NFR-SEC-004 | All user input shall be validated and sanitized before processing. |
| NFR-SEC-005 | SQL queries shall use parameterized queries or ORM-generated queries to prevent SQL injection. |
| NFR-SEC-006 | API rate limiting shall be enforced: 100 requests per minute per IP for unauthenticated endpoints, 300 requests per minute per user for authenticated endpoints. |
| NFR-SEC-007 | PII (phone numbers, email addresses, PAN numbers) shall be encrypted at rest. |
| NFR-SEC-008 | Payment card data shall never be stored on KHEL-O servers. All card processing is handled by Razorpay. |
| NFR-SEC-009 | Admin actions shall be logged in an immutable audit log. |
| NFR-SEC-010 | CORS policy shall restrict access to known frontend domains only. |

### 3.5 Compliance

| ID | Requirement |
|----|------------|
| NFR-COMP-001 | The system shall comply with the Indian Information Technology Act, 2000 and its amendments. |
| NFR-COMP-002 | The system shall comply with GST regulations for digital convenience fees (18% GST on service fees). |
| NFR-COMP-003 | The system shall comply with RBI guidelines for online payment processing (via Razorpay's compliance). |
| NFR-COMP-004 | The system shall provide a mechanism for users to request deletion of their personal data (Right to be Forgotten). |
| NFR-COMP-005 | The system shall display clear terms of service and privacy policy before user registration. |

### 3.6 Usability

| ID | Requirement |
|----|------------|
| NFR-USE-001 | The gamer-facing application shall be responsive and usable on devices with screen widths from 320px to 1920px. |
| NFR-USE-002 | Critical user flows (registration, search, booking, payment) shall be completable within 5 screen transitions. |
| NFR-USE-003 | Form validation errors shall be displayed inline next to the relevant field. |
| NFR-USE-004 | The system shall display loading indicators for all asynchronous operations. |
| NFR-USE-005 | The system shall work on the latest two versions of Chrome, Safari, Firefox, and Samsung Internet. |

### 3.7 Reliability

| ID | Requirement |
|----|------------|
| NFR-REL-001 | The system shall implement retry logic for external service calls (SMS, payment gateway) with exponential backoff. |
| NFR-REL-002 | Failed payment webhook deliveries from Razorpay shall be handled via Razorpay's automatic retry mechanism plus a manual reconciliation job. |
| NFR-REL-003 | The system shall handle database connection failures gracefully with connection pool recovery. |
| NFR-REL-004 | Background task failures shall be logged and retried up to 3 times before being marked as failed. |

---

## 4. System Constraints

| ID | Constraint |
|----|-----------|
| SC-001 | The backend shall be built using Python 3.11+ with FastAPI. |
| SC-002 | The primary database shall be PostgreSQL 15+. |
| SC-003 | The system shall follow a modular monolith architecture. No microservices in MVP. |
| SC-004 | The API shall follow OpenAPI 3.0+ specification. |
| SC-005 | The system shall be containerized using Docker. |
| SC-006 | The system shall use Redis for caching, session storage, and rate limiting. |
| SC-007 | The frontend shall be a web application. No native mobile apps in MVP. |
| SC-008 | All timestamps shall be stored in UTC and converted to IST for display. |
| SC-009 | All monetary values shall be stored as integers in paisa (1 INR = 100 paisa) to avoid floating-point issues. |
| SC-010 | The system shall support English language only in MVP. |

---

## 5. External Dependencies

| ID | Dependency | Purpose | Fallback |
|----|-----------|---------|----------|
| ED-001 | Razorpay API | Payment processing, refunds, webhooks. | No fallback. Payment is critical path. Alert on failure. |
| ED-002 | SMS Provider (MSG91 / Twilio) | OTP delivery for authentication. | Switch between providers if one fails. |
| ED-003 | Google Maps Platform | Geocoding, map display, distance calculation. | Fallback to OpenStreetMap for map display. Manual lat/long entry. |
| ED-004 | Firebase Cloud Messaging (FCM) | Push notifications. | Degrade to SMS/email for critical notifications. |
| ED-005 | Email Provider (SendGrid / AWS SES) | Transactional emails (receipts, verification). | Queue emails and retry. Non-blocking. |
| ED-006 | Redis | Caching, OTP storage, rate limiting. | Degrade to database-based OTP storage. Performance impact acceptable for MVP. |
| ED-007 | Cloud Object Storage (S3 / GCS) | Café photo storage. | Essential. No fallback. |
