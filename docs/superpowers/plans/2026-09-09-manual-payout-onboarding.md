# Manual Payout Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Razorpay-Route-shaped, all-optional payout fields in café onboarding with a UPI-first + bank-fallback collection flow, backed by server-side validation and a one-time ₹1-test-transfer verification gate that must pass before an admin can pay a café out.

**Architecture:** Additive columns on the existing `OwnerPayoutAccount` model carry the new payout destination + verification state. `OnboardingSubmitRequest` gains Pydantic validators that mirror (and close gaps in) the wizard's existing client-side checks. A new admin endpoint records the ₹1 test transfer's outcome; `CafePayoutRepository.create_payout` refuses to pay an unverified café. The onboarding wizard and three owner-facing components lose their Razorpay Route copy.

**Tech Stack:** FastAPI + SQLAlchemy (async) + Pydantic v2 + Alembic on the backend; Next.js (App Router) + TanStack Query + Zod-free hand-rolled validation on the frontend. `cryptography.fernet` for at-rest encryption (already a transitive dependency via `python-jose[cryptography]`).

**Spec:** [`docs/superpowers/specs/2026-09-09-manual-payout-onboarding-design.md`](../specs/2026-09-09-manual-payout-onboarding-design.md)

## Global Constraints

- UPI ID is the only payout field required to submit onboarding; bank fallback, PAN, and GSTIN (unless `has_gst`) remain optional/conditional.
- Verification is tied to the payout *destination*: any change to `upi_vpa` or the bank account/IFSC pair resets `payout_verification_status` to `unverified` server-side — never client-supplied.
- A café's first real payout is blocked at the repository layer (`CafePayoutRepository.create_payout`), not just in the UI, until `payout_verification_status == "verified"`.
- The plaintext bank account number in `OwnerPayoutAccount.details["full_account"]` and its unmasked-fallback read in `cafe_service.py` are being retired by this plan — no new code may read or write that JSON key for account numbers.
- All Razorpay Route payout copy touched by this plan is replaced with manual UPI/bank-transfer language. Do not introduce new Razorpay Route references anywhere in scope.
- Backend field validators raise `ValueError` (letting FastAPI/Pydantic return a 422 with `{loc, msg}` detail), matching this codebase's existing convention (`validate_city`, `validate_google_maps_url`) — not custom `BadRequestException`s. Custom exceptions are reserved for endpoint/repository-level checks (e.g. the payout-verify endpoint, the payout gate).
- Test DB is SQLite via `Base.metadata.create_all()` (see `backend/tests/conftest.py`) — tests never run Alembic migrations, so model changes alone make new columns testable; the migration file matters only for real deployments.

---

### Task 1: `OwnerPayoutAccount` model fields + migration

**Files:**
- Modify: `backend/app/models/owner_payout_account.py`
- Create: `backend/migrations/versions/026_add_manual_payout_fields.py`
- Test: `backend/tests/test_owner_payout_account_model.py`

**Interfaces:**
- Produces: `OwnerPayoutAccount` gains `upi_vpa: str | None`, `bank_account_number_encrypted: str | None`, `bank_name: str | None`, `account_type: str | None`, `payout_verification_status: str` (default `"unverified"`, values `"unverified"` / `"test_sent"` / `"verified"` — plain string, matching this model's existing `kyc_status` convention, not a SQLAlchemy `Enum` type), `verified_name: str | None`, `verified_at: datetime | None`, `verified_by_admin_id: uuid.UUID | None`, `test_transfer_ref: str | None`. Later tasks read/write these by name.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_owner_payout_account_model.py
import uuid
import pytest
from app.database import AsyncSessionLocal
from app.models.owner_payout_account import OwnerPayoutAccount
from app.models.user import User, UserRole
from app.core.security import get_password_hash


@pytest.mark.asyncio
async def test_owner_payout_account_has_manual_payout_fields():
    async with AsyncSessionLocal() as db:
        owner = User(
            id=uuid.uuid4(),
            email=f"payout_model_{uuid.uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("password123"),
            full_name="Payout Model Owner",
            role=UserRole.CAFE_OWNER,
            is_active=True,
        )
        db.add(owner)
        await db.flush()

        account = OwnerPayoutAccount(
            id=uuid.uuid4(),
            owner_id=owner.id,
            upi_vpa="ownername@okhdfcbank",
            bank_account_number_encrypted="gAAAAA_fake_ciphertext",
            bank_name="HDFC Bank",
            account_type="savings",
        )
        db.add(account)
        await db.commit()
        await db.refresh(account)

        assert account.payout_verification_status == "unverified"
        assert account.verified_name is None
        assert account.verified_at is None
        assert account.verified_by_admin_id is None
        assert account.test_transfer_ref is None
        assert account.upi_vpa == "ownername@okhdfcbank"
        assert account.bank_name == "HDFC Bank"
        assert account.account_type == "savings"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_owner_payout_account_model.py -v`
Expected: FAIL — `TypeError: 'upi_vpa' is an invalid keyword argument for OwnerPayoutAccount` (or similar, since the columns don't exist yet).

- [ ] **Step 3: Add the columns to the model**

Replace the full contents of `backend/app/models/owner_payout_account.py`:

```python
import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

class OwnerPayoutAccount(Base):
    __tablename__ = "owner_payout_accounts"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    razorpay_account_id: Mapped[str | None] = mapped_column(String(100), unique=True, nullable=True)
    kyc_status: Mapped[str] = mapped_column(String(50), default="pending", nullable=False)
    business_pan: Mapped[str | None] = mapped_column(String(20), nullable=True)
    bank_account_number_masked: Mapped[str | None] = mapped_column(String(20), nullable=True)
    bank_ifsc: Mapped[str | None] = mapped_column(String(20), nullable=True)
    account_holder_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    details: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)

    # --- Manual payout fields (Razorpay Route replacement) ---
    upi_vpa: Mapped[str | None] = mapped_column(String(256), nullable=True)
    bank_account_number_encrypted: Mapped[str | None] = mapped_column(String(500), nullable=True)
    bank_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    account_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # "unverified" -> "test_sent" -> "verified". Plain string like kyc_status
    # above, not a SQLAlchemy Enum type — deliberately matching this model's
    # own convention for status fields rather than a different model's.
    payout_verification_status: Mapped[str] = mapped_column(String(20), default="unverified", nullable=False)
    verified_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    verified_by_admin_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    test_transfer_ref: Mapped[str | None] = mapped_column(String(100), nullable=True)

    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_owner_payout_account_model.py -v`
Expected: PASS

- [ ] **Step 5: Write the migration**

```python
# backend/migrations/versions/026_add_manual_payout_fields.py
"""add manual payout fields to owner_payout_accounts

Revision ID: 026
Revises: 025
Create Date: 2026-09-09
"""
from alembic import op
import sqlalchemy as sa

revision = '026'
down_revision = '025'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('owner_payout_accounts', sa.Column('upi_vpa', sa.String(256), nullable=True))
    op.add_column('owner_payout_accounts', sa.Column('bank_account_number_encrypted', sa.String(500), nullable=True))
    op.add_column('owner_payout_accounts', sa.Column('bank_name', sa.String(100), nullable=True))
    op.add_column('owner_payout_accounts', sa.Column('account_type', sa.String(20), nullable=True))
    op.add_column('owner_payout_accounts', sa.Column('payout_verification_status', sa.String(20), nullable=False, server_default='unverified'))
    op.add_column('owner_payout_accounts', sa.Column('verified_name', sa.String(255), nullable=True))
    op.add_column('owner_payout_accounts', sa.Column('verified_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('owner_payout_accounts', sa.Column('verified_by_admin_id', sa.Uuid(), sa.ForeignKey('users.id'), nullable=True))
    op.add_column('owner_payout_accounts', sa.Column('test_transfer_ref', sa.String(100), nullable=True))


def downgrade():
    op.drop_column('owner_payout_accounts', 'test_transfer_ref')
    op.drop_column('owner_payout_accounts', 'verified_by_admin_id')
    op.drop_column('owner_payout_accounts', 'verified_at')
    op.drop_column('owner_payout_accounts', 'verified_name')
    op.drop_column('owner_payout_accounts', 'payout_verification_status')
    op.drop_column('owner_payout_accounts', 'account_type')
    op.drop_column('owner_payout_accounts', 'bank_name')
    op.drop_column('owner_payout_accounts', 'bank_account_number_encrypted')
    op.drop_column('owner_payout_accounts', 'upi_vpa')
```

Check `backend/migrations/versions/025_add_promotion_khelo_code.py`'s header to confirm its `revision = '025'` before writing `down_revision = '025'` above — it was `025` as of this plan's writing.

- [ ] **Step 6: Commit**

```bash
git add backend/app/models/owner_payout_account.py backend/migrations/versions/026_add_manual_payout_fields.py backend/tests/test_owner_payout_account_model.py
git commit -m "feat(payouts): add manual payout fields to OwnerPayoutAccount"
```

---

### Task 2: Bank account number encryption + settings key

**Files:**
- Create: `backend/app/core/payout_encryption.py`
- Modify: `backend/app/config.py`
- Test: `backend/tests/test_payout_encryption.py`

**Interfaces:**
- Consumes: `settings.PAYOUT_ENCRYPTION_KEY` (new setting from this task).
- Produces: `encrypt_bank_account_number(raw: str) -> str` and `decrypt_bank_account_number(token: str) -> str` in `app.core.payout_encryption` — Task 4's repository method calls both.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_payout_encryption.py
from app.core.payout_encryption import encrypt_bank_account_number, decrypt_bank_account_number


def test_encrypt_decrypt_round_trips():
    raw = "9180200192847291"
    token = encrypt_bank_account_number(raw)
    assert token != raw
    assert decrypt_bank_account_number(token) == raw


def test_encrypted_value_is_not_substring_of_plaintext():
    raw = "9180200192847291"
    token = encrypt_bank_account_number(raw)
    assert raw not in token
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_payout_encryption.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.core.payout_encryption'`

- [ ] **Step 3: Add the setting**

In `backend/app/config.py`, add inside `class Settings(BaseSettings):` right after the `RAZORPAY_WEBHOOK_SECRET` line:

```python
    # Fernet key encrypting OwnerPayoutAccount.bank_account_number_encrypted at
    # rest (replaces the old plaintext details["full_account"] JSON field).
    # Must be a valid Fernet key (Fernet.generate_key()). This default is
    # fine for local dev only — validate_production_security below rejects
    # it in production, same pattern as SECRET_KEY.
    PAYOUT_ENCRYPTION_KEY: str = "GefeqN9hdywl4gOeFvNaL2VtxFvNObUDB_eqm5OtkaU="
```

Then extend `validate_production_security`:

```python
    @model_validator(mode="after")
    def validate_production_security(self) -> "Settings":
        """Enforce strict security and database constraints in production."""
        if self.ENVIRONMENT == "production":
            if "sqlite" in self.DATABASE_URL.lower():
                raise ValueError("CRITICAL: SQLite cannot be used as DATABASE_URL in production. A PostgreSQL connection is required.")
            if self.SECRET_KEY == "super-secret-key-change-in-production-at-least-32-chars":
                raise ValueError("CRITICAL: Default insecure SECRET_KEY detected in production. A secure SECRET_KEY must be provided.")
            if self.PAYOUT_ENCRYPTION_KEY == "GefeqN9hdywl4gOeFvNaL2VtxFvNObUDB_eqm5OtkaU=":
                raise ValueError("CRITICAL: Default insecure PAYOUT_ENCRYPTION_KEY detected in production. A secure Fernet key must be provided.")
        return self
```

- [ ] **Step 4: Write the encryption module**

```python
# backend/app/core/payout_encryption.py
"""Encrypts OwnerPayoutAccount bank account numbers at rest. Replaces the
old plaintext details["full_account"] JSON field, which cafe_service.py
would return unmasked if bank_account_number_masked was ever null."""
from cryptography.fernet import Fernet
from app.config import settings


def _get_fernet() -> Fernet:
    return Fernet(settings.PAYOUT_ENCRYPTION_KEY.encode())


def encrypt_bank_account_number(raw: str) -> str:
    return _get_fernet().encrypt(raw.encode()).decode()


def decrypt_bank_account_number(token: str) -> str:
    return _get_fernet().decrypt(token.encode()).decode()
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_payout_encryption.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/core/payout_encryption.py backend/app/config.py backend/tests/test_payout_encryption.py
git commit -m "feat(payouts): encrypt bank account numbers at rest"
```

---

### Task 3: `OnboardingSubmitRequest` validation

**Files:**
- Modify: `backend/app/api/v1/owner.py` (imports near top; `OnboardingSubmitRequest` class at line ~107)
- Test: `backend/tests/test_onboarding_payout_validation.py`

**Interfaces:**
- Consumes: nothing new.
- Produces: `OnboardingSubmitRequest` gains required `upi_vpa: str`, `confirm_upi_vpa: str`, and optional `bank_name: str | None`, `account_type: str | None`, `confirm_bank_account_number: str | None`, `has_gst: bool`. Task 4 reads `payload.upi_vpa`, `payload.bank_name`, `payload.account_type` (the confirm fields are validated here and never read again).

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_onboarding_payout_validation.py
import pytest
import uuid
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.models.user import User, UserRole
from app.core.security import create_access_token, get_password_hash
from app.database import AsyncSessionLocal


async def _make_gamer_and_headers(prefix: str):
    async with AsyncSessionLocal() as db:
        gamer = User(
            id=uuid.uuid4(),
            email=f"{prefix}_{uuid.uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("password123"),
            full_name="Payout Validation Test",
            role=UserRole.GAMER,
            is_active=True,
        )
        db.add(gamer)
        await db.commit()
        token = create_access_token(subject=str(gamer.id), role=gamer.role.value)
        return {"Authorization": f"Bearer {token}"}


def _base_payload(**overrides):
    payload = {
        "name": "Payout Validation Cafe",
        "addressLine1": "1 Validation St",
        "city": "Hyderabad",
        "state": "Telangana",
        "pincode": "500001",
        "phoneNumber": "+919000000030",
        "openingTime": "09:00:00",
        "closingTime": "21:00:00",
        "upiVpa": "ownername@okhdfcbank",
        "confirmUpiVpa": "ownername@okhdfcbank",
    }
    payload.update(overrides)
    return payload


@pytest.mark.asyncio
async def test_submit_without_upi_vpa_is_rejected():
    headers = await _make_gamer_and_headers("no_upi")
    payload = _base_payload()
    del payload["upiVpa"]
    del payload["confirmUpiVpa"]
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        res = await client.post("/api/v1/owner/onboarding/submit", json=payload, headers=headers)
        assert res.status_code == 422


@pytest.mark.asyncio
async def test_mismatched_upi_confirmation_is_rejected():
    headers = await _make_gamer_and_headers("mismatch_upi")
    payload = _base_payload(confirmUpiVpa="different@okaxis")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        res = await client.post("/api/v1/owner/onboarding/submit", json=payload, headers=headers)
        assert res.status_code == 422


@pytest.mark.asyncio
async def test_partial_bank_fields_rejected():
    headers = await _make_gamer_and_headers("partial_bank")
    payload = _base_payload(bankIfsc="HDFC0000128")  # missing accountNumber + holder name
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        res = await client.post("/api/v1/owner/onboarding/submit", json=payload, headers=headers)
        assert res.status_code == 422


@pytest.mark.asyncio
async def test_mismatched_bank_account_confirmation_rejected():
    headers = await _make_gamer_and_headers("mismatch_bank")
    payload = _base_payload(
        bankAccountNumber="123456789012",
        confirmBankAccountNumber="123456789099",
        bankIfsc="HDFC0000128",
        accountHolderName="Test Owner",
    )
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        res = await client.post("/api/v1/owner/onboarding/submit", json=payload, headers=headers)
        assert res.status_code == 422


@pytest.mark.asyncio
async def test_has_gst_without_gstin_rejected():
    headers = await _make_gamer_and_headers("gst_missing")
    payload = _base_payload(hasGst=True)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        res = await client.post("/api/v1/owner/onboarding/submit", json=payload, headers=headers)
        assert res.status_code == 422


@pytest.mark.asyncio
async def test_valid_upi_only_submission_succeeds():
    headers = await _make_gamer_and_headers("valid_upi_only")
    payload = _base_payload()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        res = await client.post("/api/v1/owner/onboarding/submit", json=payload, headers=headers)
        assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_invalid_business_pan_format_rejected():
    headers = await _make_gamer_and_headers("bad_pan")
    payload = _base_payload(businessPan="NOTAPAN")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        res = await client.post("/api/v1/owner/onboarding/submit", json=payload, headers=headers)
        assert res.status_code == 422
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_onboarding_payout_validation.py -v`
Expected: FAIL — `test_valid_upi_only_submission_succeeds` fails because `upiVpa` isn't a recognized field yet (extra fields are ignored by default Pydantic config here, so it'd actually 200 today but without requiring it — check: the other tests expecting 422 will instead get 200, since nothing currently rejects missing/mismatched UPI or partial bank fields). This confirms the gap the task closes.

- [ ] **Step 3: Add `re` and `model_validator` imports**

In `backend/app/api/v1/owner.py`, change the pydantic import line near the top:

```python
from pydantic import BaseModel, EmailStr, Field, ConfigDict, field_validator, model_validator, AliasChoices
```

Add near the top of the file (after the existing `import secrets` line):

```python
import re
```

- [ ] **Step 4: Extend `OnboardingSubmitRequest`**

In `backend/app/api/v1/owner.py`, replace the `OnboardingSubmitRequest` class (currently lines 107-147) with:

```python
class OnboardingSubmitRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)
    description: Optional[str] = None
    address_line1: str = Field(..., max_length=255)
    address_line2: Optional[str] = None
    city: str = Field(..., max_length=100)
    state: str = Field(..., max_length=100)
    pincode: str = Field(..., max_length=10)
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    google_maps_url: Optional[str] = None
    phone_number: str = Field(..., max_length=20)
    email: Optional[str] = None
    opening_time: str = Field(..., pattern=r"^\d{2}:\d{2}:\d{2}$", description="Opening time in HH:MM:SS format (required)")

    @field_validator("city")
    @classmethod
    def _validate_city(cls, v: str) -> str:
        return validate_city(v)

    @field_validator("google_maps_url")
    @classmethod
    def _validate_google_maps_url(cls, v: Optional[str]) -> Optional[str]:
        return validate_google_maps_url(v)
    closing_time: str = Field(..., pattern=r"^\d{2}:\d{2}:\d{2}$", description="Closing time in HH:MM:SS format (required, can be earlier than opening for overnight)")
    total_seats: int = Field(20, ge=1)
    amenities: List[str] = Field(default_factory=list)
    photos: List[str] = Field(default_factory=list)
    supported_games: List[str] = Field(default_factory=list)
    business_pan: Optional[str] = None
    has_gst: bool = False
    gstin: Optional[str] = None
    legal_document_url: Optional[str] = None

    # --- Manual payout fields (Razorpay Route replacement) ---
    upi_vpa: str = Field(..., min_length=3, max_length=256)
    confirm_upi_vpa: str = Field(..., min_length=3, max_length=256)
    bank_account_number: Optional[str] = Field(None, min_length=8, max_length=18)
    confirm_bank_account_number: Optional[str] = None
    bank_ifsc: Optional[str] = None
    account_holder_name: Optional[str] = None
    bank_name: Optional[str] = Field(None, max_length=100)
    account_type: Optional[str] = None

    cancellation_policy: Optional[str] = None
    house_rules: List[str] = Field(default_factory=list)
    social_links: Dict[str, str] = Field(default_factory=dict)
    hardware_tiers: List[OnboardingHardwareTierItem] = Field(default_factory=list)

    @field_validator("upi_vpa")
    @classmethod
    def _validate_upi_vpa(cls, v: str) -> str:
        v = v.strip()
        if not re.match(r"^[\w.\-]{2,256}@[a-zA-Z]{2,64}$", v):
            raise ValueError("Enter a valid UPI ID (e.g. yourname@okhdfcbank).")
        return v

    @field_validator("business_pan")
    @classmethod
    def _validate_business_pan(cls, v: Optional[str]) -> Optional[str]:
        if not v:
            return v
        v = v.strip().upper()
        if not re.match(r"^[A-Z]{5}[0-9]{4}[A-Z]{1}$", v):
            raise ValueError("Business PAN must be a valid 10-character PAN (e.g. ABCDE1234F).")
        return v

    @field_validator("bank_ifsc")
    @classmethod
    def _validate_bank_ifsc(cls, v: Optional[str]) -> Optional[str]:
        if not v:
            return v
        v = v.strip().upper()
        if not re.match(r"^[A-Z]{4}0[A-Z0-9]{6}$", v):
            raise ValueError("Bank IFSC must be a valid 11-character code (e.g. HDFC0000128).")
        return v

    @field_validator("gstin")
    @classmethod
    def _validate_gstin(cls, v: Optional[str]) -> Optional[str]:
        if not v:
            return v
        v = v.strip().upper()
        if not re.match(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$", v):
            raise ValueError("GSTIN must be a valid 15-character GSTIN (e.g. 29ABCDE1234F1Z5).")
        return v

    @model_validator(mode="after")
    def _validate_payout_and_gst(self) -> "OnboardingSubmitRequest":
        if self.upi_vpa.strip().lower() != self.confirm_upi_vpa.strip().lower():
            raise ValueError("UPI ID and confirmation do not match.")

        bank_fields_given = any([self.bank_account_number, self.bank_ifsc, self.account_holder_name])
        if bank_fields_given:
            missing = [
                name for name, val in [
                    ("bank account number", self.bank_account_number),
                    ("bank IFSC", self.bank_ifsc),
                    ("account holder name", self.account_holder_name),
                ] if not val
            ]
            if missing:
                raise ValueError(f"Bank fallback is incomplete — missing: {', '.join(missing)}.")
            if self.bank_account_number != self.confirm_bank_account_number:
                raise ValueError("Bank account number and confirmation do not match.")

        if self.has_gst and not self.gstin:
            raise ValueError("GSTIN is required when GST registration is indicated.")

        return self

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_onboarding_payout_validation.py -v`
Expected: PASS (all 7 tests)

- [ ] **Step 6: Run the full existing onboarding test suite to check for regressions**

Run: `cd backend && python -m pytest tests/test_platform_onboarding_submit.py tests/test_admin_v2_features.py -v`
Expected: PASS — these tests don't send `upiVpa` today, so they will now fail with 422 (missing required field). Fix them by adding `"upiVpa": "testowner@okhdfcbank", "confirmUpiVpa": "testowner@okhdfcbank"` to each payload dict in `test_platform_onboarding_submit.py` (3 payloads, at the lines building `payload = {...}` for each of the three tests in that file). Re-run after fixing.

- [ ] **Step 7: Commit**

```bash
git add backend/app/api/v1/owner.py backend/tests/test_onboarding_payout_validation.py backend/tests/test_platform_onboarding_submit.py
git commit -m "feat(payouts): validate UPI/bank/GSTIN fields on onboarding submit"
```

---

### Task 4: Persist payout details with reset-on-change logic

**Files:**
- Modify: `backend/app/repositories/owner_payout_repository.py`
- Modify: `backend/app/api/v1/owner.py` (submit endpoint, lines ~582-607)
- Test: `backend/tests/test_owner_payout_repository_upsert.py`

**Interfaces:**
- Consumes: `encrypt_bank_account_number`, `decrypt_bank_account_number` from Task 2.
- Produces: `OwnerPayoutRepository.upsert_payout_details(owner_id, upi_vpa, bank_account_number, bank_ifsc, account_holder_name, bank_name, account_type, business_pan, default_holder_name) -> OwnerPayoutAccount`. Does **not** commit — it only `add`/mutates and flushes, so it composes into the onboarding endpoint's single final `db.commit()`. Task 5 does not call this method (it edits verification fields directly).

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_owner_payout_repository_upsert.py
import uuid
import pytest
from app.database import AsyncSessionLocal
from app.models.user import User, UserRole
from app.core.security import get_password_hash
from app.repositories.owner_payout_repository import OwnerPayoutRepository
from app.core.payout_encryption import decrypt_bank_account_number


async def _make_owner(db) -> User:
    owner = User(
        id=uuid.uuid4(),
        email=f"upsert_owner_{uuid.uuid4().hex[:6]}@test.com",
        password_hash=get_password_hash("password123"),
        full_name="Upsert Owner",
        role=UserRole.CAFE_OWNER,
        is_active=True,
    )
    db.add(owner)
    await db.flush()
    return owner


@pytest.mark.asyncio
async def test_upsert_creates_account_with_unverified_status():
    async with AsyncSessionLocal() as db:
        owner = await _make_owner(db)
        repo = OwnerPayoutRepository(db)
        account = await repo.upsert_payout_details(
            owner_id=owner.id,
            upi_vpa="owner@okhdfcbank",
            bank_account_number=None,
            bank_ifsc=None,
            account_holder_name=None,
            bank_name=None,
            account_type=None,
            business_pan=None,
            default_holder_name="Fallback Name",
        )
        await db.commit()
        assert account.upi_vpa == "owner@okhdfcbank"
        assert account.payout_verification_status == "unverified"
        assert account.account_holder_name == "Fallback Name"


@pytest.mark.asyncio
async def test_bank_account_number_is_encrypted_not_plaintext():
    async with AsyncSessionLocal() as db:
        owner = await _make_owner(db)
        repo = OwnerPayoutRepository(db)
        account = await repo.upsert_payout_details(
            owner_id=owner.id,
            upi_vpa="owner2@okhdfcbank",
            bank_account_number="9180200192847291",
            bank_ifsc="HDFC0000128",
            account_holder_name="Owner Two",
            bank_name="HDFC Bank",
            account_type="savings",
            business_pan=None,
            default_holder_name=None,
        )
        await db.commit()
        assert account.bank_account_number_encrypted is not None
        assert "9180200192847291" not in account.bank_account_number_encrypted
        assert decrypt_bank_account_number(account.bank_account_number_encrypted) == "9180200192847291"
        assert account.bank_account_number_masked == "••••7291"


@pytest.mark.asyncio
async def test_verified_status_resets_when_upi_vpa_changes():
    async with AsyncSessionLocal() as db:
        owner = await _make_owner(db)
        repo = OwnerPayoutRepository(db)
        account = await repo.upsert_payout_details(
            owner_id=owner.id, upi_vpa="original@okaxis", bank_account_number=None,
            bank_ifsc=None, account_holder_name=None, bank_name=None,
            account_type=None, business_pan=None, default_holder_name=None,
        )
        await db.commit()
        account.payout_verification_status = "verified"
        account.verified_name = "Original Name"
        await db.commit()

        updated = await repo.upsert_payout_details(
            owner_id=owner.id, upi_vpa="changed@okaxis", bank_account_number=None,
            bank_ifsc=None, account_holder_name=None, bank_name=None,
            account_type=None, business_pan=None, default_holder_name=None,
        )
        await db.commit()
        assert updated.payout_verification_status == "unverified"
        assert updated.verified_name is None


@pytest.mark.asyncio
async def test_verified_status_survives_unchanged_resubmission():
    async with AsyncSessionLocal() as db:
        owner = await _make_owner(db)
        repo = OwnerPayoutRepository(db)
        account = await repo.upsert_payout_details(
            owner_id=owner.id, upi_vpa="stable@okaxis", bank_account_number=None,
            bank_ifsc=None, account_holder_name=None, bank_name=None,
            account_type=None, business_pan=None, default_holder_name=None,
        )
        await db.commit()
        account.payout_verification_status = "verified"
        account.verified_name = "Stable Name"
        await db.commit()

        updated = await repo.upsert_payout_details(
            owner_id=owner.id, upi_vpa="stable@okaxis", bank_account_number=None,
            bank_ifsc=None, account_holder_name=None, bank_name=None,
            account_type=None, business_pan="ABCDE1234F", default_holder_name=None,
        )
        await db.commit()
        assert updated.payout_verification_status == "verified"
        assert updated.verified_name == "Stable Name"
        assert updated.business_pan == "ABCDE1234F"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_owner_payout_repository_upsert.py -v`
Expected: FAIL — `AttributeError: 'OwnerPayoutRepository' object has no attribute 'upsert_payout_details'`

- [ ] **Step 3: Implement `upsert_payout_details`**

Replace the full contents of `backend/app/repositories/owner_payout_repository.py`:

```python
from typing import Optional
from uuid import UUID
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.owner_payout_account import OwnerPayoutAccount
from app.repositories.base import BaseRepository
from app.core.payout_encryption import encrypt_bank_account_number, decrypt_bank_account_number

class OwnerPayoutRepository(BaseRepository[OwnerPayoutAccount]):
    def __init__(self, db: AsyncSession):
        super().__init__(OwnerPayoutAccount, db)

    async def get_by_id(self, payout_id: UUID) -> Optional[OwnerPayoutAccount]:
        result = await self.db.execute(select(OwnerPayoutAccount).where(OwnerPayoutAccount.id == payout_id))
        return result.scalars().first()

    async def get_by_owner_id(self, owner_id: UUID) -> Optional[OwnerPayoutAccount]:
        result = await self.db.execute(select(OwnerPayoutAccount).where(OwnerPayoutAccount.owner_id == owner_id))
        return result.scalars().first()

    async def get_by_razorpay_account_id(self, razorpay_account_id: str) -> Optional[OwnerPayoutAccount]:
        result = await self.db.execute(select(OwnerPayoutAccount).where(OwnerPayoutAccount.razorpay_account_id == razorpay_account_id))
        return result.scalars().first()

    async def create(self, payout_data: dict) -> OwnerPayoutAccount:
        payout_obj = OwnerPayoutAccount(**payout_data)
        self.db.add(payout_obj)
        await self.db.commit()
        await self.db.refresh(payout_obj)
        return payout_obj

    async def update(self, owner_id: UUID, update_data: dict) -> Optional[OwnerPayoutAccount]:
        payout = await self.get_by_owner_id(owner_id)
        if not payout:
            return None
        for field, value in update_data.items():
            if hasattr(payout, field) and value is not None:
                setattr(payout, field, value)
        await self.db.commit()
        await self.db.refresh(payout)
        return payout

    async def upsert_payout_details(
        self,
        owner_id: UUID,
        upi_vpa: str,
        bank_account_number: Optional[str],
        bank_ifsc: Optional[str],
        account_holder_name: Optional[str],
        bank_name: Optional[str],
        account_type: Optional[str],
        business_pan: Optional[str],
        default_holder_name: Optional[str],
    ) -> OwnerPayoutAccount:
        """Create or update the owner's payout destination from an onboarding
        submission. Resets payout_verification_status to "unverified"
        (clearing the prior verification record) whenever the UPI ID or the
        bank account/IFSC pair actually changes value — verification is tied
        to the specific destination, never carried over to a new one. Does
        not commit: the caller (submit_onboarding_application) commits once,
        atomically with the café and hardware tier rows."""
        existing = await self.get_by_owner_id(owner_id)

        existing_bank_plain = None
        if existing and existing.bank_account_number_encrypted:
            try:
                existing_bank_plain = decrypt_bank_account_number(existing.bank_account_number_encrypted)
            except Exception:
                existing_bank_plain = None

        destination_changed = (
            existing is None
            or (existing.upi_vpa or None) != upi_vpa
            or existing_bank_plain != bank_account_number
            or (existing.bank_ifsc or None) != bank_ifsc
        )

        bank_encrypted = encrypt_bank_account_number(bank_account_number) if bank_account_number else None
        masked_acc = f"••••{bank_account_number[-4:]}" if bank_account_number and len(bank_account_number) >= 4 else bank_account_number

        if existing is None:
            from datetime import datetime, timezone
            account = OwnerPayoutAccount(
                owner_id=owner_id,
                upi_vpa=upi_vpa,
                bank_account_number_encrypted=bank_encrypted,
                bank_account_number_masked=masked_acc,
                bank_ifsc=bank_ifsc,
                bank_name=bank_name,
                account_type=account_type,
                account_holder_name=account_holder_name or default_holder_name,
                business_pan=business_pan,
                payout_verification_status="unverified",
                submitted_at=datetime.now(timezone.utc),
            )
            self.db.add(account)
        else:
            account = existing
            account.upi_vpa = upi_vpa
            account.bank_account_number_encrypted = bank_encrypted
            account.bank_account_number_masked = masked_acc
            account.bank_ifsc = bank_ifsc
            account.bank_name = bank_name
            account.account_type = account_type
            account.account_holder_name = account_holder_name or default_holder_name
            account.business_pan = business_pan
            if destination_changed:
                account.payout_verification_status = "unverified"
                account.verified_name = None
                account.verified_at = None
                account.verified_by_admin_id = None
                account.test_transfer_ref = None

        await self.db.flush()
        return account
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_owner_payout_repository_upsert.py -v`
Expected: PASS

- [ ] **Step 5: Wire into the submit endpoint**

In `backend/app/api/v1/owner.py`, replace the block at (originally) lines 582-607:

```python
    # Save Owner Payout Account if provided
    if payload.bank_account_number or payload.bank_ifsc:
        stmt_payout = select(OwnerPayoutAccount).where(OwnerPayoutAccount.owner_id == current_user.id)
        res_payout = await db.execute(stmt_payout)
        payout_acc = res_payout.scalars().first()

        masked_acc = f"••••{payload.bank_account_number[-4:]}" if payload.bank_account_number and len(payload.bank_account_number) >= 4 else payload.bank_account_number

        if not payout_acc:
            payout_acc = OwnerPayoutAccount(
                owner_id=current_user.id,
                kyc_status="submitted",
                business_pan=payload.business_pan,
                bank_account_number_masked=masked_acc,
                bank_ifsc=payload.bank_ifsc,
                account_holder_name=payload.account_holder_name or current_user.full_name,
                details={"full_account": payload.bank_account_number},
                submitted_at=datetime.now(timezone.utc)
            )
            db.add(payout_acc)
        else:
            payout_acc.kyc_status = "submitted"
            payout_acc.business_pan = payload.business_pan
            payout_acc.bank_account_number_masked = masked_acc
            payout_acc.bank_ifsc = payload.bank_ifsc
            payout_acc.account_holder_name = payload.account_holder_name or current_user.full_name
```

with:

```python
    # Save Owner Payout Account (UPI + optional bank fallback). upi_vpa is
    # required by OnboardingSubmitRequest, so this always runs.
    payout_repo = OwnerPayoutRepository(db)
    await payout_repo.upsert_payout_details(
        owner_id=current_user.id,
        upi_vpa=payload.upi_vpa,
        bank_account_number=payload.bank_account_number,
        bank_ifsc=payload.bank_ifsc,
        account_holder_name=payload.account_holder_name,
        bank_name=payload.bank_name,
        account_type=payload.account_type,
        business_pan=payload.business_pan,
        default_holder_name=current_user.full_name,
    )
```

Add the import near the other repository imports at the top of the file:

```python
from app.repositories.owner_payout_repository import OwnerPayoutRepository
```

- [ ] **Step 6: Run the onboarding submit tests to confirm no regression**

Run: `cd backend && python -m pytest tests/test_platform_onboarding_submit.py tests/test_onboarding_payout_validation.py -v`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/app/repositories/owner_payout_repository.py backend/app/api/v1/owner.py backend/tests/test_owner_payout_repository_upsert.py
git commit -m "feat(payouts): persist UPI/bank details with verification reset-on-change"
```

---

### Task 5: Admin payout-verification endpoint

**Files:**
- Modify: `backend/app/api/v1/admin_cafe_payouts.py`
- Test: `backend/tests/test_admin_payout_verification.py`

**Interfaces:**
- Consumes: `OwnerPayoutRepository.get_by_owner_id` (Task 4's file, unchanged method), `CafeRepository.get_by_id` (existing).
- Produces: `POST /api/v1/admin/cafe-payouts/{cafe_id}/verify-payout` — Task 6's payout gate and Task 10's frontend button both depend on this endpoint's existence and response shape `{success, data: {payoutVerificationStatus, verifiedName, verifiedAt}}`.

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_admin_payout_verification.py
import pytest
from uuid import uuid4
from httpx import AsyncClient

from app.main import app
from app.models.owner_payout_account import OwnerPayoutAccount
from tests.conftest import auth_headers
from tests.test_admin_v2_features import _make_admin, _make_gamer, _make_booking_with_payment


@pytest.mark.asyncio
async def test_admin_can_verify_payout_destination(db_session):
    admin = await _make_admin(db_session)
    gamer = await _make_gamer(db_session, "verify_gamer")
    booking, payment = await _make_booking_with_payment(db_session, gamer)

    account = OwnerPayoutAccount(id=uuid4(), owner_id=booking.cafe.owner_id if hasattr(booking, "cafe") else None)
    # booking has no eager-loaded .cafe relationship in this fixture; fetch owner_id via cafe_id instead
    from sqlalchemy import select
    from app.models.cafe import Cafe
    cafe_row = (await db_session.execute(select(Cafe).where(Cafe.id == booking.cafe_id))).scalars().first()
    account.owner_id = cafe_row.owner_id
    account.upi_vpa = "cafeowner@okhdfcbank"
    db_session.add(account)
    await db_session.commit()

    async with AsyncClient(app=app, base_url="http://test") as client:
        headers = auth_headers(admin, is_admin=True)
        res = await client.post(
            f"/api/v1/admin/cafe-payouts/{booking.cafe_id}/verify-payout",
            json={"utrReference": "UTR-TEST-1", "verifiedName": "Cafe Owner Pvt Ltd"},
            headers=headers,
        )
        assert res.status_code == 200, res.text
        data = res.json()["data"]
        assert data["payoutVerificationStatus"] == "verified"
        assert data["verifiedName"] == "Cafe Owner Pvt Ltd"

        audit_res = await client.get(
            "/api/v1/admin/audit-log?entityType=owner_payout_account", headers=headers
        )
        assert audit_res.status_code == 200
        assert any(a["action"] == "payout_verified" for a in audit_res.json()["data"]["items"])


@pytest.mark.asyncio
async def test_verify_rejects_when_no_payout_details_submitted(db_session):
    admin = await _make_admin(db_session)
    gamer = await _make_gamer(db_session, "no_details_gamer")
    booking, payment = await _make_booking_with_payment(db_session, gamer)

    async with AsyncClient(app=app, base_url="http://test") as client:
        headers = auth_headers(admin, is_admin=True)
        res = await client.post(
            f"/api/v1/admin/cafe-payouts/{booking.cafe_id}/verify-payout",
            json={"utrReference": "UTR-NONE", "verifiedName": "Nobody"},
            headers=headers,
        )
        assert res.status_code == 400


@pytest.mark.asyncio
async def test_verify_rejects_already_verified(db_session):
    admin = await _make_admin(db_session)
    gamer = await _make_gamer(db_session, "already_verified_gamer")
    booking, payment = await _make_booking_with_payment(db_session, gamer)

    from sqlalchemy import select
    from app.models.cafe import Cafe
    cafe_row = (await db_session.execute(select(Cafe).where(Cafe.id == booking.cafe_id))).scalars().first()
    account = OwnerPayoutAccount(
        id=uuid4(), owner_id=cafe_row.owner_id, upi_vpa="already@okaxis",
        payout_verification_status="verified", verified_name="Existing",
    )
    db_session.add(account)
    await db_session.commit()

    async with AsyncClient(app=app, base_url="http://test") as client:
        headers = auth_headers(admin, is_admin=True)
        res = await client.post(
            f"/api/v1/admin/cafe-payouts/{booking.cafe_id}/verify-payout",
            json={"utrReference": "UTR-AGAIN", "verifiedName": "Someone Else"},
            headers=headers,
        )
        assert res.status_code == 400


@pytest.mark.asyncio
async def test_non_admin_cannot_verify_payout(db_session):
    gamer = await _make_gamer(db_session, "blocked_verify_gamer")
    async with AsyncClient(app=app, base_url="http://test") as client:
        headers = auth_headers(gamer)
        res = await client.post(
            f"/api/v1/admin/cafe-payouts/{uuid4()}/verify-payout",
            json={"utrReference": "UTR-X", "verifiedName": "X"},
            headers=headers,
        )
        assert res.status_code == 403
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_admin_payout_verification.py -v`
Expected: FAIL with 404 (route doesn't exist yet)

- [ ] **Step 3: Implement the endpoint**

In `backend/app/api/v1/admin_cafe_payouts.py`, add imports and the new endpoint. Full new file contents:

```python
from typing import Optional
from uuid import UUID
from datetime import datetime, timezone
import uuid as _uuid

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_admin
from app.core.exceptions import BadRequestException, NotFoundException
from app.database import get_db
from app.models.user import User
from app.models.admin_audit_log import AdminAuditLog
from app.repositories.cafe_payout_repository import CafePayoutRepository
from app.repositories.cafe_repository import CafeRepository
from app.repositories.owner_payout_repository import OwnerPayoutRepository

router = APIRouter()


class CafePayoutCreateRequest(BaseModel):
    utrReference: str
    paymentMethod: str
    notes: Optional[str] = None


class PayoutVerifyRequest(BaseModel):
    utrReference: str
    verifiedName: str


@router.get("/outstanding", status_code=status.HTTP_200_OK)
async def list_outstanding_cafe_payouts(
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    repo = CafePayoutRepository(db)
    cafes = await repo.list_cafes_with_outstanding()
    return {"success": True, "data": {"cafes": cafes}}


@router.get("/{cafe_id}/breakdown", status_code=status.HTTP_200_OK)
async def get_cafe_payout_breakdown(
    cafe_id: UUID,
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    repo = CafePayoutRepository(db)
    bookings = await repo.get_outstanding_breakdown(cafe_id)
    return {"success": True, "data": {"bookings": bookings}}


@router.post("/{cafe_id}/verify-payout", status_code=status.HTTP_200_OK)
async def verify_cafe_payout_destination(
    cafe_id: UUID,
    payload: PayoutVerifyRequest,
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Records the ₹1 test transfer's outcome. The admin's UPI app shows the
    recipient's registered name before the transfer is confirmed — recording
    that name here is the actual verification; there is no third-party
    validation call. Flips the destination to "verified", which is what
    CafePayoutRepository.create_payout checks before allowing a real payout."""
    cafe = await CafeRepository(db).get_by_id(cafe_id)
    if not cafe:
        raise NotFoundException("Café not found")

    payout_repo = OwnerPayoutRepository(db)
    account = await payout_repo.get_by_owner_id(cafe.owner_id)
    if not account or not account.upi_vpa:
        raise BadRequestException("This café hasn't submitted payout details yet.")
    if account.payout_verification_status == "verified":
        raise BadRequestException("This café's payout destination is already verified.")

    account.payout_verification_status = "verified"
    account.verified_name = payload.verifiedName
    account.verified_at = datetime.now(timezone.utc)
    account.verified_by_admin_id = current_admin.id
    account.test_transfer_ref = payload.utrReference

    db.add(AdminAuditLog(
        id=_uuid.uuid4(),
        admin_id=current_admin.id,
        admin_email=current_admin.email,
        action="payout_verified",
        entity_type="owner_payout_account",
        entity_id=str(account.id),
        entity_name=cafe.name,
        reason=f"Test transfer {payload.utrReference} confirmed recipient name: {payload.verifiedName}",
    ))

    await db.commit()
    await db.refresh(account)

    return {
        "success": True,
        "data": {
            "payoutVerificationStatus": account.payout_verification_status,
            "verifiedName": account.verified_name,
            "verifiedAt": account.verified_at.isoformat(),
        },
    }


@router.post("/{cafe_id}", status_code=status.HTTP_201_CREATED)
async def create_cafe_payout(
    cafe_id: UUID,
    payload: CafePayoutCreateRequest,
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    cafe = await CafeRepository(db).get_by_id(cafe_id)

    repo = CafePayoutRepository(db)
    try:
        payout = await repo.create_payout(
            cafe_id=cafe_id,
            admin_id=current_admin.id,
            utr_reference=payload.utrReference,
            payment_method=payload.paymentMethod,
            notes=payload.notes,
            audit_log_data={
                "admin_id": current_admin.id,
                "admin_email": current_admin.email,
                "action": "cafe_payout.create",
                "entity_type": "cafe_payout",
                "entity_name": cafe.name if cafe else None,
                "reason": payload.notes,
            },
        )
    except IntegrityError:
        await db.rollback()
        raise BadRequestException("This café's balance was just paid out by another request.")

    return {
        "success": True,
        "data": {
            "payout": {
                "id": str(payout.id),
                "cafeId": str(payout.cafe_id),
                "amount": float(payout.amount),
                "utrReference": payout.utr_reference,
                "paymentMethod": payout.payment_method,
                "status": payout.status.value,
                "paidAt": payout.paid_at.isoformat() if payout.paid_at else None,
            }
        },
    }


@router.get("", status_code=status.HTTP_200_OK)
async def list_cafe_payouts(
    cafeId: Optional[UUID] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=50),
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    repo = CafePayoutRepository(db)
    result = await repo.list_payouts(cafe_id=cafeId, status=status_filter, page=page, limit=limit)
    return {"success": True, "data": result}
```

Note the `/{cafe_id}/verify-payout` route is declared before the generic `/{cafe_id}` POST route — FastAPI matches routes in declaration order, and both are POST with a path parameter, so `verify-payout` must come first or `/{cafe_id}` (which has no further path segment) won't actually conflict since it doesn't have a trailing segment. Order doesn't strictly matter here since the paths are distinguishable by segment count, but keeping `verify-payout` grouped with `breakdown` above the generic create keeps the file's GET-then-mutate reading order intact.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_admin_payout_verification.py -v`
Expected: PASS

- [ ] **Step 5: Run the full admin cafe payouts suite to confirm no regression**

Run: `cd backend && python -m pytest tests/test_admin_cafe_payouts_api.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/v1/admin_cafe_payouts.py backend/tests/test_admin_payout_verification.py
git commit -m "feat(payouts): add admin ₹1 test-transfer verification endpoint"
```

---

### Task 6: Payout gate + verification status in outstanding list

**Files:**
- Modify: `backend/app/repositories/cafe_payout_repository.py`
- Test: `backend/tests/test_cafe_payout_repository.py` (add new tests to the existing file)

**Interfaces:**
- Consumes: `OwnerPayoutAccount.payout_verification_status` (Task 1).
- Produces: `CafePayoutRepository.create_payout` now raises `BadRequestException` for an unverified café's owner. `list_cafes_with_outstanding()` items gain `payoutVerificationStatus: str`. Task 11's frontend reads this new key.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_cafe_payout_repository.py` (open the file first to match its existing helper functions/imports — reuse whatever café/booking/payment factory helpers it already defines rather than redefining them):

```python
@pytest.mark.asyncio
async def test_create_payout_rejects_unverified_cafe(db_session):
    """Money must never leave the door for a café whose UPI/bank destination
    hasn't been confirmed real via the ₹1 test transfer."""
    from app.models.owner_payout_account import OwnerPayoutAccount
    from uuid import uuid4

    gamer = await _make_gamer(db_session, "gate_gamer")
    booking, payment = await _make_booking_with_payment(db_session, gamer)
    fee = PlatformFee(id=uuid4(), booking_id=booking.id, owner_settlement_amount=50.0)
    db_session.add(fee)

    from sqlalchemy import select
    from app.models.cafe import Cafe
    cafe_row = (await db_session.execute(select(Cafe).where(Cafe.id == booking.cafe_id))).scalars().first()
    account = OwnerPayoutAccount(id=uuid4(), owner_id=cafe_row.owner_id, upi_vpa="unverified@okaxis")
    db_session.add(account)
    await db_session.commit()

    repo = CafePayoutRepository(db_session)
    with pytest.raises(BadRequestException):
        await repo.create_payout(
            cafe_id=booking.cafe_id, admin_id=uuid4(),
            utr_reference="UTR-GATE", payment_method="upi",
        )


@pytest.mark.asyncio
async def test_create_payout_succeeds_for_verified_cafe(db_session):
    from app.models.owner_payout_account import OwnerPayoutAccount
    from uuid import uuid4

    gamer = await _make_gamer(db_session, "verified_gate_gamer")
    booking, payment = await _make_booking_with_payment(db_session, gamer)
    fee = PlatformFee(id=uuid4(), booking_id=booking.id, owner_settlement_amount=50.0)
    db_session.add(fee)

    from sqlalchemy import select
    from app.models.cafe import Cafe
    cafe_row = (await db_session.execute(select(Cafe).where(Cafe.id == booking.cafe_id))).scalars().first()
    account = OwnerPayoutAccount(
        id=uuid4(), owner_id=cafe_row.owner_id, upi_vpa="verified@okaxis",
        payout_verification_status="verified",
    )
    db_session.add(account)
    await db_session.commit()

    repo = CafePayoutRepository(db_session)
    payout = await repo.create_payout(
        cafe_id=booking.cafe_id, admin_id=uuid4(),
        utr_reference="UTR-VERIFIED", payment_method="upi",
    )
    assert payout.amount == 50.0


@pytest.mark.asyncio
async def test_outstanding_list_reports_verification_status(db_session):
    from app.models.owner_payout_account import OwnerPayoutAccount
    from uuid import uuid4

    gamer = await _make_gamer(db_session, "list_status_gamer")
    booking, payment = await _make_booking_with_payment(db_session, gamer)
    fee = PlatformFee(id=uuid4(), booking_id=booking.id, owner_settlement_amount=25.0)
    db_session.add(fee)

    from sqlalchemy import select
    from app.models.cafe import Cafe
    cafe_row = (await db_session.execute(select(Cafe).where(Cafe.id == booking.cafe_id))).scalars().first()
    account = OwnerPayoutAccount(id=uuid4(), owner_id=cafe_row.owner_id, upi_vpa="listed@okaxis")
    db_session.add(account)
    await db_session.commit()

    repo = CafePayoutRepository(db_session)
    cafes = await repo.list_cafes_with_outstanding()
    entry = next(c for c in cafes if c["cafeId"] == str(booking.cafe_id))
    assert entry["payoutVerificationStatus"] == "unverified"
```

Check the top of `backend/tests/test_cafe_payout_repository.py` for its existing imports (`_make_gamer`, `_make_booking_with_payment`, `PlatformFee`, `BadRequestException`, `CafePayoutRepository`, `pytest`) before appending — add any that are missing from the file's current import block rather than re-importing inline where the file already imports at module level.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_cafe_payout_repository.py -v -k "unverified_cafe or verified_cafe or verification_status"`
Expected: `test_create_payout_rejects_unverified_cafe` FAILS (no gate exists yet — payout succeeds instead of raising); `test_outstanding_list_reports_verification_status` FAILS with `KeyError: 'payoutVerificationStatus'`.

- [ ] **Step 3: Add the payout gate and status field**

In `backend/app/repositories/cafe_payout_repository.py`, add the import:

```python
from app.models.owner_payout_account import OwnerPayoutAccount
```

Modify `create_payout` — insert this check right after the docstring, before `rows = await self.get_outstanding_fee_rows(cafe_id)`:

```python
        cafe_owner_row = (await self.db.execute(
            select(Cafe.owner_id).where(Cafe.id == cafe_id)
        )).first()
        if not cafe_owner_row:
            raise BadRequestException("Café not found.")
        owner_id = cafe_owner_row[0]

        verification_status = (await self.db.execute(
            select(OwnerPayoutAccount.payout_verification_status).where(OwnerPayoutAccount.owner_id == owner_id)
        )).scalar()
        if verification_status != "verified":
            raise BadRequestException(
                "This café's payout destination hasn't been verified yet. "
                "Send a ₹1 test transfer and record the result before paying out."
            )
```

Modify `list_cafes_with_outstanding`:

```python
    async def list_cafes_with_outstanding(self) -> list[dict]:
        cafes_result = await self.db.execute(select(Cafe.id, Cafe.name, Cafe.owner_id))
        out = []
        for cafe_id, cafe_name, owner_id in cafes_result.all():
            amount = await self.get_outstanding_amount(cafe_id)
            if amount > 0:
                verification_status = (await self.db.execute(
                    select(OwnerPayoutAccount.payout_verification_status).where(OwnerPayoutAccount.owner_id == owner_id)
                )).scalar() or "unverified"
                out.append({
                    "cafeId": str(cafe_id),
                    "cafeName": cafe_name,
                    "outstandingAmount": float(amount),
                    "payoutVerificationStatus": verification_status,
                })
        return out
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_cafe_payout_repository.py -v`
Expected: PASS (all tests in the file, including pre-existing ones)

- [ ] **Step 5: Run the admin cafe payouts API suite — it will now need a verified café to pass**

Run: `cd backend && python -m pytest tests/test_admin_cafe_payouts_api.py -v`
Expected: FAIL — `test_admin_can_list_outstanding_and_create_payout` and `test_concurrent_payout_creation_returns_clean_400_not_500` create a payout without first marking the café's `OwnerPayoutAccount` as verified, so `create_payout` now rejects them. Fix by adding, right after each test's `fee = PlatformFee(...)` / `db_session.add(fee)` block and before `await db_session.commit()`:

```python
    from app.models.owner_payout_account import OwnerPayoutAccount
    from uuid import uuid4 as _uuid4
    db_session.add(OwnerPayoutAccount(
        id=_uuid4(), owner_id=booking.cafe.owner_id if hasattr(booking, "cafe") else None,
        upi_vpa="test@okaxis", payout_verification_status="verified",
    ))
```

Since `booking.cafe` may not be eagerly loaded in that fixture, fetch it explicitly instead — replace the snippet above with:

```python
    from app.models.owner_payout_account import OwnerPayoutAccount
    from app.models.cafe import Cafe
    from sqlalchemy import select as _select
    from uuid import uuid4 as _uuid4
    cafe_row = (await db_session.execute(_select(Cafe).where(Cafe.id == booking.cafe_id))).scalars().first()
    db_session.add(OwnerPayoutAccount(
        id=_uuid4(), owner_id=cafe_row.owner_id,
        upi_vpa="test@okaxis", payout_verification_status="verified",
    ))
```

Re-run: `cd backend && python -m pytest tests/test_admin_cafe_payouts_api.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/repositories/cafe_payout_repository.py backend/tests/test_cafe_payout_repository.py backend/tests/test_admin_cafe_payouts_api.py
git commit -m "feat(payouts): block payout creation until destination is verified"
```

---

### Task 7: Admin café detail enrichment + plaintext-leak fix

**Files:**
- Modify: `backend/app/services/cafe_service.py` (lines ~115-124)
- Modify: `backend/app/schemas/admin.py` (`AdminCafeDetailResponse`, lines ~40-57)
- Test: `backend/tests/test_admin_cafe_detail_payout_fields.py`

**Interfaces:**
- Produces: `AdminCafeDetailResponse` gains `upi_vpa`, `payout_verification_status`, `verified_name` (all `Optional[str]`). Task 10's frontend reads these via the existing `/api/v1/admin/cafes/pending` and `/api/v1/admin/cafes/{cafe_id}` endpoints (both already call `_build_cafe_response(..., response_cls=AdminCafeDetailResponse)`).

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_admin_cafe_detail_payout_fields.py
import pytest
import uuid
from httpx import AsyncClient

from app.main import app
from app.models.owner_payout_account import OwnerPayoutAccount
from tests.conftest import auth_headers
from tests.test_admin_v2_features import _make_admin, _make_gamer, _make_booking_with_payment


@pytest.mark.asyncio
async def test_admin_cafe_detail_includes_upi_and_verification_status(db_session):
    admin = await _make_admin(db_session)
    gamer = await _make_gamer(db_session, "detail_gamer")
    booking, payment = await _make_booking_with_payment(db_session, gamer)

    from sqlalchemy import select
    from app.models.cafe import Cafe
    cafe_row = (await db_session.execute(select(Cafe).where(Cafe.id == booking.cafe_id))).scalars().first()
    db_session.add(OwnerPayoutAccount(
        id=uuid.uuid4(), owner_id=cafe_row.owner_id, upi_vpa="detail@okaxis",
        payout_verification_status="verified", verified_name="Detail Test Name",
        bank_account_number_encrypted="gAAAAA_should_never_appear_in_response",
    ))
    await db_session.commit()

    async with AsyncClient(app=app, base_url="http://test") as client:
        headers = auth_headers(admin, is_admin=True)
        res = await client.get(f"/api/v1/admin/cafes/{booking.cafe_id}", headers=headers)
        assert res.status_code == 200, res.text
        cafe = res.json()["data"]["cafe"]
        assert cafe["upiVpa"] == "detail@okaxis"
        assert cafe["payoutVerificationStatus"] == "verified"
        assert cafe["verifiedName"] == "Detail Test Name"
        assert "gAAAAA_should_never_appear_in_response" not in res.text
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_admin_cafe_detail_payout_fields.py -v`
Expected: FAIL — `KeyError: 'upiVpa'`

- [ ] **Step 3: Extend `AdminCafeDetailResponse`**

In `backend/app/schemas/admin.py`, in `AdminCafeDetailResponse`, add after the `account_holder_name` line:

```python
    upi_vpa: Optional[str] = None
    payout_verification_status: Optional[str] = None
    verified_name: Optional[str] = None
```

- [ ] **Step 4: Update the enrichment block and remove the plaintext fallback**

In `backend/app/services/cafe_service.py`, replace lines 115-124:

```python
        if hasattr(resp, "bank_account_number") and getattr(resp, "bank_account_number", None) is None:
            from app.models.owner_payout_account import OwnerPayoutAccount
            from sqlalchemy import select
            stmt_payout = select(OwnerPayoutAccount).where(OwnerPayoutAccount.owner_id == cafe.owner_id)
            res_payout = await self.cafe_repo.db.execute(stmt_payout)
            payout_acc = res_payout.scalars().first()
            if payout_acc:
                resp.bank_account_number = payout_acc.bank_account_number_masked or (payout_acc.details.get("full_account") if payout_acc.details else None)
                resp.bank_ifsc = payout_acc.bank_ifsc
                resp.account_holder_name = payout_acc.account_holder_name
```

with:

```python
        if hasattr(resp, "bank_account_number") and getattr(resp, "bank_account_number", None) is None:
            from app.models.owner_payout_account import OwnerPayoutAccount
            from sqlalchemy import select
            stmt_payout = select(OwnerPayoutAccount).where(OwnerPayoutAccount.owner_id == cafe.owner_id)
            res_payout = await self.cafe_repo.db.execute(stmt_payout)
            payout_acc = res_payout.scalars().first()
            if payout_acc:
                # Masked value only — the encrypted account number is never
                # decrypted for an API response. The old plaintext
                # details["full_account"] fallback is retired entirely.
                resp.bank_account_number = payout_acc.bank_account_number_masked
                resp.bank_ifsc = payout_acc.bank_ifsc
                resp.account_holder_name = payout_acc.account_holder_name
                if hasattr(resp, "upi_vpa"):
                    resp.upi_vpa = payout_acc.upi_vpa
                if hasattr(resp, "payout_verification_status"):
                    resp.payout_verification_status = payout_acc.payout_verification_status
                if hasattr(resp, "verified_name"):
                    resp.verified_name = payout_acc.verified_name
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_admin_cafe_detail_payout_fields.py -v`
Expected: PASS

- [ ] **Step 6: Run the broader admin/cafe test suites to confirm no regression**

Run: `cd backend && python -m pytest tests/test_admin_v2_features.py tests/test_admin_cafe_payouts_api.py -v`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/app/services/cafe_service.py backend/app/schemas/admin.py backend/tests/test_admin_cafe_detail_payout_fields.py
git commit -m "feat(payouts): expose UPI/verification status in admin café detail, retire plaintext bank fallback"
```

---

### Task 8: Onboarding wizard — UPI fields, bank fallback, validation fixes

**Files:**
- Modify: `frontend/src/app/(owner)/owner/onboarding/page.tsx`

**Interfaces:**
- Consumes: nothing new from other tasks (frontend calls the already-permissive `submitOnboardingApplication(body: any)`).
- Produces: the submitted payload now includes `upiVpa`, `confirmUpiVpa`, `hasGst`, `bankName`, `accountType`, `confirmBankAccountNumber` — matching Task 3's `OnboardingSubmitRequest` field names (camelCase alias).

This is a manual-verification task (no backend test can exercise a React form) — verify by running the dev server and walking the wizard, per Step 6 below.

- [ ] **Step 1: Update `OnboardingState` and `INITIAL_STATE`**

In `frontend/src/app/(owner)/owner/onboarding/page.tsx`, update the `OnboardingState` interface — add after `email: string;`:

```typescript
  upiVpa: string;
  confirmUpiVpa: string;
  confirmBankAccountNumber: string;
  bankName: string;
  accountType: 'savings' | 'current' | '';
```

Update `INITIAL_STATE`:
- Change `businessPan: 'ABCDE1234F',` to `businessPan: '',` (the pre-filled fake PAN currently ships silently on every un-edited submission).
- Add the new fields with blank defaults, next to the existing `bankAccountNumber: '',` line:

```typescript
  upiVpa: '',
  confirmUpiVpa: '',
  confirmBankAccountNumber: '',
  bankName: '',
  accountType: '',
```

- [ ] **Step 2: Add local UI state for the bank-fallback disclosure**

Inside `OnboardingWizardPage`, next to the existing `useState` declarations, add:

```typescript
  const [showBankFallback, setShowBankFallback] = useState(false);
```

- [ ] **Step 3: Fix step-2/step-3 validation split in `handleNext`**

Replace the Step 2 validation block:

```typescript
    // Step 2: Business verification
    if (step === 2) {
      if (formData.phoneNumber && !/^\+91[6-9]\d{9}$/.test(formData.phoneNumber)) {
        setError('Please enter a valid Indian mobile number (+91 XXXXX XXXXX).');
        return;
      }
      if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
        setError('Please enter a valid email address.');
        return;
      }
      if (formData.hasGst && formData.gstin) {
        const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
        if (!GSTIN_REGEX.test(formData.gstin.toUpperCase())) {
          setError('Please enter a valid 15-character GSTIN (e.g. 29ABCDE1234F1Z5).');
          return;
        }
      }
    }
```

with (adds the missing "GST checked but blank" guard, and moves PAN validation here from step 3):

```typescript
    // Step 2: Business verification
    if (step === 2) {
      if (formData.phoneNumber && !/^\+91[6-9]\d{9}$/.test(formData.phoneNumber)) {
        setError('Please enter a valid Indian mobile number (+91 XXXXX XXXXX).');
        return;
      }
      if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
        setError('Please enter a valid email address.');
        return;
      }
      if (formData.businessPan) {
        const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
        if (!panRegex.test(formData.businessPan.toUpperCase())) {
          setError('Please enter a valid 10-character Business PAN format (e.g. ABCDE1234F).');
          return;
        }
      }
      if (formData.hasGst && !formData.gstin) {
        setError('GSTIN is required when you have GST registration.');
        return;
      }
      if (formData.hasGst && formData.gstin) {
        const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
        if (!GSTIN_REGEX.test(formData.gstin.toUpperCase())) {
          setError('Please enter a valid 15-character GSTIN (e.g. 29ABCDE1234F1Z5).');
          return;
        }
      }
    }
```

Replace the Step 3 validation block:

```typescript
    // Step 3: Bank & Payouts
    if (step === 3) {
      if (formData.businessPan) {
        const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
        if (!panRegex.test(formData.businessPan.toUpperCase())) {
          setError('Please enter a valid 10-character Business PAN format (e.g. ABCDE1234F).');
          return;
        }
      }
      if (formData.accountHolderName && formData.accountHolderName.length < 2) {
        setError('Account holder name must be at least 2 characters.');
        return;
      }
      if (formData.bankAccountNumber) {
        if (!/^\d{8,18}$/.test(formData.bankAccountNumber)) {
          setError('Bank account number must be 8-18 digits.');
          return;
        }
        if (!formData.bankIfsc || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(formData.bankIfsc.toUpperCase())) {
          setError('Please enter a valid Bank IFSC code (e.g. HDFC0000128).');
          return;
        }
      }
      if (formData.bankIfsc && !formData.bankAccountNumber) {
        setError('Please enter bank account number along with IFSC code.');
        return;
      }
    }
```

with:

```typescript
    // Step 3: Payout Details (UPI required, bank fallback optional)
    if (step === 3) {
      const upiRegex = /^[\w.\-]{2,256}@[a-zA-Z]{2,64}$/;
      if (!formData.upiVpa || !upiRegex.test(formData.upiVpa)) {
        setError('Please enter a valid UPI ID (e.g. yourname@okhdfcbank).');
        return;
      }
      if (formData.upiVpa.trim().toLowerCase() !== formData.confirmUpiVpa.trim().toLowerCase()) {
        setError('UPI ID and confirmation do not match.');
        return;
      }

      const bankFieldsGiven = !!(formData.accountHolderName || formData.bankAccountNumber || formData.bankIfsc);
      if (bankFieldsGiven) {
        if (!formData.accountHolderName || formData.accountHolderName.trim().length < 2) {
          setError('Account holder name must be at least 2 characters.');
          return;
        }
        if (!/^\d{8,18}$/.test(formData.bankAccountNumber)) {
          setError('Bank account number must be 8-18 digits.');
          return;
        }
        if (formData.bankAccountNumber !== formData.confirmBankAccountNumber) {
          setError('Bank account number and confirmation do not match.');
          return;
        }
        if (!formData.bankIfsc || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(formData.bankIfsc.toUpperCase())) {
          setError('Please enter a valid Bank IFSC code (e.g. HDFC0000128).');
          return;
        }
      }
    }
```

- [ ] **Step 4: Rewrite the Step 3 JSX**

Replace the entire `{/* STEP 3: BANK & PAYOUTS */}` block:

```tsx
            {/* STEP 3: BANK & PAYOUTS */}
            {step === 3 && (
              <div className="flex flex-col gap-4">
                <div>
                  <h2 className="font-heading text-h2 text-text-primary flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-emerald-500" />
                    <span>3. Bank Account & Razorpay Route Settlement</span>
                  </h2>
                  <p className="text-caption text-text-secondary">Direct automated payouts into your bank account.</p>
                </div>

                <Card elevation="resting" className="bg-emerald-500/5 border border-emerald-500/20 text-caption p-4">
                  <span className="font-semibold text-emerald-600 block mb-1">Razorpay Route Direct Settlement</span>
                  KHEL processes customer payments securely through Razorpay Route. Earnings settle directly to your registered bank account.
                </Card>

                <Input
                  label="Account Holder Name"
                  placeholder="e.g. LXG Gaming Private Limited"
                  value={formData.accountHolderName}
                  onChange={(e) => updateField('accountHolderName', e.target.value)}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    label="Bank Account Number"
                    name="bank-account-number"
                    autoComplete="off"
                    placeholder="9180200192847291"
                    value={formData.bankAccountNumber}
                    onChange={(e) => updateField('bankAccountNumber', e.target.value)}
                  />

                  <Input
                    label="Bank IFSC Code"
                    name="bank-ifsc-code"
                    autoComplete="off"
                    placeholder="HDFC0000128"
                    value={formData.bankIfsc}
                    onChange={(e) => updateField('bankIfsc', e.target.value.toUpperCase())}
                  />
                </div>
              </div>
            )}
```

with:

```tsx
            {/* STEP 3: PAYOUT DETAILS */}
            {step === 3 && (
              <div className="flex flex-col gap-4">
                <div>
                  <h2 className="font-heading text-h2 text-text-primary flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-emerald-500" />
                    <span>3. Payout Details</span>
                  </h2>
                  <p className="text-caption text-text-secondary">KHEL-O pays out your weekly earnings via UPI. Add your UPI ID below so we know where to send it.</p>
                </div>

                <Card elevation="resting" className="bg-emerald-500/5 border border-emerald-500/20 text-caption p-4">
                  <span className="font-semibold text-emerald-600 block mb-1">Manual Weekly Payouts</span>
                  Every booking's earnings accrue in your dashboard. Our team pays out your outstanding balance weekly, straight to the UPI ID below. Before your first payout, we'll send a ₹1 test transfer to confirm the ID is correct.
                </Card>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    label="UPI ID *"
                    placeholder="yourname@okhdfcbank"
                    value={formData.upiVpa}
                    onChange={(e) => updateField('upiVpa', e.target.value)}
                    required
                  />
                  <Input
                    label="Confirm UPI ID *"
                    placeholder="yourname@okhdfcbank"
                    value={formData.confirmUpiVpa}
                    onChange={(e) => updateField('confirmUpiVpa', e.target.value)}
                    required
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setShowBankFallback((v) => !v)}
                  className="self-start text-caption font-semibold text-primary hover:underline"
                >
                  {showBankFallback ? 'Hide bank details' : '+ Add bank details (optional, recommended for larger payouts)'}
                </button>

                {showBankFallback && (
                  <div className="flex flex-col gap-4 p-4 rounded-2xl border border-border bg-surface">
                    <p className="text-overline text-text-tertiary">
                      A bank fallback lets us pay you by NEFT/IMPS if a weekly balance ever exceeds what UPI can carry in a single transfer.
                    </p>
                    <Input
                      label="Account Holder Name"
                      placeholder="e.g. LXG Gaming Private Limited"
                      value={formData.accountHolderName}
                      onChange={(e) => updateField('accountHolderName', e.target.value)}
                    />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Input
                        label="Bank Account Number"
                        name="bank-account-number"
                        autoComplete="off"
                        placeholder="9180200192847291"
                        value={formData.bankAccountNumber}
                        onChange={(e) => updateField('bankAccountNumber', e.target.value)}
                      />
                      <Input
                        label="Confirm Bank Account Number"
                        name="confirm-bank-account-number"
                        autoComplete="off"
                        placeholder="9180200192847291"
                        value={formData.confirmBankAccountNumber}
                        onChange={(e) => updateField('confirmBankAccountNumber', e.target.value)}
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Input
                        label="Bank IFSC Code"
                        name="bank-ifsc-code"
                        autoComplete="off"
                        placeholder="HDFC0000128"
                        value={formData.bankIfsc}
                        onChange={(e) => updateField('bankIfsc', e.target.value.toUpperCase())}
                      />
                      <Input
                        label="Bank Name"
                        placeholder="e.g. HDFC Bank"
                        value={formData.bankName}
                        onChange={(e) => updateField('bankName', e.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="text-caption font-semibold text-text-primary">Account Type</label>
                      <div className="flex gap-3">
                        {(['savings', 'current'] as const).map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => updateField('accountType', t)}
                            className={`flex-1 px-4 py-2 rounded-xl text-caption font-semibold capitalize transition-all ${
                              formData.accountType === t
                                ? 'bg-primary text-white border-2 border-primary'
                                : 'bg-surface text-text-secondary border border-border hover:border-primary'
                            }`}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
```

- [ ] **Step 5: Update `handleSubmit`'s payload and the review-step summary**

In the `submitOnboardingApplication({...})` call, add these fields (alongside the existing `businessPan`, `gstin` lines):

```typescript
        upiVpa: formData.upiVpa,
        confirmUpiVpa: formData.confirmUpiVpa,
        hasGst: formData.hasGst,
        bankName: formData.bankAccountNumber ? (formData.bankName || undefined) : undefined,
        accountType: formData.bankAccountNumber ? (formData.accountType || undefined) : undefined,
        confirmBankAccountNumber: formData.bankAccountNumber ? formData.confirmBankAccountNumber : undefined,
```

In the Step 6 review summary, replace:

```tsx
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Payout Account:</span>
                    <span className="font-semibold text-emerald-600">
                      {formData.bankAccountNumber ? `Masked Account (${formData.bankAccountNumber.slice(-4)})` : 'Not Provided'}
                    </span>
                  </div>
```

with:

```tsx
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Payout UPI ID:</span>
                    <span className="font-semibold text-emerald-600">{formData.upiVpa || 'Not Provided'}</span>
                  </div>
```

- [ ] **Step 6: Update the post-submit confirmation copy**

Replace:

```tsx
              <span>Admin reviews venue coordinates, legal documents & Razorpay Route payout setup.</span>
```

with:

```tsx
              <span>Admin reviews venue coordinates, legal documents & payout details.</span>
```

- [ ] **Step 7: Manually verify in the browser**

Run: `cd frontend && npm run dev` (or the project's existing dev-server invocation), then walk `/owner/onboarding` as a fresh gamer-role test account:
- Confirm step 2 blocks advancing with GST toggled on and GSTIN blank.
- Confirm step 2 blocks advancing with an invalid PAN.
- Confirm step 3 blocks advancing with no UPI ID, with mismatched UPI confirmation, and (after opening "Add bank details") with a mismatched account-number confirmation.
- Confirm a UPI-only submission (bank fallback left closed) succeeds end-to-end and the created café's `OwnerPayoutAccount` row has `upi_vpa` set and `payout_verification_status = "unverified"`.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/app/\(owner\)/owner/onboarding/page.tsx
git commit -m "feat(payouts): collect UPI-first payout details in onboarding wizard"
```

---

### Task 9: Remove Razorpay Route copy from owner-facing components

**Files:**
- Modify: `frontend/src/components/owner/ProspectiveOwnerView.tsx`
- Modify: `frontend/src/components/owner/PendingApprovalView.tsx`
- Modify: `frontend/src/components/owner/PayoutSetupCard.tsx`

**Interfaces:** none — copy-only changes, no props or data shape changes.

- [ ] **Step 1: `ProspectiveOwnerView.tsx`**

Replace line 21:
```tsx
            Fill idle PC stations, automate hourly bookings, and receive direct Razorpay Route payouts. Join over 30+ top gaming lounges across India.
```
with:
```tsx
            Fill idle PC stations, automate hourly bookings, and get paid out weekly via UPI or bank transfer. Join over 30+ top gaming lounges across India.
```

Replace line 43:
```tsx
              Seamless Razorpay Route automated settlements straight into your bank account with complete fee transparency.
```
with:
```tsx
              Reliable weekly payouts straight to your UPI ID or bank account, with complete fee transparency.
```

Replace line 85:
```tsx
              'Bank Payout Account (Razorpay)',
```
with:
```tsx
              'Payout Details (UPI/Bank)',
```

- [ ] **Step 2: `PendingApprovalView.tsx`**

Replace line 50:
```tsx
              <span>Verification of business documents & Razorpay Route payout setup (in progress)</span>
```
with:
```tsx
              <span>Verification of business documents & payout details (in progress)</span>
```

- [ ] **Step 3: `PayoutSetupCard.tsx`**

Replace lines 92-95:
```tsx
            <p className="text-caption text-text-secondary max-w-md">
              Add your bank details once to receive future booking payments directly via Razorpay Route,
              instead of manual settlement.
            </p>
```
with:
```tsx
            <p className="text-caption text-text-secondary max-w-md">
              These are the bank details our team pays your weekly balance out to. You already added
              your primary UPI ID during onboarding — this card manages your bank fallback.
            </p>
```

- [ ] **Step 4: Verify no Razorpay Route strings remain in owner-facing copy**

Run: `cd frontend && grep -rn "Razorpay Route" src/components/owner src/app/\(owner\)`
Expected: no matches (the `owner/payouts/page.tsx` reference to "While Razorpay Route is unavailable" is intentionally accurate/unchanged and lives outside these three files, so it won't appear if the grep is scoped correctly — if it does appear, that's expected and not a bug).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/owner/ProspectiveOwnerView.tsx frontend/src/components/owner/PendingApprovalView.tsx frontend/src/components/owner/PayoutSetupCard.tsx
git commit -m "docs(copy): replace Razorpay Route payout language with manual payout copy"
```

---

### Task 10: Admin verification-queue UI — Payout Verification card

**Files:**
- Modify: `frontend/src/types/cafe.ts`
- Modify: `frontend/src/lib/api/admin.ts`
- Modify: `frontend/src/app/(admin)/admin/verification-queue/page.tsx`

**Interfaces:**
- Consumes: `AdminCafeDetailResponse`'s new `upiVpa`/`payoutVerificationStatus`/`verifiedName` fields (Task 7) and the `POST /api/v1/admin/cafe-payouts/{cafe_id}/verify-payout` endpoint (Task 5).
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Extend the `Cafe` type**

In `frontend/src/types/cafe.ts`, add after `accountHolderName?: string;`:

```typescript
  upiVpa?: string;
  payoutVerificationStatus?: 'unverified' | 'test_sent' | 'verified';
  verifiedName?: string;
```

- [ ] **Step 2: Add the `verifyCafePayoutDestination` API function**

In `frontend/src/lib/api/admin.ts`, add after `createCafePayout`:

```typescript
export async function verifyCafePayoutDestination(
  cafeId: string,
  body: { utrReference: string; verifiedName: string },
): Promise<{ payoutVerificationStatus: string; verifiedName: string; verifiedAt: string }> {
  return call(() => apiClient.post(`/api/v1/admin/cafe-payouts/${cafeId}/verify-payout`, body));
}
```

- [ ] **Step 3: Add the Payout Verification card to the Full Details Modal**

In `frontend/src/app/(admin)/admin/verification-queue/page.tsx`:

Add imports: `verifyCafePayoutDestination` to the existing `from '@/lib/api/admin'` import, and `Input` to the existing `from '@/components/ui'` import.

Add local state near the existing `useState` declarations:

```typescript
  const [testUtr, setTestUtr] = useState('');
  const [testVerifiedName, setTestVerifiedName] = useState('');
```

Add the mutation near the existing `approveMutation`/`rejectMutation` declarations:

```typescript
  const verifyPayoutMutation = useMutation({
    mutationFn: () =>
      verifyCafePayoutDestination(selectedCafe!.id, {
        utrReference: testUtr,
        verifiedName: testVerifiedName,
      }),
    onSuccess: () => {
      setTestUtr('');
      setTestVerifiedName('');
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.pendingCafes ?? [...queryKeys.admin.all, 'pending-cafes'] });
    },
  });
```

Check `queryKeys.admin` in `frontend/src/hooks/queries/keys.ts` for the exact key this page's `listPendingCafes` query uses, and use that same key array in `invalidateQueries` instead of guessing — the `??` fallback above is a placeholder to replace with the real key once confirmed.

Replace the "Payout Account" block:

```tsx
          <div className="p-3 rounded-xl bg-surface-hover">
            <h4 className="font-semibold text-caption mb-2">Payout Account</h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div><span className="text-text-tertiary">Account Holder:</span> {selectedCafe?.accountHolderName || 'Not provided'}</div>
              <div><span className="text-text-tertiary">Account #:</span> {selectedCafe?.bankAccountNumber ? `••••${selectedCafe.bankAccountNumber.slice(-4)}` : 'Not provided'}</div>
              <div><span className="text-text-tertiary">IFSC:</span> {selectedCafe?.bankIfsc || 'Not provided'}</div>
            </div>
          </div>
```

with:

```tsx
          <div className="p-3 rounded-xl bg-surface-hover">
            <h4 className="font-semibold text-caption mb-2">Payout Destination</h4>
            <div className="grid grid-cols-2 gap-2 text-xs mb-3">
              <div><span className="text-text-tertiary">UPI ID:</span> {selectedCafe?.upiVpa || 'Not provided'}</div>
              <div>
                <span className="text-text-tertiary">Status:</span>{' '}
                {selectedCafe?.payoutVerificationStatus === 'verified' ? (
                  <Badge variant="success" size="sm">Verified{selectedCafe?.verifiedName ? ` — ${selectedCafe.verifiedName}` : ''}</Badge>
                ) : (
                  <Badge variant="warning" size="sm">Unverified</Badge>
                )}
              </div>
              <div><span className="text-text-tertiary">Account Holder:</span> {selectedCafe?.accountHolderName || 'Not provided'}</div>
              <div><span className="text-text-tertiary">Account #:</span> {selectedCafe?.bankAccountNumber ? `••••${selectedCafe.bankAccountNumber.slice(-4)}` : 'Not provided'}</div>
              <div><span className="text-text-tertiary">IFSC:</span> {selectedCafe?.bankIfsc || 'Not provided'}</div>
            </div>

            {selectedCafe?.upiVpa && selectedCafe?.payoutVerificationStatus !== 'verified' && (
              <div className="flex flex-col gap-2 pt-2 border-t border-border">
                <p className="text-overline text-text-tertiary">
                  Send a ₹1 test transfer to this UPI ID, then record the name your UPI app showed for the recipient.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="₹1 transfer UTR"
                    value={testUtr}
                    onChange={(e) => setTestUtr(e.target.value)}
                  />
                  <Input
                    placeholder="Name shown by UPI app"
                    value={testVerifiedName}
                    onChange={(e) => setTestVerifiedName(e.target.value)}
                  />
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!testUtr.trim() || !testVerifiedName.trim() || verifyPayoutMutation.isPending}
                  isLoading={verifyPayoutMutation.isPending}
                  onClick={() => verifyPayoutMutation.mutate()}
                  className="self-start"
                >
                  Confirm ₹1 Test Transfer
                </Button>
                {verifyPayoutMutation.isError && (
                  <p className="text-xs text-error">
                    {(verifyPayoutMutation.error as Error)?.message ?? 'Failed to record verification.'}
                  </p>
                )}
              </div>
            )}
          </div>
```

- [ ] **Step 4: Manually verify in the browser**

Run the frontend dev server, log in as an admin, open a pending café's Full Details Modal, and confirm: the UPI ID and Unverified badge render; entering a UTR + name and clicking "Confirm ₹1 Test Transfer" flips the badge to Verified and hides the test-transfer form.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types/cafe.ts frontend/src/lib/api/admin.ts frontend/src/app/\(admin\)/admin/verification-queue/page.tsx
git commit -m "feat(payouts): add admin payout verification UI to café detail modal"
```

---

### Task 11: Admin café-payouts page — unverified badge + payout gate

**Files:**
- Modify: `frontend/src/lib/api/admin.ts` (`AdminOutstandingCafePayout` type)
- Modify: `frontend/src/app/(admin)/admin/cafe-payouts/page.tsx`

**Interfaces:**
- Consumes: `payoutVerificationStatus` from `listOutstandingCafePayouts()` (Task 6's backend change).

- [ ] **Step 1: Extend the type**

In `frontend/src/lib/api/admin.ts`, update `AdminOutstandingCafePayout`:

```typescript
export interface AdminOutstandingCafePayout {
  cafeId: string;
  cafeName: string;
  outstandingAmount: number;
  payoutVerificationStatus: 'unverified' | 'test_sent' | 'verified';
}
```

- [ ] **Step 2: Show a badge in the outstanding list and gate the "Mark as Paid" button**

In `frontend/src/app/(admin)/admin/cafe-payouts/page.tsx`, add `Badge` to the existing `from '@/components/ui'` import.

Replace the list-row button contents:

```tsx
              <button
                key={c.cafeId}
                type="button"
                onClick={() => setSelectedCafeId(c.cafeId)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-surface-hover transition-colors text-left"
              >
                <span className="text-caption font-semibold text-text-primary">{c.cafeName}</span>
                <div className="flex items-center gap-3">
                  <span className="text-caption font-bold font-data text-text-primary">
                    ₹{c.outstandingAmount.toFixed(2)}
                  </span>
                  <ChevronRight className="h-4 w-4 text-text-tertiary" />
                </div>
              </button>
```

with:

```tsx
              <button
                key={c.cafeId}
                type="button"
                onClick={() => setSelectedCafeId(c.cafeId)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-surface-hover transition-colors text-left"
              >
                <div className="flex items-center gap-2">
                  <span className="text-caption font-semibold text-text-primary">{c.cafeName}</span>
                  {c.payoutVerificationStatus !== 'verified' && (
                    <Badge variant="warning" size="sm">Unverified</Badge>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-caption font-bold font-data text-text-primary">
                    ₹{c.outstandingAmount.toFixed(2)}
                  </span>
                  <ChevronRight className="h-4 w-4 text-text-tertiary" />
                </div>
              </button>
```

Replace the "Mark as Paid" button's `disabled` condition:

```tsx
              <Button
                variant="primary"
                disabled={!utrReference.trim() || createMutation.isPending}
                onClick={() => createMutation.mutate()}
              >
                {createMutation.isPending ? 'Recording…' : `Mark ₹${selectedCafe.outstandingAmount.toFixed(2)} as Paid`}
              </Button>
```

with:

```tsx
              {selectedCafe.payoutVerificationStatus !== 'verified' && (
                <p className="text-xs text-warning">
                  This café's payout destination isn't verified yet — verify it from the Verification
                  Queue before paying out.
                </p>
              )}
              <Button
                variant="primary"
                disabled={!utrReference.trim() || createMutation.isPending || selectedCafe.payoutVerificationStatus !== 'verified'}
                onClick={() => createMutation.mutate()}
              >
                {createMutation.isPending ? 'Recording…' : `Mark ₹${selectedCafe.outstandingAmount.toFixed(2)} as Paid`}
              </Button>
```

Check `frontend/src/components/ui`'s `text-warning` utility class exists (it's used elsewhere in this codebase, e.g. `Badge variant="warning"`); if no bare `text-warning` text color utility exists, use `text-amber-600` instead to match this file's existing color vocabulary.

- [ ] **Step 3: Manually verify in the browser**

With an unverified café that has an outstanding balance, confirm: the outstanding list shows the "Unverified" badge, and the "Mark as Paid" button is disabled with the warning text visible. After verifying the café via Task 10's UI, confirm the badge disappears and the button becomes clickable.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/api/admin.ts frontend/src/app/\(admin\)/admin/cafe-payouts/page.tsx
git commit -m "feat(payouts): surface verification status and gate payout creation in admin UI"
```

---

## Amendments 1a-1e (folded in from the venue-agnostic roadmap, 2026-09-09)

These five tasks extend the money surface Tasks 1-11 already build. They
must run **after** Task 11 — 12/15 read the verification status Task 1/5/6
introduce, 14/16 read the `OwnerPayoutAccount` fields Task 1 adds, and 15/16
touch the exact pages Tasks 9-11 just finished editing, so editing them
first would just be immediately overwritten.

### Task 12: Payout proof upload + admin note (1a)

**Files:**
- Modify: `backend/app/models/cafe_payout.py`
- Create: `backend/migrations/versions/027_add_cafe_payout_proof_fields.py`
- Modify: `backend/app/api/v1/admin_cafe_payouts.py`
- Test: `backend/tests/test_cafe_payout_proof.py`

**Interfaces:**
- Produces: `CafePayout.proof_image_url: str | None`, `CafePayout.admin_note: str | None`, `CafePayout.paid_at` becomes admin-settable (was `datetime.now()` only) via new `paidAt` request field defaulting to now when omitted. New `POST /api/v1/admin/cafe-payouts/{cafe_id}/proof-upload-url` returns a presigned S3 URL, reusing `create_presigned_upload` (Task 8's onboarding flow already calls the owner-scoped sibling of this — this endpoint is the admin-scoped equivalent, keyed by `cafe_id` the same way). Task 15's frontend calls both.

- [ ] **Step 1: Failing test** — `CafePayoutCreateRequest` accepting `proofImageUrl`, `adminNote`, `paidAt`; `create_cafe_payout` persisting them onto the `CafePayout` row; `verify_cafe_payout_destination`'s admin-only guard applying equally to the new presign endpoint (403 for a non-admin). Follow the existing `test_admin_cafe_payouts_api.py` fixtures (`_make_admin`, `_make_gamer`, `_make_booking_with_payment`) rather than redefining them.
- [ ] **Step 2:** Run — expect `TypeError`/`KeyError` on the new fields, 404 on the new route.
- [ ] **Step 3:** Add `proof_image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)` and `admin_note: Mapped[str | None] = mapped_column(Text, nullable=True)` to `CafePayout`; write migration `027` (`down_revision = '026'`, additive columns, `downgrade` drops both).
- [ ] **Step 4:** In `admin_cafe_payouts.py`: extend `CafePayoutCreateRequest` with `proofImageUrl: Optional[str] = None`, `adminNote: Optional[str] = None`, `paidAt: Optional[datetime] = None`; pass all three through to `CafePayoutRepository.create_payout` (add matching optional params there, defaulting `paid_at` to `datetime.now(timezone.utc)` when `None` exactly as today); add:
  ```python
  @router.post("/{cafe_id}/proof-upload-url", status_code=status.HTTP_200_OK)
  async def presign_payout_proof_upload(
      cafe_id: UUID,
      payload: PhotoPresignRequest,
      current_admin: User = Depends(require_admin),
      db: AsyncSession = Depends(get_db),
  ):
      cafe = await CafeRepository(db).get_by_id(cafe_id)
      if not cafe:
          raise NotFoundException("Café not found")
      from app.services.storage_service import create_presigned_upload
      result = create_presigned_upload(cafe.id, payload.content_type)
      return {"success": True, "data": result}
  ```
  Import `PhotoPresignRequest` from `app.api.v1.owner` (it already exists there; do not redefine a second copy).
- [ ] **Step 5:** Run tests — expect PASS. Re-run `test_admin_cafe_payouts_api.py` for regressions (the new fields are all optional, so existing payloads must still 201).
- [ ] **Step 6:** Commit: `feat(payouts): add payment proof upload and admin note to café payouts`

### Task 13: `on_hold` / `disputed` payout statuses (1d, backend)

**Files:**
- Modify: `backend/app/models/cafe_payout.py`
- Create: `backend/migrations/versions/028_add_payout_status_values.py`
- Test: append to `backend/tests/test_cafe_payout_repository.py`

**Interfaces:** Produces: `CafePayoutStatus.ON_HOLD = "on_hold"`, `CafePayoutStatus.DISPUTED = "disputed"`. `list_payouts(status=...)` already filters by raw string — no repository signature change needed. Task 16's frontend badge switches on these two new values.

- [ ] **Step 1:** Failing test: constructing a `CafePayout` with `status=CafePayoutStatus.ON_HOLD` round-trips through `list_payouts()`.
- [ ] **Step 2:** Run — expect `AttributeError: ON_HOLD`.
- [ ] **Step 3:** Add both members to the enum. Migration: Postgres requires `ALTER TYPE cafepayoutstatus ADD VALUE IF NOT EXISTS 'on_hold'` / `'disputed'` via `op.execute(...)` (SQLite tests don't run migrations at all — `Base.metadata.create_all()` picks the new Python enum members up directly, per this plan's Global Constraints — so this migration only matters for the real Postgres deployment). No `downgrade` for enum value removal — Postgres doesn't support dropping enum values; leave `downgrade()` as a no-op with a comment explaining why.
- [ ] **Step 4:** Run — PASS.
- [ ] **Step 5:** Commit: `feat(payouts): add on_hold and disputed payout statuses`

### Task 14: Owner payout summary enrichment (feeds 1b/1c/1d)

**Files:**
- Modify: `backend/app/api/v1/owner.py` (`get_owner_payout_summary`, lines ~1237-1270)
- Test: append to `backend/tests/test_owner_cafe_payouts_api.py` (or a new `test_owner_payout_summary_enriched.py` if that file's fixtures don't fit)

**Interfaces:** Produces: `summary.alreadyPaidOut` (sum of this owner's `CafePayout.amount` across all cafés — the manual-payout counterpart to `completedSettlements`, which only ever reflects Route transfers), `summary.netEarnings` (alias of existing `netSettlement`, kept for a name that matches owner-facing copy), and `account.upiVpa` / `account.payoutVerificationStatus` / `account.verifiedName` (mirroring Task 1's fields) replacing the Razorpay-flavored `kycStatus` / `razorpayAccountId` keys. Task 16's frontend reads all of these; **do not remove `kycStatus`/`razorpayAccountId` yet if any other still-Razorpay-shaped consumer reads them** — grep `razorpayAccountId` and `kycStatus` across `frontend/src` first; this plan's Task 9 already found and fixed the only three owner-facing consumers, so removing both keys outright is expected to be safe, but confirm before deleting rather than assuming.

- [ ] **Step 1:** Failing test: an owner with one manually-paid `CafePayout` sees `summary.alreadyPaidOut` equal to that payout's amount; `account.upiVpa` matches the `OwnerPayoutAccount.upi_vpa` seeded in the test; `account.kycStatus` is no longer present in the response.
- [ ] **Step 2:** Run — expect `KeyError: 'alreadyPaidOut'` and the old key still present.
- [ ] **Step 3:** In `get_owner_payout_summary`, after the existing `already_paid_out` loop (line ~1237), sum actual `CafePayout` rows instead of re-deriving from bookings (the existing `already_paid_out` local variable estimates it from fee rows for a different purpose — pending-settlement subtraction — and must not be reused here, since a café can have a manual payout that doesn't perfectly net against currently-outstanding fee rows, e.g. after a refund):
  ```python
      from app.models.cafe_payout import CafePayout, CafePayoutStatus
      total_paid_out_stmt = select(func.sum(CafePayout.amount)).where(
          CafePayout.cafe_id.in_(cafe_ids), CafePayout.status == CafePayoutStatus.PAID
      )
      already_paid_out_total = float((await db.execute(total_paid_out_stmt)).scalar() or 0) if cafe_ids else 0.0
  ```
  Add `func` to the existing `sqlalchemy` import line if not already imported in this file. Replace the `account_info` block's last two keys:
  ```python
          account_info = {
              "accountHolderName": payout_account.account_holder_name,
              "bankAccountNumberMasked": payout_account.bank_account_number_masked,
              "bankIfsc": payout_account.bank_ifsc,
              "businessPan": payout_account.business_pan,
              "upiVpa": payout_account.upi_vpa,
              "payoutVerificationStatus": payout_account.payout_verification_status,
              "verifiedName": payout_account.verified_name,
          }
  ```
  And add to the returned `summary` dict: `"netEarnings": round(total_net_settlement, 2), "alreadyPaidOut": round(already_paid_out_total, 2),`.
- [ ] **Step 4:** Run — PASS. Grep `frontend/src` for `kycStatus` / `razorpayAccountId` reads of this endpoint's response (not `OwnerPayoutAccount.kyc_status` reads elsewhere, which are untouched) and update any found before Task 16 relies on the new shape.
- [ ] **Step 5:** Commit: `feat(payouts): enrich owner payout summary with UPI destination and manual-payout totals`

### Task 15: Admin "Mark as Paid" — proof upload UI (1a, frontend)

**Files:**
- Modify: `frontend/src/lib/api/admin.ts` (`createCafePayout`, add `presignPayoutProof`)
- Modify: `frontend/src/app/(admin)/admin/cafe-payouts/page.tsx`

**Interfaces:** Consumes: Task 12's `proof-upload-url` and extended `createCafePayout` body.

- [ ] **Step 1:** Extend `createCafePayout`'s body type with `proofImageUrl?: string; adminNote?: string; paidAt?: string;`. Add:
  ```typescript
  export async function presignPayoutProofUpload(
    cafeId: string, contentType: string,
  ): Promise<{ uploadUrl: string; publicUrl: string }> {
    return call(() => apiClient.post(`/api/v1/admin/cafe-payouts/${cafeId}/proof-upload-url`, { contentType }));
  }
  ```
  Match the exact response shape `create_presigned_upload` returns (check `storage_service.py`'s return keys before assuming `uploadUrl`/`publicUrl` — the existing owner-side photo presign consumer in `frontend/src/lib/api/owner.ts` already parses this same shape; copy its field names rather than guessing).
- [ ] **Step 2:** In the "Mark as Paid" modal, add: a payment date `<input type="date">` bound to a new `paidAt` state (defaulting to today, matching the plan's "payment date" requirement); a file input that calls `presignPayoutProofUpload`, PUTs the file to `uploadUrl` via `fetch(uploadUrl, {method: 'PUT', headers: {'Content-Type': file.type}, body: file})`, then stores `publicUrl` in a `proofImageUrl` state; an "Admin note (optional)" textarea bound to `adminNote` state. Disable the "Mark as Paid" button additionally while an upload is in flight, and require `proofImageUrl` to be set before enabling it (proof is mandatory per 1a, not optional). Pass `paidAt`, `proofImageUrl`, `adminNote` into `createMutation`'s `createCafePayout(...)` call.
- [ ] **Step 3:** Manual verification: uploading a screenshot shows a thumbnail/filename before submit; "Mark as Paid" stays disabled until a proof is attached; after success, re-opening the same café's history (Task 16 will surface this) shows the proof link.
- [ ] **Step 4:** Commit: `feat(payouts): require payment proof on admin Mark as Paid`

### Task 16: Owner payout page rewrite (1b, 1c, 1d, 1e)

**Files:**
- Modify: `frontend/src/app/(owner)/owner/payouts/page.tsx`

**Interfaces:** Consumes: Task 14's enriched `/payouts/summary` response, Task 12's `proofImageUrl` on payout-history rows (extend `OwnerCafePayoutHistoryItem` in `frontend/src/lib/api/owner.ts` with `proofImageUrl?: string; adminNote?: string;` first).

- [ ] **Step 1:** Replace the page header's badge logic (currently `kycActivated` / "Bank account ready" / "Bank details being checked" / "No bank account yet" — all Razorpay-KYC-shaped) with `account?.payoutVerificationStatus`: `verified` → "Payout destination verified"; `unverified`/`test_sent`/no account → "Verification pending" (never expose the raw `test_sent` string to an owner).
- [ ] **Step 2:** Replace the top amber banner (`"We're checking your bank details"` / `"Add your bank account"`) with the **five-questions header** required by 1b — total earned, currently owed, already paid, when pending arrives, where it's sent — using Task 14's `summary.totalEarnings`, `summary.pendingSettlements` (+ `getOwnerCafePayouts().outstandingAmount`, since manual-payout-pending isn't in `pendingSettlements`), `summary.alreadyPaidOut`, a static "paid out weekly" cadence line (per the roadmap doc's Phase 1 description — no per-payout ETA exists yet, so state the cadence honestly rather than fabricating a date), and `account.upiVpa` (or masked bank details if no UPI).
- [ ] **Step 3:** Replace `OwnerStatRow`'s three stats (1c: earnings vs payouts must read as two distinct chains, not one blended row) with two grouped rows: **Earnings** — Revenue generated (`summary.totalEarnings`) → KHELO fee (`summary.totalPlatformFees`) → Net earnings (`summary.netEarnings`); **Payouts** — Already paid (`summary.alreadyPaidOut`) → Pending (`outstandingAmount` from `getOwnerCafePayouts`).
- [ ] **Step 4 (1d):** Extend `statusBadge()` with owner-readable copy for every `CafePayoutStatus` value used in payout-history rows: `paid` → "Paid" (success), `pending`/`processing` → "Processing" (default), `failed` → "Failed — contact support" (error), `on_hold` → "On hold" (warning), `disputed` → "Disputed — under review" (error). This is a **new, second** `statusBadge`-like function for `payoutHistory` rows specifically — the existing `statusBadge()` covers Route `transferId`-style statuses (`transferred`/`failed`/`skipped_no_linked_account`/`pending`) and must not be conflated with `CafePayoutStatus`, which is a different vocabulary for a different table.
- [ ] **Step 5 (1e):** Delete the "While Razorpay Route is unavailable, KHEL-O pays out via direct bank transfer instead of automatic settlement. This is separate from the Route transfer status shown above." paragraph entirely (line ~301-304) — it is now false framing once the page no longer presents Route as the primary path. Also delete the "Connected Bank Account Details" card's `KYC Status` badge (now redundant with the header badge from Step 1) and its Razorpay-shaped `account.razorpayAccountId`/`account.kycStatus` reads once Task 14 confirms nothing else needs them.
- [ ] **Step 6:** In the manual-payout-history table, add a "Proof" column linking `proofImageUrl` (open in new tab) when present, "—" otherwise; render `adminNote` as a tooltip/expandable line under the UTR when present.
- [ ] **Step 7:** Manually verify in the browser: an owner with one verified UPI destination and one paid manual payout sees all five questions answered, two clearly separated earnings/payout rows, a "Paid" badge, a working proof link, and zero occurrences of "Razorpay" anywhere on the page (`grep -n "Razorpay" frontend/src/app/\(owner\)/owner/payouts/page.tsx` returns nothing).
- [ ] **Step 8:** Commit: `feat(payouts): rewrite owner payout page — five-questions summary, earnings/payout split, status vocabulary, remove Razorpay copy`

---

## Self-Review Notes

- **Spec coverage:** Data model (Task 1), security/encryption fix (Task 2, 4, 7), API validation (Task 3), persistence + reset-on-change (Task 4), admin verification endpoint (Task 5), payout gate + outstanding-list status (Task 6), admin café-detail enrichment (Task 7), onboarding UX (Task 8), copy cleanup (Task 9), admin verification UI (Task 10), admin payout-gate UI (Task 11), payment proof + admin note (Task 12), on_hold/disputed statuses (Task 13), owner summary enrichment (Task 14), admin proof-upload UI (Task 15), owner payout page rewrite (Task 16) — every spec section and every roadmap amendment (1a-1e) maps to at least one task.
- **Type consistency checked:** `payout_verification_status` values (`"unverified"`/`"test_sent"`/`"verified"`) are consistent across the model (Task 1), the gate check (Task 6), the verify endpoint (Task 5), and all frontend surfaces (Tasks 10-11, 16). `upsert_payout_details`'s parameter names (Task 4) match exactly what the submit endpoint passes. `verify-payout` response keys (`payoutVerificationStatus`, `verifiedName`, `verifiedAt`) match what Task 10's frontend type expects, and Task 14/16 reuse the identical key names for the owner-facing summary rather than inventing new ones. `CafePayoutStatus` (Task 13's `on_hold`/`disputed`) is never confused with `payout_verification_status` — they gate different things (an individual payout's state vs. whether the destination itself is trusted) and Task 16 Step 4 calls this out explicitly.
- **Sequencing:** Tasks 1-2 (data + crypto) must land before Task 3-4 (validation + persistence) can be tested end-to-end; Task 5-6 (admin verify + gate) depend on Task 1's model fields; Tasks 8-11 (frontend) depend on their respective backend tasks being merged first so the endpoints/fields they call actually exist. Tasks 12-13 (backend, amendments) depend on Task 1's migration chain (`down_revision` numbering) and Task 6's gate existing. Task 14 depends on Tasks 1 and 12. Task 15 depends on Task 12. Task 16 depends on Tasks 13 and 14, and re-touches files Task 9 already edited — diff carefully rather than reintroducing removed Razorpay strings. Execute in numeric order, 1 through 16.
- **Known test-fixture churn flagged explicitly:** Tasks 3, 6, and 7's steps call out exactly which pre-existing tests will break and how to fix them (missing `upiVpa` in onboarding payloads; missing verified `OwnerPayoutAccount` rows in payout-creation tests) rather than leaving that as a surprise. Task 14 additionally flags that any other frontend consumer of `kycStatus`/`razorpayAccountId` on the owner summary endpoint (beyond the three Task 9 already fixed) must be found by grep before those keys are removed, not assumed absent.
