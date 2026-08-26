import pytest
from uuid import uuid4
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.models.user import User, UserRole
from app.models.user_role import UserRoleMapping
from app.models.cafe import Cafe, VerificationStatus
from app.models.hardware_tier import HardwareTier, PlatformType
from app.core.security import create_access_token, get_password_hash
from app.database import AsyncSessionLocal


async def _make_owner_with_cafe(db, *, email_prefix: str, phone_suffix: str, cafe_name: str):
    """Shared fixture setup: an owner (with the UserRoleMapping row
    require_cafe_owner actually reads) plus a verified café."""
    owner = User(
        id=uuid4(), email=f"{email_prefix}_{uuid4().hex[:6]}@test.com",
        password_hash=get_password_hash("testpass123"), full_name="Test Owner",
        role=UserRole.CAFE_OWNER, is_active=True
    )
    db.add(owner)
    await db.flush()
    db.add(UserRoleMapping(id=uuid4(), user_id=owner.id, role=UserRole.CAFE_OWNER))
    await db.flush()

    cafe = Cafe(
        id=uuid4(), owner_id=owner.id, name=cafe_name,
        address_line1="1 Test St", city="Bengaluru", state="Karnataka",
        pincode="560001", phone_number=f"+9190000000{phone_suffix}",
        verification_status=VerificationStatus.VERIFIED, is_active=True,
    )
    db.add(cafe)
    await db.flush()

    token = create_access_token(subject=str(owner.id), role=owner.role.value)
    return owner, cafe, {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_needs_confirmation_lists_unmigrated_tiers_with_guess():
    async with AsyncSessionLocal() as db:
        owner = User(
            id=uuid4(), email=f"reconfirm_{uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("testpass123"), full_name="Reconfirm Owner",
            role=UserRole.CAFE_OWNER, is_active=True
        )
        db.add(owner)
        await db.flush()
        # require_cafe_owner resolves roles from user_roles, not User.role —
        # without this row every request 403s regardless of the role set above.
        db.add(UserRoleMapping(id=uuid4(), user_id=owner.id, role=UserRole.CAFE_OWNER))
        await db.flush()

        cafe = Cafe(
            id=uuid4(), owner_id=owner.id, name="Reconfirm Cafe",
            address_line1="1 Reconfirm St", city="Bengaluru", state="Karnataka",
            pincode="560001", phone_number="+919000000040",
            verification_status=VerificationStatus.VERIFIED, is_active=True,
        )
        db.add(cafe)
        await db.flush()

        tier = HardwareTier(
            id=uuid4(), cafe_id=cafe.id, name="PS4 Pro Console Corner",
            specs={"gpu": "PS4 Pro Custom AMD Jaguar CPU"},
            total_seats=4, app_bookable_seats=1, active_seats_count=4,
            price_per_hour=100.0, is_active=True,
        )
        db.add(tier)
        await db.commit()

        token = create_access_token(subject=str(owner.id), role=owner.role.value)
        headers = {"Authorization": f"Bearer {token}"}

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            res = await client.get("/api/v1/owner/tiers/needs-confirmation", headers=headers)
            assert res.status_code == 200
            data = res.json()["data"]
            assert data["needsConfirmation"] is True
            assert len(data["tiers"]) == 1
            guessed = data["tiers"][0]
            assert guessed["guessedPlatform"] == "playstation"
            # Regression guard for C1/I8: the guess-producing half and the
            # guess-consuming half must actually agree. Driving the PATCH
            # from the endpoint's own returned guess — not a hand-picked
            # value — is what would have caught guess_platform_and_model
            # returning free text (e.g. the tier's raw name) that
            # derive_tier_display's picklist check then rejected with a 422
            # on the single most common migration flow: "accept the guess
            # as-is". This must fail before the C1 fix and pass after it.
            assert guessed["guessedModel"] == "PS4 Pro"

            confirm_res = await client.patch(
                f"/api/v1/owner/tiers/{tier.id}/confirm-platform",
                json={"platform": guessed["guessedPlatform"], "model": guessed["guessedModel"]},
                headers=headers
            )
            assert confirm_res.status_code == 200

        await db.refresh(tier)
        assert tier.platform.value == "playstation"
        assert tier.model == "PS4 Pro"

        # Recommendation 4: walk the migration all the way through to the
        # customer-facing discovery surface. A café with exactly one tier,
        # now fully confirmed, must expose it as complete and show the real
        # platform — not the name-based fallback.
        from app.repositories.cafe_repository import CafeRepository
        cafe_repo = CafeRepository(db)
        items, _ = await cafe_repo.search_verified(page=1, limit=20)
        this_cafe = next(i for i in items if i["id"] == cafe.id)
        assert this_cafe["platforms"] == ["playstation"]
        assert this_cafe["platforms_complete"] is True


@pytest.mark.asyncio
async def test_needs_confirmation_false_once_all_tiers_migrated():
    async with AsyncSessionLocal() as db:
        owner = User(
            id=uuid4(), email=f"reconfirm_done_{uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("testpass123"), full_name="Reconfirm Done Owner",
            role=UserRole.CAFE_OWNER, is_active=True
        )
        db.add(owner)
        await db.flush()
        db.add(UserRoleMapping(id=uuid4(), user_id=owner.id, role=UserRole.CAFE_OWNER))
        await db.flush()

        cafe = Cafe(
            id=uuid4(), owner_id=owner.id, name="Already Migrated Cafe",
            address_line1="1 Migrated St", city="Bengaluru", state="Karnataka",
            pincode="560001", phone_number="+919000000041",
            verification_status=VerificationStatus.VERIFIED, is_active=True,
        )
        db.add(cafe)
        await db.commit()

        token = create_access_token(subject=str(owner.id), role=owner.role.value)
        headers = {"Authorization": f"Bearer {token}"}

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            res = await client.get("/api/v1/owner/tiers/needs-confirmation", headers=headers)
            assert res.status_code == 200
            assert res.json()["data"]["needsConfirmation"] is False


@pytest.mark.asyncio
async def test_needs_confirmation_only_lists_unmigrated_when_tiers_are_mixed():
    async with AsyncSessionLocal() as db:
        owner, cafe, headers = await _make_owner_with_cafe(
            db, email_prefix="reconfirm_mixed", phone_suffix="42", cafe_name="Mixed Migration Cafe"
        )

        migrated_tier = HardwareTier(
            id=uuid4(), cafe_id=cafe.id, name="PlayStation 5", specs={"console": "PlayStation 5"},
            total_seats=4, app_bookable_seats=1, active_seats_count=4,
            price_per_hour=150.0, platform=PlatformType.PLAYSTATION, model="PS5", is_active=True,
        )
        unmigrated_tier = HardwareTier(
            id=uuid4(), cafe_id=cafe.id, name="Xbox Series X Zone", specs={"gpu": "Xbox Series X"},
            total_seats=3, app_bookable_seats=1, active_seats_count=3,
            price_per_hour=120.0, is_active=True,
        )
        db.add_all([migrated_tier, unmigrated_tier])
        await db.commit()

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            res = await client.get("/api/v1/owner/tiers/needs-confirmation", headers=headers)
            assert res.status_code == 200
            data = res.json()["data"]
            assert data["needsConfirmation"] is True
            assert len(data["tiers"]) == 1
            assert data["tiers"][0]["id"] == str(unmigrated_tier.id)
            assert data["tiers"][0]["guessedPlatform"] == "xbox"


@pytest.mark.asyncio
async def test_confirm_platform_invalid_platform_string_returns_422():
    async with AsyncSessionLocal() as db:
        owner, cafe, headers = await _make_owner_with_cafe(
            db, email_prefix="reconfirm_badplatform", phone_suffix="43", cafe_name="Bad Platform Cafe"
        )

        tier = HardwareTier(
            id=uuid4(), cafe_id=cafe.id, name="Unmigrated Tier", specs={"gpu": "GTX 1660"},
            total_seats=4, app_bookable_seats=1, active_seats_count=4,
            price_per_hour=100.0, is_active=True,
        )
        db.add(tier)
        await db.commit()

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            res = await client.patch(
                f"/api/v1/owner/tiers/{tier.id}/confirm-platform",
                json={"platform": "sega_genesis", "model": "Something"},
                headers=headers
            )
            assert res.status_code == 422

        await db.refresh(tier)
        assert tier.platform is None


@pytest.mark.asyncio
async def test_confirm_platform_invalid_model_for_platform_returns_422():
    async with AsyncSessionLocal() as db:
        owner, cafe, headers = await _make_owner_with_cafe(
            db, email_prefix="reconfirm_badmodel", phone_suffix="44", cafe_name="Bad Model Cafe"
        )

        tier = HardwareTier(
            id=uuid4(), cafe_id=cafe.id, name="Unmigrated Tier", specs={"gpu": "GTX 1660"},
            total_seats=4, app_bookable_seats=1, active_seats_count=4,
            price_per_hour=100.0, is_active=True,
        )
        db.add(tier)
        await db.commit()

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            res = await client.patch(
                f"/api/v1/owner/tiers/{tier.id}/confirm-platform",
                json={"platform": "playstation", "model": "PS9 Ultra"},
                headers=headers
            )
            assert res.status_code == 422

        await db.refresh(tier)
        assert tier.platform is None


@pytest.mark.asyncio
async def test_confirm_platform_nonexistent_tier_returns_404():
    async with AsyncSessionLocal() as db:
        owner, cafe, headers = await _make_owner_with_cafe(
            db, email_prefix="reconfirm_notier", phone_suffix="45", cafe_name="No Tier Cafe"
        )
        await db.commit()

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            res = await client.patch(
                f"/api/v1/owner/tiers/{uuid4()}/confirm-platform",
                json={"platform": "playstation", "model": "PS4 Pro"},
                headers=headers
            )
            assert res.status_code == 404


@pytest.mark.asyncio
async def test_confirm_platform_rejects_cross_owner_tier():
    async with AsyncSessionLocal() as db:
        owner_a, cafe_a, headers_a = await _make_owner_with_cafe(
            db, email_prefix="reconfirm_ownerA", phone_suffix="46", cafe_name="Owner A Cafe"
        )
        owner_b, cafe_b, headers_b = await _make_owner_with_cafe(
            db, email_prefix="reconfirm_ownerB", phone_suffix="47", cafe_name="Owner B Cafe"
        )

        tier_b = HardwareTier(
            id=uuid4(), cafe_id=cafe_b.id, name="Owner B's Unmigrated Tier", specs={"gpu": "GTX 1660"},
            total_seats=4, app_bookable_seats=1, active_seats_count=4,
            price_per_hour=100.0, is_active=True,
        )
        db.add(tier_b)
        await db.commit()

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            # Owner A attempts to confirm platform on Owner B's tier.
            res = await client.patch(
                f"/api/v1/owner/tiers/{tier_b.id}/confirm-platform",
                json={"platform": "playstation", "model": "PS4 Pro"},
                headers=headers_a
            )
            assert res.status_code == 403

        await db.refresh(tier_b)
        assert tier_b.platform is None
        assert tier_b.model is None


@pytest.mark.asyncio
async def test_confirm_platform_model_over_max_length_returns_422():
    """I5: ConfirmPlatformRequest.model was an unbounded str against a
    String(100) DB column — a value between the picklist's Field(max_length)
    and the column length silently truncates nothing on SQLite (what tests
    run on) but raises an unhandled Postgres DataError (production) as a 500.
    A 422 here, not a crash, is the correct behaviour for oversized input."""
    async with AsyncSessionLocal() as db:
        owner, cafe, headers = await _make_owner_with_cafe(
            db, email_prefix="reconfirm_toolong", phone_suffix="48", cafe_name="Too Long Model Cafe"
        )

        tier = HardwareTier(
            id=uuid4(), cafe_id=cafe.id, name="Unmigrated Tier", specs={"gpu": "GTX 1660"},
            total_seats=4, app_bookable_seats=1, active_seats_count=4,
            price_per_hour=100.0, is_active=True,
        )
        db.add(tier)
        await db.commit()

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            res = await client.patch(
                f"/api/v1/owner/tiers/{tier.id}/confirm-platform",
                json={"platform": "other", "model": "X" * 101},
                headers=headers
            )
            assert res.status_code == 422

        await db.refresh(tier)
        assert tier.platform is None
