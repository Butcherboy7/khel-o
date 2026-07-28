# Coding Standards — KHEL-O

## Overview

Single source of truth for coding patterns, conventions, and tool configurations across the codebase.

---

## 1. Tooling & Enforcement

- **Python Version:** 3.11+
- **Linter & Formatter:** Ruff & Black
- **Type Checker:** mypy (strict mode enabled)

---

## 2. Naming Conventions

- Files/Modules: `snake_case.py`
- Pydantic DTOs: `PascalCase` ending with `RequestDTO` or `ResponseDTO`
- Services/Repositories: `PascalCase` ending with `Service` or `Repository`

---

## 3. Mandatory Repository & Service Pattern Code Example

```python
# Repository Pattern Implementation
class BaseRepository(Generic[ModelType]):
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, id: UUID) -> Optional[ModelType]:
        result = await self.db.execute(select(self.model).where(self.model.id == id))
        return result.scalars().first()

# Service Implementation
class BookingService:
    def __init__(self, booking_repo: BookingRepository, cafe_repo: CafeRepository):
        self.booking_repo = booking_repo
        self.cafe_repo = cafe_repo

    async def create_booking(self, user_id: UUID, dto: CreateBookingRequestDTO) -> BookingResponseDTO:
        # Domain logic execution
        ...
```
