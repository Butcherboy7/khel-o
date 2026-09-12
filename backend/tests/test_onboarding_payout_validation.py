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
