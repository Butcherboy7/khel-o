# Testing Strategy — KHEL-O

## Overview

Testing guidelines, coverage targets, unit testing standards, and integration test setup for the KHEL-O backend and frontend.

---

## 1. Testing Pyramid & Coverage Targets

- **Unit Tests:** 80%+ code coverage for business logic services and DTO validations.
- **Integration Tests:** Coverage for all repository operations using an isolated test PostgreSQL database container (Testcontainers / Docker).
- **API E2E Tests:** Complete execution of critical HTTP routes (Auth -> Search -> Book -> Pay -> Check-in).

---

## 2. Sample Backend Test Case (Pytest + FastAPI TestClient)

```python
import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_create_booking_availability_check(async_client: AsyncClient, gamer_auth_header: dict):
    payload = {
        "cafeId": "c1f7a091-628d-4b82-990a-5b1cfd52a230",
        "hardwareTierId": "t1f7a091-628d-4b82-990a-5b1cfd52a230",
        "bookingDate": "2026-02-10",
        "startTime": "14:00",
        "durationHours": 2
    }
    response = await async_client.post("/api/v1/bookings", json=payload, headers=gamer_auth_header)
    assert response.status_code == 201
    data = response.json()
    assert data["success"] is True
    assert data["data"]["status"] == "payment_pending"
```
