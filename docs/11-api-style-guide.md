# API Style Guide — KHEL-O

## Overview

This style guide establishes explicit conventions for designing RESTful APIs across all endpoints in KHEL-O. Compliance with this document is mandatory for every API definition and implementation.

---

## 1. Case Conventions & Boundaries

| Layer | Case Convention | Example |
|-------|----------------|---------|
| Database tables & columns | `snake_case` | `hardware_tier_id`, `created_at` |
| Internal Python code (variables/functions) | `snake_case` | `calculate_convenience_fee()` |
| Python Pydantic Models & Classes | `PascalCase` | `BookingResponseDTO` |
| API Path Parameters & Query Params | `snake_case` | `/api/v1/cafes/{cafe_id}?start_date=2026-01-15` |
| JSON Request & Response Envelopes | `camelCase` | `hardwareTierId`, `pricePerHour` |

### Key Rule for Field Naming Boundaries
All external JSON inputs and outputs must be formatted in **`camelCase`**. Pydantic v2 automatically aliases database `snake_case` model attributes to API `camelCase` using `alias_generator = to_camel`.

---

## 2. API Versioning & URL Structure

- Base URL pattern: `/api/v{version}/{domain_plural}`
- All paths must use lower-case plural nouns for resources (e.g. `/cafes`, `/bookings`).
- Example endpoints:
  - `GET /api/v1/cafes`
  - `POST /api/v1/bookings`
  - `GET /api/v1/cafes/{cafe_id}/hardware-tiers`

---

## 3. HTTP Methods & Status Codes

| HTTP Method | Operation | Success Code | Error Code |
|-------------|-----------|--------------|------------|
| `GET` | Read resource/collection | `200 OK` | `404 Not Found` |
| `POST` | Create resource | `201 Created` | `400 Bad Request`, `422 Unprocessable` |
| `PUT` | Complete update / Replace | `200 OK` | `400 Bad Request`, `404 Not Found` |
| `PATCH` | Partial update | `200 OK` | `400 Bad Request`, `404 Not Found` |
| `DELETE` | Soft delete / Remove | `200 OK` or `204 No Content` | `404 Not Found` |

### Standard Status Codes
- `200 OK`: Request succeeded.
- `201 Created`: Resource successfully created.
- `204 No Content`: Successful deletion or action with no response body.
- `400 Bad Request`: Malformed JSON or domain validation failure.
- `401 Unauthorized`: Missing or invalid JWT auth token.
- `403 Forbidden`: Authenticated user lacks permission (RBAC failure).
- `404 Not Found`: Requested resource ID does not exist.
- `409 Conflict`: Conflict state (e.g., tier booking overlap).
- `422 Unprocessable Entity`: Request body failed schema validation.
- `429 Too Many Requests`: Rate limit exceeded.
- `500 Internal Server Error`: Unhandled server exception.

---

## 4. Response Envelope Format

All success responses (single object or list) must follow a standard JSON envelope:

### Single Entity Response
```json
{
  "success": true,
  "data": {
    "id": "c1f7a091-628d-4b82-990a-5b1cfd52a230",
    "name": "GG Zone",
    "averageRating": 4.85
  },
  "error": null,
  "meta": {
    "timestamp": "2026-01-15T10:30:00Z",
    "requestId": "req_8f11c79a"
  }
}
```

### Paginated List Response
```json
{
  "success": true,
  "data": [
    {
      "id": "c1f7a091-628d-4b82-990a-5b1cfd52a230",
      "name": "GG Zone"
    }
  ],
  "error": null,
  "meta": {
    "page": 1,
    "pageSize": 20,
    "totalCount": 142,
    "totalPages": 8,
    "timestamp": "2026-01-15T10:30:00Z",
    "requestId": "req_8f11c79a"
  }
}
```

---

## 5. Standard Error Response Envelope Format

All error responses return `success: false` and populate the structured `error` object.

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "BOOKING_TIER_FULLY_BOOKED",
    "message": "The selected hardware tier is fully booked for the requested time slot.",
    "details": [
      {
        "field": "startTime",
        "issue": "14:00 slot has 0 available seats out of 10."
      }
    ]
  },
  "meta": {
    "timestamp": "2026-01-15T10:30:00Z",
    "requestId": "req_8f11c79a"
  }
}
```

---

## 6. Pagination, Filtering, & Sorting Query Parameters

- **Pagination:**
  - Default: `?page=1&page_size=20`
  - Constraints: Max `page_size` = 100.
- **Sorting:**
  - Syntax: `?sort_by=price_per_hour&order=asc` or `?sort_by=-created_at` (prefix `-` for descending).
- **Filtering:**
  - Standard query parameters: `?city=Pune&hardware_tier=premium&min_rating=4.0`

---

## 7. Mandatory Headers

- `Authorization: Bearer <JWT_TOKEN>` (for protected endpoints)
- `X-Request-ID: req_8f11c79a` (for tracing requests)
- `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` (returned in responses)
