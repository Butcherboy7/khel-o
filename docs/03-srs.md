# Software Requirements Specification — KHEL-O

## 1. Functional Requirements

### 1.1 Authentication & Identity Management

| ID | Requirement | Priority |
|----|------------|----------|
| FR-AUTH-001 | The system shall support Google OAuth 2.0 as the primary authentication method for Gamers and Café Owners. | Must Have |
| FR-AUTH-002 | The system shall support Email and Password as a secondary authentication method. | Must Have |
| FR-AUTH-003 | Email address shall be required and unique for all user accounts. | Must Have |
| FR-AUTH-004 | Mobile phone numbers shall be voluntarily collected during profile setup or checkout and stored without OTP verification. | Should Have |
| FR-AUTH-005 | The system shall issue JWT access tokens (15-minute validity) and refresh tokens (30-day validity) upon authentication. | Must Have |
| FR-AUTH-006 | Admin users shall authenticate via Email + Password with mandatory Multi-Factor Authentication (MFA). | Must Have |

### 1.2 Payments & Refunds

| ID | Requirement | Priority |
|----|------------|----------|
| FR-PAY-001 | The system shall integrate with Razorpay for payment processing (UPI, Cards, Net Banking). | Must Have |
| FR-PAY-002 | The payment gateway processing fee (~2%) shall be passed through transparently to the gamer at checkout with explicit breakdown. | Must Have |
| FR-PAY-003 | The platform shall charge zero convenience fees and zero commission to café owners during the MVP launch phase. | Must Have |
| FR-PAY-004 | The system shall support full refunds for cancellations made more than 2 hours prior to session start time. | Must Have |
| FR-PAY-005 | Cancellations made less than 2 hours before session start time shall receive zero refund (no partial refunds in MVP). | Must Have |
| FR-PAY-006 | The system shall generate a server-side static QR code encoding booking ID and café ID upon payment capture. | Must Have |

### 1.3 Notifications

| ID | Requirement | Priority |
|----|------------|----------|
| FR-NOTIF-001 | The system shall send transactional booking confirmations and payment receipts via Resend (Email). | Must Have |
| FR-NOTIF-002 | The system shall send pre-session reminders (T-30 mins) via Email and Web Push notifications. | Must Have |
| FR-NOTIF-003 | The system shall support Web Push (FCM) notifications for PWA users for flash deals and session alerts. | Should Have |

### 1.4 Platform & Delivery (PWA)

| ID | Requirement | Priority |
|----|------------|----------|
| FR-PLAT-001 | The application shall be delivered as a Progressive Web App (PWA) optimized for mobile browsers (375px base width). | Must Have |
| FR-PLAT-002 | The PWA shall support service-worker-based installation and Web Push notifications on Android devices. | Must Have |
