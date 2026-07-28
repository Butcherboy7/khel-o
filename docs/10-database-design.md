# Database Design & Migration Guide — KHEL-O

## 1. Schema Overview

The database design uses **PostgreSQL 15+** with `snake_case` column naming and exact numeric types for monetary values.

---

## 2. Alembic Migration Guide

### What is Alembic?
Alembic is the lightweight database migration tool for usage with SQLAlchemy. It tracks changes to database models and applies incremental schema updates without destroying existing data.

### Golden Rule of Migrations
> **NEVER edit or alter the database schema manually in SQL or GUI tools.** Always generate, write, test, and apply changes using Alembic migration scripts.

### Common Alembic Commands

```bash
# 1. Generate a new migration script auto-detected from SQLAlchemy models
alembic revision --autogenerate -m "Add new column to cafes"

# 2. Apply pending migrations to update database to latest version
alembic upgrade head

# 3. Roll back the last applied migration
alembic downgrade -1

# 4. View current migration version status
alembic current
```

---

## 3. Database Schema (v0 Initial Version)

See `backend/migrations/versions/001_initial_schema.py` for full DDL definitions including `users`, `cafes`, `hardware_tiers`, `bookings`, `payments`, `promotions`, and `reviews`.
