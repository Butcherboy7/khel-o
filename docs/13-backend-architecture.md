# Backend Architecture — KHEL-O

## Overview

KHEL-O backend is structured as a **Modular Monolith** using **Python 3.11+**, **FastAPI**, **Pydantic v2**, and **SQLAlchemy 2.0 (Async)**. This design provides maximum maintainability, clean separation of concerns, and low operational complexity for the MVP while allowing future extraction of microservices if necessary.

---

## 1. Technology Choices & Justification

- **Language:** Python 3.11+ (High developer velocity, robust ecosystem, async support).
- **Framework:** FastAPI (Native async support, auto OpenAPI generation, high performance via Starlette/uvicorn).
- **ORM & Database:** SQLAlchemy 2.0 (Async DB engine) with asyncpg driver + PostgreSQL 15+.
- **Validation:** Pydantic v2 (Fast Rust-core validation, seamless serialization).
- **Caching & Rate Limiting:** Redis + `redis-py`.
- **Task Queue:** Background tasks via FastAPI `BackgroundTasks` / Celery (Redis broker).

---

## 2. Directory Tree

```
khel_o_backend/
├── app/
│   ├── __init__.py
│   ├── main.py                   # FastAPI initialization & middleware registration
│   ├── core/                     # Core system modules
│   │   ├── config.py             # Pydantic BaseSettings environment config
│   │   ├── database.py           # Async SQLAlchemy engine & session factory
│   │   ├── security.py           # JWT generation, password hashing, encryption
│   │   ├── exceptions.py         # Custom application exceptions
│   │   ├── middleware.py         # Request logging, correlation ID, error handling
│   │   └── logging.py            # Structlog configuration
│   ├── modules/                  # Domain-driven modular components
│   │   ├── auth/
│   │   │   ├── router.py
│   │   │   ├── service.py
│   │   │   ├── repository.py
│   │   │   └── schemas.py
│   │   ├── cafe/
│   │   │   ├── router.py
│   │   │   ├── service.py
│   │   │   ├── repository.py
│   │   │   ├── models.py
│   │   │   └── schemas.py
│   │   ├── booking/
│   │   │   ├── router.py
│   │   │   ├── service.py
│   │   │   ├── repository.py
│   │   │   ├── models.py
│   │   │   └── schemas.py
│   │   ├── payment/
│   │   ├── promotion/
│   │   └── review/
│   └── shared/                   # Shared DTOs and utilities
│       ├── dependencies.py       # Dependency Injection providers
│       └── base_repository.py    # Generic Async SQLAlchemy Repository
├── tests/                        # Pytest suite
│   ├── unit/
│   ├── integration/
│   └── conftest.py
├── migrations/                   # Alembic database migrations
│   └── env.py
├── alembic.ini
├── Dockerfile
├── requirements.txt
└── pyproject.toml
```

---

## 3. Layered Architecture Pattern

All HTTP requests follow a strict unidirectional data flow:

```
[ HTTP Client ]
      │
      ▼
[ Router Layer (FastAPI APIRouter) ] -> Validates Request DTO via Pydantic
      │
      ▼
[ Service Layer (Business Logic) ] -> Applies Business Rules, Manages Transactions
      │
      ▼
[ Repository Layer (Data Access) ] -> Executes Async SQLAlchemy DB Operations
      │
      ▼
[ Database (PostgreSQL) ]
```

### Dependency Injection Pattern in FastAPI
Dependencies are injected using FastAPI `Depends`:

```python
# Example: Service & Repository Dependency Injection
async def get_booking_repository(db: AsyncSession = Depends(get_db_session)) -> BookingRepository:
    return BookingRepository(db)

async def get_booking_service(
    repo: BookingRepository = Depends(get_booking_repository)
) -> BookingService:
    return BookingService(repo)

@router.post("/bookings", response_model=StandardResponse[BookingResponseDTO])
async def create_booking(
    payload: CreateBookingRequestDTO,
    service: BookingService = Depends(get_booking_service),
    current_user: User = Depends(get_current_active_user)
):
    result = await service.create_booking(current_user.id, payload)
    return StandardResponse(data=result)
```
