import pytest
import uuid
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.models.user import User, UserRole
from app.models.user_role import UserRoleMapping
from app.models.cafe import Cafe, VerificationStatus
from app.core.security import create_access_token, get_password_hash
from app.database import AsyncSessionLocal


@pytest.fixture(autouse=True)
def _s3_settings(monkeypatch):
    # create_presigned_upload() signs URLs locally (no network call), but it
    # short-circuits with a 400 unless storage looks configured — give it
    # dummy values so the "valid category" branch can reach a 200.
    from app.config import settings
    import app.services.storage_service as storage_service
    monkeypatch.setattr(settings, "AWS_S3_BUCKET", "khelo-test-bucket", raising=False)
    monkeypatch.setattr(settings, "AWS_ACCESS_KEY_ID", "test-key", raising=False)
    monkeypatch.setattr(settings, "AWS_SECRET_ACCESS_KEY", "test-secret", raising=False)
    monkeypatch.setattr(storage_service, "_client", None, raising=False)


async def _make_owner_with_cafe(db):
    owner = User(
        id=uuid.uuid4(),
        email=f"photo_owner_{uuid.uuid4().hex[:6]}@test.com",
        password_hash=get_password_hash("password123"),
        full_name="Photo Owner",
        role=UserRole.CAFE_OWNER,
        is_active=True,
    )
    db.add(owner)
    await db.flush()
    # require_cafe_ownership resolves roles from user_roles, not User.role
    # (see tests/test_menu_photos.py for the same pattern).
    db.add(UserRoleMapping(id=uuid.uuid4(), user_id=owner.id, role=UserRole.CAFE_OWNER))
    await db.flush()
    cafe = Cafe(
        id=uuid.uuid4(),
        owner_id=owner.id,
        name="Photo Test Cafe",
        address_line1="1 Photo St",
        city="Hyderabad",
        state="Telangana",
        pincode="500001",
        phone_number="+919000000040",
        verification_status=VerificationStatus.PENDING,
        is_active=True,
    )
    db.add(cafe)
    await db.commit()
    token = create_access_token(subject=str(owner.id), role=owner.role.value)
    return cafe, {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_photo_presign_requires_valid_category():
    async with AsyncSessionLocal() as db:
        cafe, headers = await _make_owner_with_cafe(db)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            bad = await client.post(
                f"/api/v1/owner/cafes/{cafe.id}/photos/presign",
                json={"contentType": "image/jpeg", "category": "not_a_real_category"},
                headers=headers,
            )
            assert bad.status_code == 422

            good = await client.post(
                f"/api/v1/owner/cafes/{cafe.id}/photos/presign",
                json={"contentType": "image/jpeg", "category": "play_area"},
                headers=headers,
            )
            assert good.status_code == 200
