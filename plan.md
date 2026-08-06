# KHEL Product Stabilization Sprint — Master Implementation Plan (`plan.md`)

**Target Repository**: `https://github.com/Butcherboy7/khel-o`  
**Current Status**: Phase 1 & Phase 2 Core Stabilization Completed (100% Green Test Suite: 24 Pytest + 11 Playwright E2E)

---

## 🎯 Executive Sprint Dashboard

| Phase | Description | Status | Test Coverage |
| :--- | :--- | :--- | :--- |
| **Phase 0** | Codebase Audit & Q&A Discovery | ✅ **COMPLETED** | Audit Matrix Verified |
| **Phase 1a** | Baseline Smoke Safety Net & Seed Accounts | ✅ **COMPLETED** | 5 Playwright E2E + 2 Pytest |
| **Phase 1b** | Role Architecture & `user_roles` Join Table | ✅ **COMPLETED** | 6 Pytest + Dry-Run Row Counts |
| **Phase 2** | Café Onboarding, DTO Schema & 422 Fixes | ✅ **COMPLETED** | 7 Pytest + OpenAPI DTOs |
| **Phase 3** | Customer ↔ Owner Dual Role & Role Switcher | ✅ **COMPLETED** | 13 Pytest + 8 Playwright E2E |
| **Phase 4** | Inventory Allocation Engine (`total_seats`) | ✅ **COMPLETED** | Inventory Pytest + TTL Overlap Suite |
| **Phase 5** | Staff Management & Scoped Staff Portal | ✅ **COMPLETED** | Staff Invitation & IDOR Pytest |
| **Phase 6** | Payment-Gated QR Pass & Mock Payment Adapter | ✅ **COMPLETED** | Payment Webhook & QR Pass Pytest |
| **Phase 7** | State Consistency Audit & Full Verification Pass | ✅ **COMPLETED** | 22 Pytest + 8 Playwright E2E |
| **Phase 8** | Tier A Cosmetic Baseline & `<Price>` Component | ✅ **COMPLETED** | Shared `<Price>` UI formatting |
| **Phase 9** | Tier B Core Defect Fixes & Browser Safety Net | ✅ **COMPLETED** | 24 Pytest + 11 Playwright E2E (100% Green) |
| **Phase 10** | Tier B Cross-Role Synchronization E2E Suite | ⏳ **IN REVIEW** | `cross_role_sync.spec.ts` (Next Step) |
| **Phase 11** | Tier C Hardware Specs & Custom Game Features | 📋 **PLANNED** | Searchable Specs & Presets |

---

## 📋 Comprehensive Phase Architecture & Technical Specifications

### Phase 8 – Tier A Cosmetic Baseline Fixes
* **Objective**: Systemic UI consistency across price displays, symbol sizing, layout shifts, and scroll restoration.
* **Deliverables**:
  * Shared `<Price>` component ([`PriceDisplay.tsx`](file:///c:/Users/Sathvik/Desktop/khel-o/frontend/src/components/ui/PriceDisplay.tsx)) with clean `.rupee-symbol` font rendering.
  * Uniform currency formatting across Customer, Owner, and Admin views.

### Phase 9 – Tier B Core Defect Fixes & Safety Net
* **Objective**: Resolve state and authorization defects with complete Pytest & Playwright browser test coverage.
* **Deliverables**:
  * **Admin Approval HTTP 405 Fix**: Aligned API verb in [`admin.ts`](file:///c:/Users/Sathvik/Desktop/khel-o/frontend/src/lib/api/admin.ts) to `PATCH`. Added [`admin_approval.spec.ts`](file:///c:/Users/Sathvik/Desktop/khel-o/frontend/e2e/admin_approval.spec.ts).
  * **Razorpay Mock Key Cleanup**: Removed hardcoded key check `rzp_test_TLE0crqcVjU4ZB` from [`useRazorpay.ts`](file:///c:/Users/Sathvik/Desktop/khel-o/frontend/src/hooks/useRazorpay.ts); mock interception is governed exclusively by `NEXT_PUBLIC_ENABLE_SANDBOX_MOCK_PAYMENTS` or explicit `rzp_test_mock_` prefix.
  * **Booking Cancellation `NameError` Fix**: Fixed uninitialized `now_utc` variable scope in [`booking_service.py`](file:///c:/Users/Sathvik/Desktop/khel-o/backend/app/services/booking_service.py). Added [`cancellation.spec.ts`](file:///c:/Users/Sathvik/Desktop/khel-o/frontend/e2e/cancellation.spec.ts).
  * **Emergency Mode Dual-Layer Guard**: Enforced `is_emergency_mode` check in `BookingService.create_booking` (`HTTP 400 EMERGENCY_MODE_ACTIVE`) and filtered out emergency venues in `CafeRepository.flex_search_verified`. Added [`emergency_mode.spec.ts`](file:///c:/Users/Sathvik/Desktop/khel-o/frontend/e2e/emergency_mode.spec.ts).

### Phase 10 – Tier B Cross-Role Synchronization E2E Suite (Next Phase)
* **Goal**: Validate multi-role state flow end-to-end: Admin approve -> Owner set inventory -> Gamer book & pay -> Staff check-in -> Real-time analytics update.
* **Specification**:
  * Create `frontend/e2e/cross_role_sync.spec.ts` asserting synchronous DB transaction updates for owner revenue, booking count, and admin GMV.

### Phase 11 – Tier C Feature Sequencing (Post-Stabilization)
* **Goal**: Net-new UI capabilities once Tier B is completely stable.
* **Specification**:
  * Searchable GPU/CPU hardware spec dropdowns.
  * Hardware preset packages (e.g. Esports Standard, Streamer Tier).
  * Custom game input options.

---

## 🚀 How to Resume Execution on Home PC

1. **Pull Latest Changes from GitHub Remote**:
   ```powershell
   git checkout main
   git pull origin main
   ```

2. **Verify Test Safety Net**:
   ```powershell
   # Backend Pytest (24 tests)
   cd backend
   $env:PYTHONPATH='.'
   .\venv\Scripts\pytest.exe -v

   # Frontend Playwright E2E (11 tests)
   cd ..\frontend
   npx playwright test
   ```

3. **Tell the Agent on your Home PC**:
   **"Proceed with Phase 10 (Tier B Cross-Role Synchronization E2E Suite)"**.
