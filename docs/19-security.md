# Security Architecture — KHEL-O

## Overview

Security principles, input sanitization, rate limiting, and compliance protocols for KHEL-O under the Indian Information Technology Act (2000).

---

## 1. Key Security Measures

- **Transport Security:** Mandatory HTTPS (TLS 1.3 preferred, TLS 1.2 minimum). HSTS headers enforced.
- **SQL Injection Defense:** All database interaction uses SQLAlchemy parameterized ORM queries.
- **Rate Limiting:** Redis token bucket implementation. Public endpoints capped at 100 req/min per IP.
- **Data Protection:** Business PAN numbers and credentials encrypted at rest using AES-256.
- **PII Storage:** Minimal PII retention. Deletion request complies with Right to be Forgotten within 30 days.
