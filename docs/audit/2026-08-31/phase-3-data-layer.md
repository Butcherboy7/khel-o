# Phase 3 — Database Schema, Migrations & Query Performance

**Scope:** Every file in `backend/app/models/` (17 files), every migration in `backend/migrations/versions/` (001–017), `backend/migrations/env.py`, `backend/alembic.ini`, `backend/app/database.py`, every file in `backend/app/repositories/` (15 files). Skimmed `backend/app/services/booking_service.py`, `payment_service.py`, `owner_service.py`, `admin_service.py`, `notification_service.py` for repository call patterns and transaction boundaries, plus `app/api/v1/owner.py` / `auth.py` where they write columns directly.

**Verdict:** The migration chain is linear and unbranched, but it has diverged badly from the ORM models — three whole tables the running code depends on (`user_roles`, `notifications`, `admin_audit_logs`) have no migration at all, nine `cafes` columns exist only in the model, and three PostgreSQL enum types are missing values the code writes on core paths (staff onboarding, café draft creation, booking check-in). A database built by `alembic upgrade head` today would not run this application. Separately, the schema has almost no integrity constraints backing application-layer invariants — most notably `payments.booking_id` has no UNIQUE despite the code assuming one payment per booking, which is a live double-charge and wrong-refund risk. The good news: money is `Numeric(10,2)` everywhere with zero `Float`/`REAL` columns, all timestamps are consistently `DateTime(timezone=True)`, and there are no ORM `relationship()` declarations at all — so there is no classic lazy-load N+1; joins are explicit and list endpoints already batch tier lookups.

## Findings summary

| ID | Sev | Title | File |
|---|---|---|---|
| 3-1 | P0 | Add a UNIQUE constraint on `payments.booking_id` — the one-payment-per-booking rule is app-layer only | `backend/app/models/payment.py:19` |
| 3-2 | P0 | Create migrations for `user_roles`, `notifications`, and `admin_audit_logs` — three tables exist only in the ORM | `backend/migrations/versions/` |
| 3-3 | P1 | Add the missing values to the `userrole`, `verificationstatus`, and `bookingstatus` PG enums | `backend/migrations/versions/001_initial_schema.py:28,55,116` |
| 3-4 | P1 | Migrate the nine `cafes` columns that exist only in the model — café search reads one of them | `backend/app/models/cafe.py:42,50,52-58` |
| 3-5 | P1 | Fix `bookings.checked_in_by` — model says UUID FK, migration created `String(32)` | `backend/migrations/versions/011_add_booking_checkin_fields.py:22` |
| 3-6 | P1 | `bookings.checkin_method` is a native PG enum in the DB but a free `String(50)` in the model | `backend/migrations/versions/006_khelo_v2_schema.py:55` |
| 3-7 | P1 | Booking and its `platform_fees` settlement row are written in two separate commits | `backend/app/services/booking_service.py:206-219` |
| 3-8 | P1 | `platform_fees.booking_id` cascades on delete — deleting a booking destroys the settlement record | `backend/app/models/platform_fee.py:12` |
| 3-9 | P2 | The availability query has no supporting index on `bookings(hardware_tier_id, session_date)` | `backend/app/repositories/booking_repository.py:129-143` |
| 3-10 | P2 | Migration 008 assigns integer `0` to a boolean column — the chain will not replay on a fresh Postgres | `backend/migrations/versions/008_add_booking_controls.py:35` |
| 3-11 | P2 | Every repository `update()` silently drops `None` values — a nullable field can never be cleared | `backend/app/repositories/base.py:28-34` |
| 3-12 | P2 | `Cafe.amenities.contains()` runs against a generic `JSON` column, not JSONB containment | `backend/app/repositories/cafe_repository.py:118-121` |
| 3-13 | P2 | Café search returns hard-coded `average_rating: 4.8` / `total_reviews: 12` | `backend/app/repositories/cafe_repository.py:181-182` |
| 3-14 | P2 | `emergency_close_day` cancels and refunds N bookings with N commits and no enclosing transaction | `backend/app/services/owner_service.py:304-345` |
| 3-15 | P2 | Money is converted `Decimal → float` before every write and aggregate | `backend/app/services/booking_service.py:194-200` |
| 3-16 | P3 | No CHECK constraints on any of the enum-like free-string columns | `backend/app/models/platform_fee.py:20` |
| 3-17 | P3 | Ad-hoc schema-patching scripts live beside Alembic and target SQLite | `backend/ensure_staff_invitations_table.py:1-34` |
| 3-18 | P3 | `alembic.ini` ships a hard-coded database URL with a password | `backend/alembic.ini:5` |

---

### [P0] Add a UNIQUE constraint on `payments.booking_id` — the one-payment-per-booking rule is app-layer only

- **Where:** `backend/app/models/payment.py:19`, `backend/migrations/versions/001_initial_schema.py:131`, guard at `backend/app/services/payment_service.py:217-224`, consumer at `backend/app/services/payment_service.py:505-508`
- **What:** `create_razorpay_order` enforces one payment per booking with a read-then-insert: it calls `get_by_booking_id()` (`payment_repository.py:21-23`, which does `.first()` with no `ORDER BY` and no status filter) and returns early if a row exists. Nothing in the schema backs that check — `payments.booking_id` is a plain FK with no unique index. Two concurrent `POST /payments/order` calls for the same booking both read `None` and both insert, producing two `payments` rows and two live Razorpay order IDs for one booking.
- **Why it's P0:** Two open orders for one booking means the customer can be charged twice for a single seat. Worse, once two rows exist, every later lookup is nondeterministic: `process_refund` (`payment_service.py:506`) takes whichever row `.first()` returns with no ordering. If it picks the `created` row rather than the `captured` one, `razorpay_payment_id` is `NULL`, the Razorpay refund call is skipped (`payment_service.py:529-530`), and the customer's money is never returned. `verify_payment` and the `payment.captured` webhook resolve by `razorpay_order_id`, so they will happily capture the *other* row, leaving one captured payment permanently un-refundable through the app.
- **Repro / trigger:** Double-tap the pay button, or open the booking's payment page in two tabs, so two `create_razorpay_order` calls interleave between the `get_by_booking_id` read and the `INSERT`. Then have an admin refund that booking.
- **Fix sketch:** Add `unique=True` to `Payment.booking_id` plus a migration creating a unique index, and make the existing early-return path tolerate the resulting `IntegrityError` by re-reading. Independently, make `get_by_booking_id` deterministic — filter to `CAPTURED` for the refund path and order by `created_at DESC` elsewhere.
- **Confidence:** High — the missing constraint and the unordered `.first()` are both verified in source; the concurrent-insert window is a standard read-then-write race.

### [P0] Create migrations for `user_roles`, `notifications`, and `admin_audit_logs` — three tables exist only in the ORM

- **Where:** `backend/app/models/user_role.py:8-18`, `backend/app/models/notification.py:18-37`, `backend/app/models/admin_audit_log.py:9-27`; no migration in `backend/migrations/versions/` references any of them (`grep -rn "notifications\|admin_audit_logs\|user_roles" migrations/` returns zero hits).
- **What:** Only ten tables are ever created across the whole chain: `users`, `cafes`, `hardware_tiers`, `promotions`, `bookings`, `payments`, `reviews` (001), `owner_payout_accounts`, `platform_fees` (006), `staff_invitations` (010), `support_tickets`, `platform_settings` (012), `password_reset_tokens` (013). `user_roles`, `notifications`, and `admin_audit_logs` are declared in the models, imported by `migrations/env.py:10`, and read/written all over the app — `UserRoleMapping` appears 19 times in `user_repository.py` alone and gates staff authorization in `api/v1/bookings.py:116`, `api/v1/owner.py:349,846,894,1322,1360,1439`, and `services/admin_service.py:524,591`; `Notification(...)` is constructed in `booking_service.py:52`, `payment_service.py:45`, `owner_service.py:288`, `api/v1/owner.py:1171`; `AdminAuditLog(...)` in `admin_service.py:621`.
- **Why it's P0:** `user_roles` is the multi-role authorization store — every staff permission check queries it. A database provisioned from the migration chain has no such table, so those checks raise `UndefinedTable` rather than returning a boolean, and the entire staff/owner surface 500s. `admin_audit_logs` is the accountability record for admin suspensions, role changes, and refunds; it cannot be reproduced by any documented schema step, so a rebuild or DR restore of the platform silently comes up with no audit trail at all. Security-relevant state that no migration creates is not a schema the team can reason about.
- **Repro / trigger:** `alembic upgrade head` against an empty Postgres, then `POST /api/v1/auth/login` as a staff user, or hit any endpoint that queries `UserRoleMapping`.
- **Fix sketch:** Author migration 018 that creates all three tables to match the models (including `notifications.user_id` index, `admin_audit_logs` indexes on `admin_id`/`action`/`entity_id`/`created_at`, and `user_roles` indexes on `user_id`/`cafe_id`), then diff the live production schema against `Base.metadata` to confirm nothing else has drifted the same way.
- **Confidence:** High — verified by exhaustive grep of the migrations directory.

---

### [P1] Add the missing values to the `userrole`, `verificationstatus`, and `bookingstatus` PG enums

- **Where:** `backend/migrations/versions/001_initial_schema.py:28` (`userrole`), `:55` (`verificationstatus`), `:116` (`bookingstatus`); models at `backend/app/models/user.py:9-13`, `backend/app/models/cafe.py:10-15`, `backend/app/models/booking.py:9-17`. No later migration runs `ALTER TYPE ... ADD VALUE`.
- **What:** Three native PostgreSQL enum types were created in 001 and never extended, while the Python enums grew:
  - `userrole` = `('gamer','cafe_owner','admin')`; model adds `STAFF = "staff"`. Written at `api/v1/auth.py:279,287,291`, `api/v1/owner.py:1284,1289`, `services/auth_service.py:66`.
  - `verificationstatus` = `('pending','verified','rejected','suspended')`; model adds `DRAFT = "draft"`. Written at `api/v1/owner.py:440` when an owner starts onboarding.
  - `bookingstatus` = `('pending_payment','confirmed','cancelled','completed','no_show')`; model adds `CHECKED_IN`, `ACTIVE`, `FAILED`. Written at `owner_service.py:136` (ACTIVE), the check-in path, and `booking_service.py:313-315` (FAILED on payment failure).
- **Why it's P1:** Each is a crash on a core path. Accepting a staff invitation writes `role='staff'` into a type that has no such label — Postgres raises `invalid input value for enum userrole`, so no staff member can ever be onboarded. Starting café onboarding writes `verification_status='draft'` and 500s. Checking a customer in writes `status='checked_in'` and 500s, leaving the customer at the counter with a valid QR the system refuses to accept. The `FAILED` write is on the payment-failure handler, so a failed payment cannot even be recorded as failed.
- **Repro / trigger:** Against a migration-built database: accept a staff invitation via `POST /auth/staff/accept`; or `POST /owner/cafes/draft`; or scan a booking QR at `POST /owner/bookings/{id}/checkin`.
- **Fix sketch:** One migration issuing `ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'staff'` and the equivalent for the other two types (each `ADD VALUE` must run outside a transaction block on older PG, so use `op.execute` with autocommit). Add a CI check that asserts every Python enum member exists in the corresponding PG type.
- **Confidence:** High — enum definitions and write sites both read directly.

### [P1] Migrate the nine `cafes` columns that exist only in the model — café search reads one of them

- **Where:** `backend/app/models/cafe.py:42` (`is_emergency_mode`), `:50` (`supported_games`), `:52-58` (`business_pan`, `gstin`, `legal_document_url`, `cancellation_policy`, `house_rules`, `social_links`, `draft_data`). The only `cafes` columns any migration adds after 001 are `rejection_reason` (005), `booking_cap_total`/`booking_cap_count` (006), `app_bookable_seats`/`reserved_walkin_seats` (007), `bookable_stations`/`bookings_paused` (008), and `menu_photos` (017).
- **What:** Nine model columns have no migration. They are not dormant: `flex_search_verified` filters on `Cafe.is_emergency_mode == False` (`cafe_repository.py:84`), `api/v1/cafes.py:124,134` reads it, `api/v1/owner.py:212` writes it, and the onboarding flow writes `supported_games`, `business_pan`, `gstin`, `legal_document_url`, `cancellation_policy`, `house_rules`, `social_links`, and `draft_data` at `api/v1/owner.py:441,446,529-537,558`.
- **Why it's P1:** SQLAlchemy emits every mapped column in the `SELECT` list, so on a migration-built database *every* café query fails with `UndefinedColumn` — not just the ones touching these fields. That is the whole customer-facing catalogue, the café detail page, and the owner dashboard down at once. Even on the current production database (where these columns were presumably added by hand), the schema is unreproducible: the next environment built from migrations is broken, and nobody can tell from the repo which columns are real.
- **Repro / trigger:** `alembic upgrade head` on an empty Postgres, then `GET /api/v1/cafes?city=Bengaluru`.
- **Fix sketch:** Add a migration creating all nine columns with the model's types, nullability, and server defaults (`JSON` columns need `server_default='[]'` / `'{}'` to match the `nullable=False` declarations). Then run `alembic revision --autogenerate` against a freshly migrated database and confirm it produces an empty diff — that is the real acceptance test for findings 3-2 through 3-6.
- **Confidence:** High.

### [P1] Fix `bookings.checked_in_by` — model says UUID FK, migration created `String(32)`

- **Where:** `backend/app/models/booking.py:49` vs `backend/migrations/versions/011_add_booking_checkin_fields.py:22`
- **What:** The model declares `checked_in_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)`. Migration 011 creates it as `sa.Column('checked_in_by', sa.String(32), nullable=True)` — wrong type, wrong length, and no foreign key constraint at all. A UUID's canonical string form is 36 characters, so it does not even fit in `varchar(32)`. The check-in path writes `current_user.id` into this column (`owner_service.py:224-277`).
- **Why it's P1:** Check-in either fails outright (`value too long for type character varying(32)`, or a UUID/text bind mismatch through asyncpg) or, if the driver coerces, stores a truncated string that no longer identifies the staff member. Either way the "who checked this customer in" audit field — the thing the row-locked `get_by_id_with_lock` in `booking_repository.py:22-29` was written to protect — is unreliable, and the missing FK means it can point at a nonexistent user.
- **Repro / trigger:** `POST /owner/bookings/{id}/checkin` as staff against a migration-built database.
- **Fix sketch:** Migrate the column to `UUID` with a real `ForeignKey('users.id')` (casting any existing text values), and add an index if check-in-by-staff reporting is ever needed.
- **Confidence:** High on the type/FK mismatch; Medium on which of the two failure modes surfaces first, since that depends on the live production column type rather than migration 011.

### [P1] `bookings.checkin_method` is a native PG enum in the DB but a free `String(50)` in the model

- **Where:** `backend/migrations/versions/006_khelo_v2_schema.py:50-55` creates type `checkinmethod('qr_scan','manual')` and adds the column with it. `backend/migrations/versions/011_add_booking_checkin_fields.py:25-26` intends to add it as `sa.String(50)` but is guarded by `if 'checkin_method' not in columns`, which is always false by then — so the guard makes 011's version dead code and the native enum wins. The model at `backend/app/models/booking.py:51` declares `Mapped[str | None] = mapped_column(String(50))`.
- **What:** The application treats this column as an unconstrained string and writes whatever `checkin_method` it is handed — `owner_service.py:224` defaults to `"manual"`, but `api/v1/owner.py:726` passes `payload.method` straight through from the request body.
- **Why it's P1:** Any check-in method label outside `{'qr_scan','manual'}` raises `invalid input value for enum checkinmethod` and the check-in 500s. Because the model believes the column is free text there is no validation layer that would catch a new label being introduced — the failure surfaces at the counter, mid-session, not in review. This is also a latent trap for finding 3-3's fix: adding enum values here is not obvious when the model doesn't say it's an enum.
- **Repro / trigger:** Call the check-in endpoint with any `method` value other than `qr_scan` or `manual`.
- **Fix sketch:** Pick one representation. Either declare the SQLAlchemy `Enum` in the model to match the DB type, or migrate the column to `varchar` with a CHECK constraint listing the allowed values. Validate `payload.method` against that set in the request schema either way.
- **Confidence:** High on the mismatch; Medium on whether a non-conforming value reaches the column today, which depends on the request schema for `payload.method` (owned by the API-layer auditor).

### [P1] Booking and its `platform_fees` settlement row are written in two separate commits

- **Where:** `backend/app/services/booking_service.py:206-219`; `backend/app/repositories/booking_repository.py:351-359` (`create` commits internally)
- **What:** `create_booking` calls `booking_repo.create(booking_dict)`, which does `db.add` + `commit` + `refresh` — the booking is durable at that point. Only afterwards does it construct the `PlatformFee` row, `db.add` it, and issue a second `commit()`. There is no enclosing transaction and no rollback of the first commit if the second fails. This is a structural property of the repository layer: every `create`/`update` in `base.py:22-34` and in each concrete repository commits on its own, so no service can compose two writes atomically.
- **Why it's P1:** If the second commit fails (connection drop, constraint error, worker restart in the window), a booking exists that the customer can pay for but which has no `platform_fees` row. `_create_route_transfer` reads that row to find `owner_settlement_amount` and to claim the transfer atomically (`payment_service.py:100-125`) — with no row, the café owner's split never happens, and the money sits in the platform account with no record that a settlement is owed. `create_razorpay_order` also silently falls back to `booking.base_amount - booking.discount_amount` when the fee row is missing (`payment_service.py:227-230`), so the discrepancy is papered over rather than raised.
- **Repro / trigger:** Kill the backend process (or drop the DB connection) in the window between `booking_repo.create` returning and the `commit()` at line 219, then pay for the resulting booking.
- **Fix sketch:** Push commit control out of the repositories and into the service/request boundary so `create_booking` writes the booking and the fee row in one transaction. As a narrower interim fix, have `create_booking` use `db.add` for both objects and a single `commit`, bypassing `booking_repo.create`.
- **Confidence:** High — the two commit points are explicit in the source.

### [P1] `platform_fees.booking_id` cascades on delete — deleting a booking destroys the settlement record

- **Where:** `backend/app/models/platform_fee.py:12`, `backend/migrations/versions/006_khelo_v2_schema.py:69`; contrast `backend/app/models/payment.py:19` (no `ondelete`) and `backend/app/repositories/base.py:36-42`
- **What:** `platform_fees.booking_id` is declared `ForeignKey("bookings.id", ondelete="CASCADE")`. `platform_fees` is the only record of `owner_settlement_amount`, `tds_amount`, `razorpay_transfer_id`, and `transfer_status` for a booking. `payments`, by contrast, has no `ondelete` at all, and `BaseRepository.delete()` (`base.py:36-42`) performs an ORM delete with no relationship cascade configured (there are zero `relationship()` declarations in the codebase).
- **Why it's P1:** Deleting a booking row is a one-line operation available on the generic repository, and it silently erases the financial settlement and the Razorpay transfer ID for that booking while leaving the `payments` row behind (or failing with an FK violation, depending on which constraint bites first). Either outcome is bad: an orphaned captured payment with no booking and no fee record cannot be reconciled against Razorpay, and a deleted `platform_fees` row means a completed owner payout has no local evidence. Financial history should not be reachable by `ON DELETE CASCADE`.
- **Repro / trigger:** Any call path reaching `BaseRepository.delete` on a `Booking`, or a manual `DELETE FROM bookings WHERE id = ...` during data cleanup.
- **Fix sketch:** Change `platform_fees.booking_id` to `ON DELETE RESTRICT` so a booking with settlement history cannot be deleted, and adopt soft-deletion (a `deleted_at` column) for bookings instead. Give `payments.booking_id` an explicit `ON DELETE RESTRICT` too, so the intent is stated rather than defaulted.
- **Confidence:** High on the schema facts. Medium on exploitability — I found no HTTP endpoint that deletes a booking, so today this is a footgun for scripts and manual cleanup rather than a reachable bug.

---

### [P2] The availability query has no supporting index on `bookings(hardware_tier_id, session_date)`

- **Where:** `backend/app/repositories/booking_repository.py:129-143` (`get_overlapping_bookings_count`), called under a row lock from `:147-174`; all indexes created across the chain are listed in the *Index inventory* section below.
- **What:** `bookings` has exactly one index: `ix_bookings_reference` on `booking_reference` (001:125). The availability sum filters on `hardware_tier_id`, `session_date`, `status`, `created_at`, `start_time`, and `end_time` — none indexed. The same gap affects `get_by_gamer_id` (filters `gamer_id`, orders by `created_at`), `get_by_cafe_id` and `get_owner_bookings_joined` (filter `cafe_id`), `get_gamer_daily_seats_count` (`gamer_id`, `cafe_id`, `session_date`), and the four owner-dashboard aggregates at `:255-349`. `reviews` likewise has no index on `cafe_id` despite `get_by_cafe_id` (`review_repository.py:27-58`) paginating on it, and `promotions` has none on `cafe_id`.
- **Why it's P2:** Not yet user-visible at current data volume, but it degrades badly and on the worst possible path: `get_overlapping_bookings_count_with_lock` takes `SELECT ... FOR UPDATE` on the tier row *first*, then runs this unindexed aggregate. Every additional millisecond of sequential scan is held under a lock that serializes all concurrent booking attempts for that tier. As `bookings` grows, checkout latency grows superlinearly and concurrent bookers queue behind each other.
- **Repro / trigger:** `EXPLAIN ANALYZE` the availability aggregate on a `bookings` table of any size — it is a `Seq Scan`.
- **Fix sketch:** Add a composite index on `bookings(hardware_tier_id, session_date)` (the availability path), plus `bookings(cafe_id, session_date)`, `bookings(gamer_id, created_at DESC)`, `reviews(cafe_id)`, and `promotions(cafe_id)`.
- **Confidence:** High.

### [P2] Migration 008 assigns integer `0` to a boolean column — the chain will not replay on a fresh Postgres

- **Where:** `backend/migrations/versions/008_add_booking_controls.py:28-47`
- **What:** The backfill executes `UPDATE cafes SET bookable_stations = (...), bookings_paused = 0 WHERE bookable_stations IS NULL`. `bookings_paused` was just created as `sa.Boolean()` (line 24). PostgreSQL has no implicit cast from `integer` to `boolean`, so this statement raises `column "bookings_paused" is of type boolean but expression is of type integer`. The `server_default='0'` at line 47 is fine (PG parses the *string* `'0'` as false), but the bare integer in the UPDATE is not. The migration reads as though it were authored against SQLite — consistent with the `khel_o.db` SQLite file and the `sqlite3`-based scripts sitting in `backend/`.
- **Why it's P2:** It blocks the whole remediation path for findings 3-2 through 3-6. Nobody can validate the chain, run `--autogenerate` to find the rest of the drift, or stand up a staging environment, because `alembic upgrade head` aborts at 008. It is not P1 only because production is already past this revision.
- **Repro / trigger:** `alembic upgrade head` against an empty PostgreSQL database.
- **Fix sketch:** Change the literal to `false` (or `'0'::boolean`). While there, drop the unused `from sqlalchemy.dialects import sqlite` import in `010_add_staff_invitations.py:10`.
- **Confidence:** Medium-High — the PG type rule is unambiguous; I did not execute the migration.

### [P2] Every repository `update()` silently drops `None` values — a nullable field can never be cleared

- **Where:** `backend/app/repositories/base.py:28-34`, and the same `if hasattr(...) and value is not None` pattern copy-pasted into `booking_repository.py:365-367`, `cafe_repository.py:213-215`, `hardware_tier_repository.py:86-88`, `payment_repository.py:39-41`, `promotion_repository.py:73-75`, `owner_payout_repository.py:35-37`
- **What:** All six update implementations skip any field whose new value is `None`. Setting a nullable column back to `NULL` is impossible through the repository layer.
- **Why it's P2:** Callers get a success response for a write that did not happen. Concretely: an admin re-approving a previously rejected café cannot clear `rejection_reason` (`cafe_repository.py:231-232` only sets it `if reason is not None`), so the stale rejection text stays attached to a now-verified café; a café cannot remove its `cancellation_policy` or `legal_document_url` once set; and `transfer_error` on `platform_fees` can never be cleared after a retry succeeds, so the payout record permanently shows a stale error string next to a successful transfer.
- **Repro / trigger:** Reject a café with a reason, then approve it, then read `rejection_reason`.
- **Fix sketch:** Distinguish "absent" from "explicitly null" — have services pass only the keys they intend to write and drop the `is not None` guard, or use a sentinel/`Unset` marker as Pydantic's `exclude_unset` does.
- **Confidence:** High.

### [P2] `Cafe.amenities.contains()` runs against a generic `JSON` column, not JSONB containment

- **Where:** `backend/app/repositories/cafe_repository.py:118-121`; column declared `JSON` at `backend/app/models/cafe.py:48`, created as `postgresql.JSONB()` at `backend/migrations/versions/001_initial_schema.py:58`
- **What:** The amenity filter calls `Cafe.amenities.contains([amenity.strip()])`. The physical column is JSONB, but the model maps it with the dialect-agnostic `JSON` type, whose comparator does not implement the `@>` containment operator — so `.contains()` falls through to the generic string `ColumnOperators.contains`, emitting a `LIKE '%' || :param || '%'` against a list-valued bind parameter. Note the file already reaches for the real thing elsewhere: it imports `JSONB` at line 5 (unused) and casts to `String` for the text search at line 113, which suggests the author knew the JSON operators were not available on this mapping.
- **Why it's P2:** The amenity filter on café search either errors on the bind or silently returns wrong results — a user filtering for "PS5" or "AC" gets an empty or nonsensical list. Bad UX on a discovery surface, no money or booking correctness at stake.
- **Repro / trigger:** `GET /api/v1/cafes?amenities=wifi`.
- **Fix sketch:** Map the column as `postgresql.JSONB` in the model (matching the DB), then `.contains()` compiles to `@>` as intended. Add a GIN index on `cafes.amenities` if the filter is used at volume.
- **Confidence:** Medium — the type mapping and the migration are verified; I did not run the query to confirm which of "errors" or "returns wrong rows" it produces.

### [P2] Café search returns hard-coded `average_rating: 4.8` / `total_reviews: 12`

- **Where:** `backend/app/repositories/cafe_repository.py:181-182,188`; the real implementation exists unused at `backend/app/repositories/review_repository.py:89-91` (`get_average_rating_and_count`)
- **What:** `flex_search_verified` builds each result dict with `"average_rating": 4.8`, `"total_reviews": 12`, and `"has_active_promotion": False` as literals, regardless of the café's actual reviews or live promotions.
- **Why it's P2:** Every café in the catalogue shows the same invented 4.8★ from 12 reviews. Beyond being a data-layer lie, it makes the rating signal useless for comparison — the exact thing the recent "remove fake photos and stats" work (commit `4024cec`) set out to fix, still present in the search path. `has_active_promotion: False` also means live promotions never surface in listings even though `promotion_repository.get_active_for_cafe` exists.
- **Repro / trigger:** `GET /api/v1/cafes` and compare `average_rating` across any two cafés.
- **Fix sketch:** Batch-aggregate ratings for the page's `cafe_ids` in one grouped query alongside the existing tier batch at `:146-151`, and do the same for active promotions. The tier-batching pattern already there is the right shape to copy.
- **Confidence:** High.

### [P2] `emergency_close_day` cancels and refunds N bookings with N commits and no enclosing transaction

- **Where:** `backend/app/services/owner_service.py:304-345`
- **What:** After selecting the day's cancellable bookings, the loop calls `booking_repo.update(b.id, {...})` per booking — each of which re-`SELECT`s the row it already has in memory, `UPDATE`s, `COMMIT`s, and `REFRESH`es (`booking_repository.py:361-370`) — then constructs a fresh `PaymentService` and calls `process_refund` per booking, each with its own commits. The identical per-row-commit shape appears in `auto_transition_booking` (`owner_service.py:124-142`), which is invoked once per booking while serializing a list.
- **Why it's P2:** For a café closing a day with N bookings this is roughly 4N round trips and 2N+ commits, with no outer transaction. An exception partway through (a Razorpay timeout in `process_refund` is the likely one) leaves the day half-cancelled: some customers cancelled and refunded, some cancelled but not refunded, some untouched — and re-running the endpoint re-processes the already-refunded ones. It is P2 rather than P1 because the refund call is individually wrapped in `try/except` (`:337-345`) so one failure does not abort the loop, and because emergency closure is a rare, owner-initiated action.
- **Repro / trigger:** Trigger emergency closure on a day with several confirmed bookings while Razorpay is slow or returning errors.
- **Fix sketch:** Issue one bulk `UPDATE ... WHERE id IN (...)` for the cancellations in a single transaction, then enqueue refunds as idempotent per-booking jobs keyed on booking ID so a partial run is safely resumable.
- **Confidence:** High.

### [P2] Money is converted `Decimal → float` before every write and aggregate

- **Where:** `backend/app/services/booking_service.py:194-200`; `backend/app/services/payment_service.py:266,269,278`; `backend/app/repositories/booking_repository.py:269-281,299-313`
- **What:** Every money column in the schema is correctly `Numeric(10,2)` (`bookings.base_amount`/`discount_amount`/`gateway_fee`/`convenience_fee`/`total_amount`, `payments.amount`, `platform_fees.*`, `hardware_tiers.price_per_hour`, `platform_settings.commission_percentage`) — **there is not a single `Float` or `REAL` money column anywhere in the models or migrations.** But the service layer computes with `Decimal` and then wraps each value in `float()` before handing it to the ORM (`"base_amount": float(base_amount)`, `"total_amount": float(total_amount)`, `"amount": float(booking.total_amount)`), and `sum_revenue_this_month` returns `float(res.scalar() or 0.0)`.
- **Why it's P2, not P0:** Because the columns are `Numeric`, Postgres rounds each value back to 2 decimal places on write, so no cents are lost in storage — the P0 "floating-point money" failure mode does not apply here. The defect is that the round-trip discards the exactness the `Decimal` arithmetic was there to provide, and `sum_revenue_this_month`'s float return accumulates error across many rows in the owner's revenue figure. It also means a future `Numeric(10,4)` or per-paise column would start losing precision silently.
- **Repro / trigger:** Sum a large month of revenue and compare `sum_revenue_this_month`'s float against `SELECT SUM(total_amount)` as `numeric`.
- **Fix sketch:** Pass `Decimal` straight through to the ORM — SQLAlchemy binds it to `Numeric` natively — and return `Decimal` from the aggregate helpers, converting to string only at the serialization boundary.
- **Confidence:** High.

---

### [P3] No CHECK constraints on any of the enum-like free-string columns

- **Where:** `backend/app/models/platform_fee.py:20` (`transfer_status`), `backend/app/models/staff_invitation.py:16,19` (`role`, `status`), `backend/app/models/owner_payout_account.py:14` (`kyc_status`), `backend/app/models/support_ticket.py:33-43` vs `backend/migrations/versions/012_add_support_tickets_and_platform_settings.py:25-26`, `backend/app/models/review.py:15` (`rating`)
- **What:** Several columns carry a documented closed set of values with nothing enforcing it. `platform_fees.transfer_status` is `String(30)` whose comment enumerates five legal values plus an undocumented sixth (`"processing"`, written at `payment_service.py:113`) — and the atomic transfer claim at `payment_service.py:110-117` depends on that exact spelling. `support_tickets.status`/`priority` are declared as `SAEnum(..., native_enum=False)` in the model, which would normally emit a VARCHAR + CHECK, but migration 012 created them as plain `String(20)` with no constraint. `owner_payout_accounts.kyc_status` gates real payouts (`payment_service.py:210-215` compares it to the literal `"activated"`) with no constraint. `reviews.rating` is an unconstrained `Integer` — nothing stops a 0 or a 47.
- **Why it's P3:** No current code path writes an illegal value, so this is latent. But the money-relevant ones (`transfer_status`, `kyc_status`) are string comparisons that decide whether an owner gets paid, and a typo in a future code path would fail open rather than being rejected by the database.
- **Repro / trigger:** `UPDATE platform_fees SET transfer_status = 'transfered'` succeeds, and the atomic claim's `notin_(["transferred","processing"])` would then re-transfer.
- **Fix sketch:** Add CHECK constraints for each closed set (including `"processing"` in the `transfer_status` list) and `rating BETWEEN 1 AND 5`.
- **Confidence:** High.

### [P3] Ad-hoc schema-patching scripts live beside Alembic and target SQLite

- **Where:** `backend/ensure_staff_invitations_table.py:1-34`, `backend/ensure_user_roles.py:34-44`, plus `apply_migration.py`, `apply_migration2.py`, `apply_final.py`, `check_db_state.py`, `check_tables.py`, `migrate_user_roles.py`, `backfill_null_hours.py`, `fix_hours.py`, and a checked-in `khel_o.db` SQLite file — all in the backend root.
- **What:** `ensure_staff_invitations_table.py` opens `sqlite3.connect('khel_o.db')` and hand-writes a `CREATE TABLE`; `ensure_user_roles.py` inserts into `user_roles` with `datetime('now')`, a SQLite function that does not exist in PostgreSQL. These are the de facto provisioning mechanism for the tables Alembic never learned about (finding 3-2).
- **Why it's P3:** It is the root cause of the drift in findings 3-2 through 3-6 rather than a defect in itself, and it explains the SQLite-isms in migration 008. Schema changes applied by hand-run scripts are invisible to `alembic history`, unreviewable in a PR diff, and unreproducible in a new environment.
- **Repro / trigger:** N/A — process defect, evidenced by the file inventory.
- **Fix sketch:** After landing the missing migrations, delete these scripts (or move them under `scripts/` clearly marked one-shot and dated) and make `alembic upgrade head` the only sanctioned way schema changes reach any environment.
- **Confidence:** High.

### [P3] `alembic.ini` ships a hard-coded database URL with a password

- **Where:** `backend/alembic.ini:5`
- **What:** `sqlalchemy.url = postgresql+asyncpg://postgres:postgrespassword@localhost:5432/khel_o_db` is committed to the repository. It is overridden at runtime — `migrations/env.py:13` calls `config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)` before any migration runs — so the checked-in value is never used to connect.
- **Why it's P3, not P0:** The credential is a local-development default pointing at `localhost`, and the override means it is dead configuration rather than a live secret. Flagging it as an exposed secret would be severity inflation; flagging it as a footgun is fair, since anyone invoking Alembic in a context where `env.py`'s override doesn't apply (offline mode still reads `config.get_main_option`, line 21) gets the literal.
- **Repro / trigger:** N/A.
- **Fix sketch:** Replace the value with an empty string or `driver://user:pass@localhost/dbname`, since `env.py` always supplies the real URL.
- **Confidence:** High.

---

## Migration chain map

Linear and intact — a single head at `017`, no branches, no orphans, every `down_revision` resolves to the immediately preceding revision.

| File | `revision` | `down_revision` | Tables touched |
|---|---|---|---|
| `001_initial_schema.py` | `001_initial_schema` | `None` (base) | creates `users`, `cafes`, `hardware_tiers`, `promotions`, `bookings`, `payments`, `reviews` |
| `002_add_indexes.py` | `002_add_indexes` | `001_initial_schema` | indexes on `cafes`, `hardware_tiers` |
| `003_cafe_search.py` | `003_cafe_search` | `002_add_indexes` | `pg_trgm` ext + `cafes` indexes |
| `004_add_reminder_sent.py` | `004_add_reminder_sent` | `003_cafe_search` | `bookings.reminder_sent` |
| `005_add_rejection_reason.py` | `005_add_rejection_reason` | `004_add_reminder_sent` | `cafes.rejection_reason` |
| `006_khelo_v2_schema.py` | `006_khelo_v2_schema` | `005_add_rejection_reason` | creates `owner_payout_accounts`, `platform_fees`; alters `hardware_tiers`, `bookings`, `cafes` |
| `007_add_seat_allocation_fields.py` | `007_add_seat_allocation_fields` | `006_khelo_v2_schema` | `cafes`, `hardware_tiers` seat columns |
| `008_add_booking_controls.py` | `008` | `007_add_seat_allocation_fields` | `cafes.bookable_stations`, `cafes.bookings_paused` |
| `009_add_seats_count.py` | `009` | `008` | `bookings.seats_count` |
| `010_add_staff_invitations.py` | `010` | `009` | creates `staff_invitations` |
| `011_add_booking_checkin_fields.py` | `011` | `010` | `bookings` check-in columns |
| `012_add_support_tickets_and_platform_settings.py` | `012` | `011` | creates `support_tickets`, `platform_settings` |
| `013_add_password_reset_tokens.py` | `013` | `012` | creates `password_reset_tokens` |
| `014_add_review_owner_reply.py` | `014` | `013` | `reviews.owner_reply`, `reviews.owner_replied_at` |
| `015_add_route_transfer_tracking.py` | `015` | `014` | `platform_fees` transfer columns |
| `016_add_tier_seat_lock.py` | `016` | `015` | `hardware_tiers.app_bookable_seats_locked` |
| `017_add_platform_and_menu_photos.py` | `017` | `016` | `hardware_tiers.platform`/`model`, `cafes.menu_photos` |

Two cosmetic notes on the chain (neither affects resolution): the ID scheme changes style at 008 (from `008_add_booking_controls`-style slugs to bare `'008'`), and 009's docstring says `Revises: 008_add_booking_controls` while its actual `down_revision` is `'008'` — the code is correct, the comment is stale.

### Index inventory (everything the chain creates)

`users`: `email`, `google_id` · `bookings`: `booking_reference` only · `payments`: `razorpay_order_id` only · `cafes`: `city`, `verification_status`, `owner_id`, `is_active`, `name` GIN trigram · `hardware_tiers`: `cafe_id` · `owner_payout_accounts`: `owner_id` (unique) · `platform_fees`: `booking_id` (unique) · `staff_invitations`: `email`, `token` (unique), `venue_id` · `support_tickets`: `user_id`, `status`, `created_at` · `password_reset_tokens`: `user_id`, `token` (unique).

Not indexed anywhere: all of `bookings` except the reference; `payments.booking_id`; `reviews.*`; `promotions.*`; and the three tables from finding 3-2 that don't exist.

**On `003_cafe_search.py` specifically (asked directly):** yes, it sets up a usable index — `CREATE EXTENSION pg_trgm` plus a GIN trigram index on `cafes.name`, which is exactly right for the `ILIKE '%…%'` café-name search. **But the search code never benefits from it.** `flex_search_verified` (`cafe_repository.py:95-116`) wraps the column in `func.lower(Cafe.name).like(...)`, and a trigram index built on `name` does not serve a predicate on the *expression* `lower(name)` — Postgres will seq-scan. The index is also only one of seven `OR`-ed branches in that predicate (description, city, state, address, amenities cast to text, and a tier subquery), and a planner cannot use an index for one arm of an `OR` over different columns anyway. Net: 003's intent is sound, the index is dead as written. Rebuilding it as `gin (lower(name) gin_trgm_ops)` would at least make the name arm indexable; making the whole `OR` fast needs a real `tsvector`/generated search column.

---

## Prior audit cross-check

The prior *LAUNCH_READINESS_AUDIT.md* (Aug 2026) identifies several booking and payment issues; this phase-3 audit covers the schema-level facts underneath them.

| Prior Finding | Status | Cross-check | Phase-3 Finding |
|---|---|---|---|
| **P0-2: Race condition in booking creation** | Overlaps, narrower | Prior claim: "lock is released AFTER the query, BEFORE the booking INSERT." My reading: `get_overlapping_bookings_count_with_lock()` acquires a `FOR UPDATE` row lock on the tier, then releases it after the aggregate query, then calls `booking_repo.create()` in a separate operation. Both readings are compatible — the race window exists between the unlock and the insert. However, a deeper issue underlies both: the booking and its `platform_fees` settlement row are written in two separate commits (3-7), so even if a single transaction contained the capacity check and booking insert, the settlement write is still isolated. Prior audit rightly flags the tier lock, but misses the settlement split. | 3-7 |
| **P1-7: Refund silent failures** | Complements, lower layer | Prior claim: "Refunds may fail silently" at `payment_service.py:319-321`. My reading: `get_by_booking_id()` returns `.first()` with no `ORDER BY` and no status filter, so if two `payments` rows exist (possible under the race in 3-1), the refund hits whichever one `.first()` returns, leaving the other un-refundable. This is the schema-level root cause: the missing UNIQUE constraint on `payments.booking_id` enables the two-row state the prior audit's silent failure assumes. | 3-1 |
| **P1-8: Audit logging incomplete** | No overlap | Prior claim: "Only staff.revoke logged" to the audit table. My reading: `admin_audit_logs` table has no migration at all (3-2), so the statement describes the state of the code, not the reachable schema state — on a migration-built database the table would not exist and no audit would be stored at all. | 3-2 |
| **No schema findings** | Expected | Prior audit is API/UI-focused; it does not examine model-migration drift, constraint coverage, or transaction boundaries. My findings 3-1 through 3-6 (constraints and schema drift) are new. | 3-1, 3-2, 3-3, 3-4, 3-5, 3-6 |

---

## Not covered

- **I did not connect to any database.** Every drift claim compares model source against migration source. Production and staging schemas have almost certainly been patched by the ad-hoc scripts in finding 3-17, so a column I report as "missing" may well exist in the live database — the defect is that no migration creates it, making the schema unreproducible. Confirming what production actually has requires an `information_schema` diff, which a human should run before acting on 3-3 through 3-6.
- **No `EXPLAIN ANALYZE`.** Index findings are derived from reading query predicates against the created-index inventory, not from measured plans.
- **Timezone logic** — I report only schema-level facts (all `DateTime` columns are `timezone=True`, consistently, across every model; `bookings.session_date`/`start_time`/`end_time` are naive `Date`/`Time` by design, with IST conversion done in `owner_service.py` via `session_start_ist`/`session_end_ist`). Whether that conversion is correct belongs to the timezone auditor.
- **Authorization semantics** of `user_roles` — I established that the table has no migration and is queried on every staff permission check; whether those checks are *correct* is Phase 2's.
- **`app/api/v1/` route handlers** were read only where they write model columns directly (`owner.py`, `auth.py`); I did not audit their request/response contracts.
- **`backend/tests/`** — not examined, so I cannot say whether any of this drift is covered by a test.
- **Alembic `compare_type` / autogenerate fidelity** — `env.py:32` configures the context without `compare_type=True` or `compare_server_default=True`, meaning future autogenerate runs will miss exactly the type-level drift found in 3-5 and 3-6. Worth a follow-up, not written up as its own finding.

## Notes for the coordinator

1. **Findings 3-2 through 3-6 are one story:** the ORM is the real schema and Alembic is a partial, stale record of it. The single highest-value action is not any individual fix but running `alembic upgrade head` on an empty database and then `alembic revision --autogenerate` (with `compare_type=True`) to get the *complete* drift list. My nine `cafes` columns and three missing tables are what static reading found; autogenerate will find whatever I missed. Fixing 3-10 (migration 008's boolean bug) is a prerequisite, since the chain currently aborts there.
2. **Overlap with the prior `LAUNCH_READINESS_AUDIT.md`:** I did not find schema drift or the missing `payments.booking_id` constraint claimed there, so I treat 3-1 and 3-2 as new rather than as previously-known-open items. Whoever owns reconciling that document should confirm.
3. **Handoffs:** 3-1 (payments UNIQUE) overlaps the payments auditor's territory — the *constraint* is mine, the double-charge and refund-selection consequences are theirs, and it should be triaged jointly. 3-7's split commit and the repository-layer commit-per-write pattern it stems from will also show up in any booking-race analysis; it is the structural reason no service in this codebase can make two writes atomic.
4. **Genuinely good, worth not regressing:** zero float money columns; consistent `DateTime(timezone=True)`; `with_for_update()` used deliberately for seat capacity, check-in, and promo `max_uses`, each with a comment explaining the race it closes; the atomic `UPDATE...WHERE` claim on Route transfers (`payment_service.py:110-117`) is a correct fix for a real double-payout bug; and `flex_search_verified` already batches tier loading instead of N+1-ing. There are no ORM relationships at all, which is why this codebase has no lazy-load N+1 problem — an unusual and, here, beneficial choice.
