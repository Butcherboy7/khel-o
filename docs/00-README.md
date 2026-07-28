# KHEL-O Platform — Documentation Index

## What is this?

This folder contains the complete product, design, and engineering documentation for the KHEL-O platform — a marketplace and demand-generation platform for gaming cafés in India.

Every document in this folder is a living reference. Together, they form the single source of truth for product decisions, engineering architecture, API design, database schema, business rules, and operational standards.

---

## How to read these documents

### If you are a founder or product person

Start here:

1. `01-product-vision.md` — Understand the why.
2. `02-prd.md` — Understand the what.
3. `04-user-personas.md` — Understand the who.
4. `05-user-flows.md` — Understand the how (from the user's perspective).
5. `09-business-rules.md` — Understand the guardrails.

### If you are a backend engineer

Start here:

1. `06-domain-model.md` — The entities you will build.
2. `07-state-machines.md` — How those entities change state.
3. `08-events.md` — What happens when state changes.
4. `10-database-design.md` — How data is stored.
5. `11-api-style-guide.md` — How APIs are designed.
6. `12-api-spec.md` — Every API endpoint.
7. `13-backend-architecture.md` — How the backend is structured.
8. `15-authentication.md` — Auth and RBAC.
9. `25-error-handling.md` — How errors are handled.
10. `21-coding-standards.md` — How code is written.

### If you are a frontend engineer

Start here:

1. `05-user-flows.md` — What users do.
2. `11-api-style-guide.md` — API contract format.
3. `12-api-spec.md` — Every API you will call.
4. `14-frontend-architecture.md` — How the frontend is structured.
5. `15-authentication.md` — Auth handling on the client.

### If you are a DevOps or platform engineer

Start here:

1. `18-logging.md` — Observability standards.
2. `19-security.md` — Security requirements.
3. `23-ci-cd.md` — Pipeline design.
4. `24-deployment.md` — Infrastructure and deployment.

### If you are reviewing a PR

Read:

1. `22-definition-of-done.md` — The checklist.
2. `21-coding-standards.md` — The code style.
3. `20-testing.md` — The testing expectations.

---

## Document Map

| # | File | Title | Description |
|---|------|-------|-------------|
| 00 | `00-README.md` | Documentation Index | This file. Overview of all docs, reading order, and relationships. |
| 01 | `01-product-vision.md` | Product Vision | Problem statement, solution, positioning, philosophy, and guiding principles. |
| 02 | `02-prd.md` | Product Requirements Document | Objectives, success metrics, MVP features, MoSCoW prioritization, and scope boundaries. |
| 03 | `03-srs.md` | Software Requirements Specification | Numbered functional and non-functional requirements, system constraints, and dependencies. |
| 04 | `04-user-personas.md` | User Personas | Detailed profiles of four key personas — two café owners, two gamers. |
| 05 | `05-user-flows.md` | User Flows | Step-by-step user journeys for every major workflow, including error scenarios. |
| 06 | `06-domain-model.md` | Domain Model | Business entity definitions — attributes, relationships, and business rules for every entity. |
| 07 | `07-state-machines.md` | State Machines | State definitions and transitions for Booking, Payment, Promotion, Café Verification, and Session. |
| 08 | `08-events.md` | Event Catalog | Every domain event — trigger, payload, consumers, and side effects. |
| 09 | `09-business-rules.md` | Business Rules | Numbered rules for bookings, promotions, pricing, payments, reviews, and compliance. |
| 10 | `10-database-design.md` | Database Design | Three database versions (v0, v1, v2) with complete PostgreSQL table definitions. |
| 11 | `11-api-style-guide.md` | API Style Guide | URL conventions, HTTP methods, status codes, envelopes, pagination, errors, and versioning. |
| 12 | `12-api-spec.md` | API Specification | Structured list of every API endpoint — method, path, auth, roles, and payloads. |
| 13 | `13-backend-architecture.md` | Backend Architecture | Technology choices, folder structure, layered architecture, DI, middleware, and error strategy. |
| 14 | `14-frontend-architecture.md` | Frontend Architecture | Technology choice, folder structure, state management, routing, and design system. |
| 15 | `15-authentication.md` | Authentication & Authorization | Registration, login, OTP, JWT, RBAC matrix, token strategy, and security considerations. |
| 16 | `16-payments.md` | Payments | Razorpay integration, payment flow, refunds, GST, convenience fees, and idempotency. |
| 17 | `17-notifications.md` | Notifications | Notification types, event triggers, templates, delivery strategy, and provider recommendations. |
| 18 | `18-logging.md` | Logging & Observability | Log levels, structured logging, correlation IDs, what to log, what never to log. |
| 19 | `19-security.md` | Security | Auth security, input validation, rate limiting, CORS, PII handling, and India-specific compliance. |
| 20 | `20-testing.md` | Testing Strategy | Unit tests, integration tests, E2E, naming conventions, coverage targets, and CI gates. |
| 21 | `21-coding-standards.md` | Coding Standards | Python/FastAPI patterns, Pydantic v2, repository pattern, naming conventions, and linting. |
| 22 | `22-definition-of-done.md` | Definition of Done | The checklist every feature must pass before it ships. |
| 23 | `23-ci-cd.md` | CI/CD | Branching strategy, pipeline stages, environment promotion, and GitHub Actions configuration. |
| 24 | `24-deployment.md` | Deployment | Cloud infrastructure, Docker, database hosting, CDN, and scaling considerations. |
| 25 | `25-error-handling.md` | Error Handling | Custom exception hierarchy, HTTP mapping, error envelopes, and client-friendly messages. |

---

## Relationships between documents

```
Product Vision (01)
    └── PRD (02)
        ├── User Personas (04)
        ├── User Flows (05)
        └── Business Rules (09)

Domain Model (06)
    ├── State Machines (07)
    ├── Event Catalog (08)
    └── Database Design (10)

API Style Guide (11)
    └── API Spec (12)

Backend Architecture (13)
    ├── Authentication (15)
    ├── Payments (16)
    ├── Notifications (17)
    ├── Error Handling (25)
    ├── Logging (18)
    └── Security (19)

Frontend Architecture (14)
    └── Authentication (15)

Engineering Standards
    ├── Coding Standards (21)
    ├── Testing Strategy (20)
    ├── Definition of Done (22)
    ├── CI/CD (23)
    └── Deployment (24)
```

---

## Conventions used across all documents

| Context | Convention | Example |
|---------|-----------|---------|
| Database table names | `snake_case` | `hardware_tiers` |
| Database column names | `snake_case` | `created_at` |
| JSON API response fields | `camelCase` | `caféName`, `hardwareTier` |
| Python classes | `PascalCase` | `BookingService` |
| Python files and folders | `snake_case` | `booking_service.py` |
| API URL paths | `kebab-case` or `snake_case` (see API Style Guide) | `/api/v1/cafes/{cafe_id}/hardware-tiers` |

---

## Guiding principle

> Every feature must increase café revenue OR improve player convenience. If it does neither, it does not belong in this platform.
