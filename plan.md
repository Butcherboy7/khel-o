# KHEL Product Stabilization Sprint — Master Implementation Plan (`plan.md`)

**Target Repository**: `https://github.com/Butcherboy7/khel-o`  
**Current Status**: 5 / 8 Phases Completed (100% Green Test Suite)

---

## 🎯 Executive Sprint Dashboard

| Phase | Description | Status | Test Coverage |
| :--- | :--- | :--- | :--- |
| **Phase 0** | Codebase Audit & Q&A Discovery | ✅ **COMPLETED** | Audit Matrix Verified |
| **Phase 1a** | Baseline Smoke Safety Net & Seed Accounts | ✅ **COMPLETED** | 5 Playwright E2E + 2 Pytest |
| **Phase 1b** | Role Architecture & `user_roles` Join Table | ✅ **COMPLETED** | 6 Pytest + Dry-Run Row Counts |
| **Phase 2** | Café Onboarding, DTO Schema & 422 Fixes | ✅ **COMPLETED** | 7 Pytest + OpenAPI DTOs |
| **Phase 3** | Customer ↔ Owner Dual Role & Role Switcher | ✅ **COMPLETED** | 9 Pytest + 8 Playwright E2E |
| **Phase 4** | Inventory Allocation Engine (`total_seats`) | ⏳ **NEXT IN QUEUE** | Pending Implementation |
| **Phase 5** | Staff Management & Scoped Staff Portal | ⏳ **QUEUED** | Pending Implementation |
| **Phase 6** | Payment-Gated QR Pass & Mock Payment Adapter | ⏳ **QUEUED** | Pending Implementation |
| **Phase 7** | State Consistency Audit & Full Verification Pass | ⏳ **QUEUED** | Final Integration Pass |

---

## 📋 Comprehensive Phase Architecture & Technical Specifications

### Phase 0 – System Audit & Discovery
* **Objective**: Audit root causes of known issues: role permission matrices, Pydantic 422 validation errors, pincode/time string formatting, and React 18 `StrictMode` race conditions.
* **Deliverables**: Audit breakdown, Q&A alignment on multi-role join table strategy, and explicit business rules.

### Phase 1a – Baseline Smoke Safety Net & Test Accounts Setup
* **Objective**: Build local test safety net to guarantee zero regressions on customer booking flows.
* **Deliverables**:
  * `frontend/playwright.config.ts` configured with `msedge` channel for native Windows execution.
  * Idempotent test account seed script (`backend/scripts/seed_test_accounts.py`).
  * 5-test Playwright customer flow smoke suite (`frontend/e2e/customer_flow.spec.ts`).

### Phase 1b – Role Architecture Refactor & Backend Security Guards
* **Objective**: Migrate from legacy scalar roles to venue-scoped multi-role model without session invalidation.
* **Deliverables**:
  * `UserRoleMapping` SQLAlchemy model (`user_roles` join table: `id`, `user_id`, `role`, `cafe_id` nullable, `created_at`).
  * Migration script `backend/scripts/run_role_migration.py` with upgrade, downgrade rollback, and idempotency checks (37 users → 43 role mappings, 0 data loss).
  * Global suspended cafe lock in `require_cafe_owner` and `CafeService.update_cafe` (rejecting `SUSPENDED` venue modifications with HTTP 403 `CAFE_SUSPENDED`).
  * Bi-directional dual-write role sync and dual-read JWT authentication.

### Phase 2 – Café Onboarding & Validation Fixes
* **Objective**: End-to-end type safety and zero 422 onboarding submit errors.
* **Deliverables**:
  * Generated frontend TypeScript DTOs from FastAPI schema (`src/types/api-generated.ts`).
  * Required `pincode` validation, time string format `"09:00:00"`, and numeric tier rates.
  * React 18 `StrictMode` draft loading race condition fix (`isMounted` flag & `AbortController`).
  * Business PAN regex validation (`/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/`).

### Phase 3 – Customer ↔ Owner Dual Role Integration & Switcher
* **Objective**: Enable multi-role users (Gamer + Verified Owner) to seamlessly toggle portal modes.
* **Deliverables**:
  * Backend API `POST /api/v1/auth/switch-role` with `ROLE_NOT_GRANTED` 403 guard for unverified accounts.
  * Zustand `authStore.ts` `activeRole` state with localStorage persistence.
  * `RoleSwitcher` UI component integrated in CustomerShell and OwnerShell.

---

### ⏳ Remaining Phase Detailed Specifications

### Phase 4 – Inventory Allocation Engine (`total_seats = app_bookable_seats + reserved_walkin_seats`)
* **Goal**: Prevent venue overbooking between online app gamers and offline walk-ins.
* **Specification**:
  * Enforce invariant: `total_seats = app_bookable_seats + reserved_walkin_seats`.
  * Update `Cafe` model and `HardwareTier` model with explicit seat allocation fields.
  * Implement concurrent time-slot availability checking in `BookingService.create_booking`.
  * Add unit tests verifying that booking requests exceeding `app_bookable_seats` return `HTTP 400` / `HTTP 422`.

### Phase 5 – Staff Management & Scoped Staff Operational Portal
* **Goal**: Enable venue owners to invite staff while strictly scoping operational capabilities.
* **Specification**:
  * `POST /api/v1/owner/staff` invitation and assignment endpoint.
  * Restricted navigation shell (`staffNavItems`) for staff accounts.
  * Enforce permission guard: Staff can check-in bookings and view active stations, but cannot view financial payouts, edit hardware pricing, or delete venue settings.

### Phase 6 – Payment-Gated QR Synchronization & Mock Payment Adapter
* **Goal**: Secure check-in passes so QR codes are generated ONLY after verified payment.
* **Specification**:
  * Mock Razorpay payment adapter & webhook handler (`/api/v1/payments/webhook`).
  * Status transition: `PENDING_PAYMENT` → `CONFIRMED` upon payment capture signature verification.
  * Block pass QR generation for unpaid or canceled bookings.

### Phase 7 – State Consistency Audit & Full Verification Pass
* **Goal**: End-to-end stabilization audit across all 8 phases.
* **Specification**:
  * Re-run full Pytest backend test suite.
  * Re-run full Playwright E2E customer and owner test suites.
  * Produce final walkthrough demonstration report.

---

## 🚀 How to Resume Execution & Push to GitHub

### 1. Push All Completed Work to GitHub Repository
Run these commands in PowerShell from the project root directory (`c:\Users\Sathvik\Desktop\khel-o`):

```powershell
# Verify current branch is main and status is clean
git checkout main
git status

# Push all completed commits to GitHub remote
git push origin main
```

### 2. Begin Next Phase (Phase 4)
When you resume work in your next session:

```powershell
# Create dedicated branch for Phase 4
git checkout -b phase-4-inventory-engine

# Verify current safety net test suites before starting
# Backend Pytest (9 tests)
cd backend
$env:PYTHONPATH='.'; .\venv\Scripts\pytest.exe

# Frontend Playwright E2E (8 tests)
cd ..\frontend
npx playwright test
```

Tell the agent: **"Proceed with Phase 4 (Inventory Allocation Engine)"**.
