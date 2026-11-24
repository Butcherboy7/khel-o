import pytest
from uuid import uuid4
from httpx import AsyncClient, ASGITransport

from app.database import AsyncSessionLocal
from app.main import app
from app.models.cafe import Cafe, VerificationStatus
from app.models.user import User, UserRole
from app.core.security import get_password_hash


@pytest.mark.asyncio
async def test_games_list_only_names_cafes_that_list_games():
    tag = uuid4().hex[:6]
    async with AsyncSessionLocal() as db:
        owner = User(
            id=uuid4(), email=f"games_owner_{tag}@test.com",
            password_hash=get_password_hash("UnitTestPw123"), full_name="Games Owner",
            role=UserRole.CAFE_OWNER, is_active=True,
        )
        db.add(owner)
        await db.flush()
        listed = Cafe(
            id=uuid4(), owner_id=owner.id, name=f"Games Listed {tag}",
            address_line1="1 St", city="Hyderabad", state="Telangana",
            pincode="500001", phone_number="+919000000071",
            verification_status=VerificationStatus.VERIFIED, is_active=True,
            supported_games={"pc": ["Valorant", " valorant ", "Counter-Strike 2"], "playstation": ["GTA 5"]},
        )
        empty = Cafe(
            id=uuid4(), owner_id=owner.id, name=f"Games Empty {tag}",
            address_line1="2 St", city="Hyderabad", state="Telangana",
            pincode="500001", phone_number="+919000000072",
            verification_status=VerificationStatus.VERIFIED, is_active=True,
            supported_games={},
        )
        db.add_all([listed, empty])
        await db.commit()
        listed_id, empty_id = str(listed.id), str(empty.id)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
        res = await client.get("/api/v1/cafes/games")
    assert res.status_code == 200
    by_id = {c["id"]: c for c in res.json()["data"]}
    assert empty_id not in by_id  # nothing is guessed for a café that lists no games
    assert by_id[listed_id]["games"] == ["Valorant", "Counter-Strike 2", "GTA 5"]
