import pytest
import uuid
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.models.user import User, UserRole
from app.core.security import create_access_token, get_password_hash
from app.database import AsyncSessionLocal
from app.models.hardware_tier import HardwareTier, TierType
from app.models.cafe import Cafe
from sqlalchemy import select


@pytest.mark.asyncio
async def test_onboarding_submit_with_platform_tier_derives_specs():
    async with AsyncSessionLocal() as db:
        gamer = User(
            id=uuid.uuid4(),
            email=f"onboard_platform_{uuid.uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("password123"),
            full_name="Onboard Platform Test",
            role=UserRole.GAMER,
            is_active=True
        )
        db.add(gamer)
        await db.commit()

        token = create_access_token(subject=str(gamer.id), role=gamer.role.value)
        headers = {"Authorization": f"Bearer {token}"}

        payload = {
            "name": "Onboard Platform Cafe",
            "addressLine1": "1 Onboard St",
            "city": "Hyderabad",
            "state": "Telangana",
            "pincode": "500001",
            "phoneNumber": "+919000000020",
            "openingTime": "09:00:00",
            "closingTime": "21:00:00",
            "upiVpa": "testowner@okhdfcbank",
            "confirmUpiVpa": "testowner@okhdfcbank",
            "hardwareTiers": [
                {"platform": "playstation", "model": "PS5", "totalSeats": 4, "appBookableSeats": 1, "hourlyRate": 150},
                {"platform": "pc", "model": "RTX 4070", "totalSeats": 10, "appBookableSeats": 3, "hourlyRate": 120},
            ],
        }

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            res = await client.post("/api/v1/owner/onboarding/submit", json=payload, headers=headers)
            assert res.status_code == 200
            cafe_id = res.json()["data"]["cafeId"]

        stmt = select(HardwareTier).where(HardwareTier.cafe_id == uuid.UUID(cafe_id))
        result = await db.execute(stmt)
        tiers = {t.platform.value: t for t in result.scalars().all()}

        assert tiers["playstation"].model == "PS5"
        assert tiers["playstation"].specs == {"console": "PlayStation 5"}
        assert tiers["playstation"].name == "PlayStation 5"
        assert tiers["pc"].specs == {"gpu": "NVIDIA RTX 4070"}


@pytest.mark.asyncio
async def test_onboarding_submit_preserves_explicit_tier_name():
    """I7: an explicit, non-blank tier name supplied at onboarding must
    survive even though platform/model are also set — the derived name may
    only fill in when no real name was supplied."""
    async with AsyncSessionLocal() as db:
        gamer = User(
            id=uuid.uuid4(),
            email=f"onboard_name_{uuid.uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("password123"),
            full_name="Onboard Name Test",
            role=UserRole.GAMER,
            is_active=True
        )
        db.add(gamer)
        await db.commit()

        token = create_access_token(subject=str(gamer.id), role=gamer.role.value)
        headers = {"Authorization": f"Bearer {token}"}

        payload = {
            "name": "Onboard Name Cafe",
            "addressLine1": "1 Onboard Name St",
            "city": "Hyderabad",
            "state": "Telangana",
            "pincode": "500001",
            "phoneNumber": "+919000000021",
            "openingTime": "09:00:00",
            "closingTime": "21:00:00",
            "upiVpa": "testowner@okhdfcbank",
            "confirmUpiVpa": "testowner@okhdfcbank",
            "hardwareTiers": [
                {"platform": "playstation", "model": "PS5", "name": "VIP Zone", "totalSeats": 4, "appBookableSeats": 1, "hourlyRate": 150},
            ],
        }

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            res = await client.post("/api/v1/owner/onboarding/submit", json=payload, headers=headers)
            assert res.status_code == 200
            cafe_id = res.json()["data"]["cafeId"]

        stmt = select(HardwareTier).where(HardwareTier.cafe_id == uuid.UUID(cafe_id))
        result = await db.execute(stmt)
        tier = result.scalars().first()
        assert tier.name == "VIP Zone"
        assert tier.specs == {"console": "PlayStation 5"}


@pytest.mark.asyncio
async def test_onboarding_submit_rejects_oversized_tier_model():
    """I5: a Dict[str, Any] tier soup let a non-string or oversized `model`
    reach derive_tier_display, crashing with AttributeError (model.strip() on
    a non-str) or a Postgres DataError (String(100) column overflow) as an
    unhandled 500. A real Pydantic model on hardware_tiers structurally closes
    this: FastAPI rejects the oversized value with a 422 before it ever
    reaches tier-creation code."""
    async with AsyncSessionLocal() as db:
        gamer = User(
            id=uuid.uuid4(),
            email=f"onboard_oversized_{uuid.uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("password123"),
            full_name="Onboard Oversized Test",
            role=UserRole.GAMER,
            is_active=True
        )
        db.add(gamer)
        await db.commit()

        token = create_access_token(subject=str(gamer.id), role=gamer.role.value)
        headers = {"Authorization": f"Bearer {token}"}

        payload = {
            "name": "Onboard Oversized Cafe",
            "addressLine1": "1 Onboard Oversized St",
            "city": "Hyderabad",
            "state": "Telangana",
            "pincode": "500001",
            "phoneNumber": "+919000000022",
            "openingTime": "09:00:00",
            "closingTime": "21:00:00",
            "upiVpa": "testowner@okhdfcbank",
            "confirmUpiVpa": "testowner@okhdfcbank",
            "hardwareTiers": [
                {"platform": "other", "model": "X" * 101, "totalSeats": 4, "appBookableSeats": 1, "hourlyRate": 150},
            ],
        }

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            res = await client.post("/api/v1/owner/onboarding/submit", json=payload, headers=headers)
            assert res.status_code == 422


@pytest.mark.asyncio
async def test_onboarding_submit_stores_platform_scoped_games():
    async with AsyncSessionLocal() as db:
        gamer = User(
            id=uuid.uuid4(),
            email=f"onboard_games_{uuid.uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("password123"),
            full_name="Onboard Games Test",
            role=UserRole.GAMER,
            is_active=True
        )
        db.add(gamer)
        await db.commit()

        token = create_access_token(subject=str(gamer.id), role=gamer.role.value)
        headers = {"Authorization": f"Bearer {token}"}

        payload = {
            "name": "Onboard Games Cafe",
            "addressLine1": "1 Games St",
            "city": "Hyderabad",
            "state": "Telangana",
            "pincode": "500001",
            "phoneNumber": "+919000000030",
            "openingTime": "09:00:00",
            "closingTime": "21:00:00",
            "upiVpa": "testowner@okhdfcbank",
            "confirmUpiVpa": "testowner@okhdfcbank",
            "supportedGames": {"pc": ["Valorant", "My LAN Game"], "playstation": ["EA Sports FC 24"]},
            "hardwareTiers": [
                {"platform": "pc", "model": "RTX 4070", "totalSeats": 6, "appBookableSeats": 2, "hourlyRate": 120},
            ],
        }

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            res = await client.post("/api/v1/owner/onboarding/submit", json=payload, headers=headers)
            assert res.status_code == 200
            cafe_id = res.json()["data"]["cafeId"]

        cafe = await db.get(Cafe, uuid.UUID(cafe_id))
        assert cafe.supported_games == {"pc": ["Valorant", "My LAN Game"], "playstation": ["EA Sports FC 24"]}


@pytest.mark.asyncio
async def test_onboarding_submit_normalizes_flat_photos_for_later_reads():
    """The onboarding wizard still POSTs `photos` as a flat list of URL
    strings, but Cafe.photos is now stored as [{url, category}] (migration
    032 + the CafeBase schema change). If the write site didn't normalize,
    the café would 500 on its own GET /api/v1/cafes/{cafe_id} the moment
    CafeResponse tries to validate the old-shape photos against the new
    Dict[str, str] field."""
    async with AsyncSessionLocal() as db:
        gamer = User(
            id=uuid.uuid4(),
            email=f"onboard_photos_{uuid.uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("password123"),
            full_name="Onboard Photos Test",
            role=UserRole.GAMER,
            is_active=True
        )
        db.add(gamer)
        await db.commit()

        token = create_access_token(subject=str(gamer.id), role=gamer.role.value)
        headers = {"Authorization": f"Bearer {token}"}

        payload = {
            "name": "Onboard Photos Cafe",
            "addressLine1": "1 Onboard Photos St",
            "city": "Hyderabad",
            "state": "Telangana",
            "pincode": "500001",
            "phoneNumber": "+919000000031",
            "openingTime": "09:00:00",
            "closingTime": "21:00:00",
            "upiVpa": "testowner@okhdfcbank",
            "confirmUpiVpa": "testowner@okhdfcbank",
            "photos": ["https://example.com/a.jpg"],
            "hardwareTiers": [
                {"platform": "pc", "model": "RTX 4070", "totalSeats": 6, "appBookableSeats": 2, "hourlyRate": 120},
            ],
        }

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            res = await client.post("/api/v1/owner/onboarding/submit", json=payload, headers=headers)
            assert res.status_code == 200
            cafe_id = res.json()["data"]["cafeId"]

            get_res = await client.get(f"/api/v1/cafes/{cafe_id}", headers=headers)
            assert get_res.status_code == 200, get_res.text
            assert get_res.json()["data"]["cafe"]["photos"] == [
                {"url": "https://example.com/a.jpg", "category": "exterior"}
            ]

        cafe = await db.get(Cafe, uuid.UUID(cafe_id))
        assert cafe.photos == [{"url": "https://example.com/a.jpg", "category": "exterior"}]


@pytest.mark.asyncio
async def test_resubmitting_onboarding_replaces_hardware_tiers_not_duplicates():
    async with AsyncSessionLocal() as db:
        gamer = User(
            id=uuid.uuid4(),
            email=f"onboard_resubmit_{uuid.uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("password123"),
            full_name="Onboard Resubmit Test",
            role=UserRole.GAMER,
            is_active=True
        )
        db.add(gamer)
        await db.commit()

        token = create_access_token(subject=str(gamer.id), role=gamer.role.value)
        headers = {"Authorization": f"Bearer {token}"}

        base_payload = {
            "name": "Onboard Resubmit Cafe",
            "addressLine1": "1 Resubmit St",
            "city": "Hyderabad",
            "state": "Telangana",
            "pincode": "500001",
            "phoneNumber": "+919000000050",
            "openingTime": "09:00:00",
            "closingTime": "21:00:00",
            "upiVpa": "testowner@okhdfcbank",
            "confirmUpiVpa": "testowner@okhdfcbank",
            "hardwareTiers": [
                {"platform": "pc", "model": "RTX 4070", "totalSeats": 6, "appBookableSeats": 2, "hourlyRate": 120},
            ],
        }

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            first = await client.post("/api/v1/owner/onboarding/submit", json=base_payload, headers=headers)
            assert first.status_code == 200
            cafe_id = uuid.UUID(first.json()["data"]["cafeId"])

            second_payload = dict(base_payload)
            second_payload["hardwareTiers"] = [
                {"platform": "pc", "model": "RTX 4090", "totalSeats": 8, "appBookableSeats": 3, "hourlyRate": 150},
            ]
            second = await client.post("/api/v1/owner/onboarding/submit", json=second_payload, headers=headers)
            assert second.status_code == 200

        stmt = select(HardwareTier).where(HardwareTier.cafe_id == cafe_id, HardwareTier.is_active == True)
        result = await db.execute(stmt)
        active_tiers = result.scalars().all()
        assert len(active_tiers) == 1
        assert active_tiers[0].model == "RTX 4090"


@pytest.mark.asyncio
async def test_resubmitting_onboarding_with_draft_photos_succeeds():
    """final-review C1: GET /owner/onboarding/draft synthesizes `photos` as
    [{url, category}] dicts once a café has been submitted at least once
    (see get_onboarding_draft's snapshot). The onboarding wizard loads that
    draft into formData untyped and, on a changes-requested resubmit, sends
    formData.photos straight back to POST /owner/onboarding/submit. Before
    widening OnboardingSubmitRequest.photos to accept both shapes, that
    resubmit 422'd on every café with at least one photo — which is every
    onboarded café, since INITIAL_STATE.photos ships a stock default. This
    reproduces the exact submit -> draft -> resubmit round trip."""
    async with AsyncSessionLocal() as db:
        gamer = User(
            id=uuid.uuid4(),
            email=f"onboard_resubmit_photos_{uuid.uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("password123"),
            full_name="Onboard Resubmit Photos Test",
            role=UserRole.GAMER,
            is_active=True
        )
        db.add(gamer)
        await db.commit()

        token = create_access_token(subject=str(gamer.id), role=gamer.role.value)
        headers = {"Authorization": f"Bearer {token}"}

        base_payload = {
            "name": "Onboard Resubmit Photos Cafe",
            "addressLine1": "1 Resubmit Photos St",
            "city": "Hyderabad",
            "state": "Telangana",
            "pincode": "500001",
            "phoneNumber": "+919000000051",
            "openingTime": "09:00:00",
            "closingTime": "21:00:00",
            "upiVpa": "testowner@okhdfcbank",
            "confirmUpiVpa": "testowner@okhdfcbank",
            "photos": ["https://example.com/first-submit.jpg"],
            "hardwareTiers": [
                {"platform": "pc", "model": "RTX 4070", "totalSeats": 6, "appBookableSeats": 2, "hourlyRate": 120},
            ],
        }

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            # 1. Normal first submission with a flat string photo.
            first = await client.post("/api/v1/owner/onboarding/submit", json=base_payload, headers=headers)
            assert first.status_code == 200, first.text

            # 2. Load the draft — the snapshot synthesis returns categorized
            # {url, category} dicts for photos now that the café has been
            # submitted and draft_data was cleared.
            draft = await client.get("/api/v1/owner/onboarding/draft", headers=headers)
            assert draft.status_code == 200, draft.text
            draft_photos = draft.json()["data"]["draft"]["photos"]
            assert draft_photos == [{"url": "https://example.com/first-submit.jpg", "category": "exterior"}]

            # 3. Resubmit, passing the dict-shaped photos from the draft
            # response straight through — exactly what the wizard does.
            second_payload = dict(base_payload)
            second_payload["photos"] = draft_photos
            second = await client.post("/api/v1/owner/onboarding/submit", json=second_payload, headers=headers)
            assert second.status_code == 200, second.text
            cafe_id = uuid.UUID(second.json()["data"]["cafeId"])

        cafe = await db.get(Cafe, cafe_id)
        assert cafe.photos == [{"url": "https://example.com/first-submit.jpg", "category": "exterior"}]


@pytest.mark.asyncio
async def test_resubmitting_onboarding_preserves_activity_tiers():
    """final-review I3: deactivate_all_for_cafe (called before onboarding's
    tier-creation loop on every resubmit, to dedupe gaming-platform tiers)
    must only deactivate GAMING tiers. The onboarding wizard has never been
    able to create or represent activity-type tiers (snooker, bowling,
    etc.) — OnboardingHardwareTierItem has no tier_type/activity_kind field
    — so if deactivate_all_for_cafe touched every active tier unconditionally,
    any café with activity tiers (created via the separate /owner/tiers
    endpoint) would have them silently and permanently deactivated on the
    next onboarding resubmit."""
    async with AsyncSessionLocal() as db:
        gamer = User(
            id=uuid.uuid4(),
            email=f"onboard_activity_preserve_{uuid.uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("password123"),
            full_name="Onboard Activity Preserve Test",
            role=UserRole.GAMER,
            is_active=True
        )
        db.add(gamer)
        await db.commit()

        token = create_access_token(subject=str(gamer.id), role=gamer.role.value)
        headers = {"Authorization": f"Bearer {token}"}

        base_payload = {
            "name": "Onboard Activity Preserve Cafe",
            "addressLine1": "1 Activity Preserve St",
            "city": "Hyderabad",
            "state": "Telangana",
            "pincode": "500001",
            "phoneNumber": "+919000000052",
            "openingTime": "09:00:00",
            "closingTime": "21:00:00",
            "upiVpa": "testowner@okhdfcbank",
            "confirmUpiVpa": "testowner@okhdfcbank",
            "hardwareTiers": [
                {"platform": "pc", "model": "RTX 4070", "totalSeats": 6, "appBookableSeats": 2, "hourlyRate": 120},
            ],
        }

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            first = await client.post("/api/v1/owner/onboarding/submit", json=base_payload, headers=headers)
            assert first.status_code == 200, first.text
            cafe_id = uuid.UUID(first.json()["data"]["cafeId"])

            # Separately add an activity-type tier directly via the DB
            # session, simulating a tier created through the (unrelated)
            # /owner/tiers endpoint — this test doesn't need to call that
            # endpoint, just reproduce the row shape it would leave behind.
            activity_tier = HardwareTier(
                id=uuid.uuid4(), cafe_id=cafe_id, name="Snooker",
                tier_type=TierType.ACTIVITY, activity_kind="Snooker",
                total_seats=3, app_bookable_seats=3, price_per_hour=400,
                platform=None, is_active=True,
            )
            db.add(activity_tier)
            await db.commit()
            activity_tier_id = activity_tier.id

            second_payload = dict(base_payload)
            second_payload["hardwareTiers"] = [
                {"platform": "pc", "model": "RTX 4090", "totalSeats": 8, "appBookableSeats": 3, "hourlyRate": 150},
            ]
            second = await client.post("/api/v1/owner/onboarding/submit", json=second_payload, headers=headers)
            assert second.status_code == 200, second.text

        stmt = select(HardwareTier).where(HardwareTier.cafe_id == cafe_id, HardwareTier.is_active == True)
        result = await db.execute(stmt)
        active_tiers = result.scalars().all()

        gaming_tiers = [t for t in active_tiers if t.tier_type == TierType.GAMING]
        activity_tiers = [t for t in active_tiers if t.tier_type == TierType.ACTIVITY]

        # The gaming tier was replaced, same as the existing dedupe test.
        assert len(gaming_tiers) == 1
        assert gaming_tiers[0].model == "RTX 4090"

        # The activity tier survived the resubmit untouched.
        assert len(activity_tiers) == 1
        assert activity_tiers[0].id == activity_tier_id
        assert activity_tiers[0].is_active is True


@pytest.mark.asyncio
async def test_onboarding_submit_creates_activity_tiers_correctly():
    """Regression test: OnboardingHardwareTierItem previously had no
    tierType/activityKind/individualUnits fields, so any activity tier
    (Snooker, Air Hockey, etc.) configured in Step 4 was silently persisted
    on submit as a generic tier_type=GAMING, platform='other' row, losing
    its activity classification entirely. Also covers an activity-only
    café (no gaming platform at all) to confirm Step 4->5->6 doesn't assume
    a PC/console tier exists."""
    async with AsyncSessionLocal() as db:
        gamer = User(
            id=uuid.uuid4(),
            email=f"onboard_activity_create_{uuid.uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("password123"),
            full_name="Onboard Activity Create Test",
            role=UserRole.GAMER,
            is_active=True
        )
        db.add(gamer)
        await db.commit()

        token = create_access_token(subject=str(gamer.id), role=gamer.role.value)
        headers = {"Authorization": f"Bearer {token}"}

        payload = {
            "name": "Onboard Activity Only Cafe",
            "addressLine1": "1 Activity Only St",
            "city": "Hyderabad",
            "state": "Telangana",
            "pincode": "500001",
            "phoneNumber": "+919000000077",
            "openingTime": "09:00:00",
            "closingTime": "21:00:00",
            "upiVpa": "testowner@okhdfcbank",
            "confirmUpiVpa": "testowner@okhdfcbank",
            "hardwareTiers": [
                {
                    "tierType": "activity", "activityKind": "Snooker / Pool",
                    "individualUnits": True, "totalSeats": 2, "appBookableSeats": 2,
                    "hourlyRate": 300,
                },
                {
                    "tierType": "activity", "activityKind": "Air Hockey",
                    "individualUnits": True, "totalSeats": 2, "appBookableSeats": 2,
                    "hourlyRate": 300,
                },
            ],
        }

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            res = await client.post("/api/v1/owner/onboarding/submit", json=payload, headers=headers)
            assert res.status_code == 200, res.text
            cafe_id = uuid.UUID(res.json()["data"]["cafeId"])

        stmt = select(HardwareTier).where(HardwareTier.cafe_id == cafe_id, HardwareTier.is_active == True)
        result = await db.execute(stmt)
        tiers = {t.activity_kind: t for t in result.scalars().all()}

        assert set(tiers.keys()) == {"Snooker / Pool", "Air Hockey"}
        for tier in tiers.values():
            assert tier.tier_type == TierType.ACTIVITY
            assert tier.platform is None
            assert tier.model is None


@pytest.mark.parametrize("bad_pincode", ["12345", "1234567", "ABCDEF", "560 01", "56000!", ""])
@pytest.mark.asyncio
async def test_submit_onboarding_rejects_invalid_pincode(
    bad_pincode,
):
    """Invalid pincodes (not exactly 6 digits) should be rejected with 422."""
    async with AsyncSessionLocal() as db:
        gamer = User(
            id=uuid.uuid4(),
            email=f"onboard_pincode_bad_{uuid.uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("password123"),
            full_name="Onboard Pincode Bad Test",
            role=UserRole.GAMER,
            is_active=True
        )
        db.add(gamer)
        await db.commit()

        token = create_access_token(subject=str(gamer.id), role=gamer.role.value)
        headers = {"Authorization": f"Bearer {token}"}

        payload = {
            "name": "Onboard Pincode Bad Cafe",
            "addressLine1": "1 Pincode Bad St",
            "city": "Hyderabad",
            "state": "Telangana",
            "pincode": bad_pincode,
            "phoneNumber": "+919000000088",
            "openingTime": "09:00:00",
            "closingTime": "21:00:00",
            "upiVpa": "testowner@okhdfcbank",
            "confirmUpiVpa": "testowner@okhdfcbank",
            "hardwareTiers": [
                {"platform": "pc", "model": "RTX 4070", "totalSeats": 6, "appBookableSeats": 2, "hourlyRate": 120},
            ],
        }

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            res = await client.post("/api/v1/owner/onboarding/submit", json=payload, headers=headers)
            assert res.status_code == 422, f"Expected 422 for pincode '{bad_pincode}', got {res.status_code}: {res.text}"


@pytest.mark.asyncio
async def test_submit_onboarding_accepts_valid_6_digit_pincode():
    """Valid 6-digit pincodes should be accepted with 200."""
    async with AsyncSessionLocal() as db:
        gamer = User(
            id=uuid.uuid4(),
            email=f"onboard_pincode_good_{uuid.uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("password123"),
            full_name="Onboard Pincode Good Test",
            role=UserRole.GAMER,
            is_active=True
        )
        db.add(gamer)
        await db.commit()

        token = create_access_token(subject=str(gamer.id), role=gamer.role.value)
        headers = {"Authorization": f"Bearer {token}"}

        payload = {
            "name": "Onboard Pincode Good Cafe",
            "addressLine1": "1 Pincode Good St",
            "city": "Hyderabad",
            "state": "Telangana",
            "pincode": "560001",
            "phoneNumber": "+919000000089",
            "openingTime": "09:00:00",
            "closingTime": "21:00:00",
            "upiVpa": "testowner@okhdfcbank",
            "confirmUpiVpa": "testowner@okhdfcbank",
            "hardwareTiers": [
                {"platform": "pc", "model": "RTX 4070", "totalSeats": 6, "appBookableSeats": 2, "hourlyRate": 120},
            ],
        }

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            res = await client.post("/api/v1/owner/onboarding/submit", json=payload, headers=headers)
            assert res.status_code == 200, f"Expected 200 for valid pincode '560001', got {res.status_code}: {res.text}"


@pytest.mark.asyncio
async def test_submit_onboarding_rejects_pincode_location_mismatch():
    """If the owner picks a location_id whose Location row has a known
    pincode on file, and the typed pincode contradicts it, submission is
    rejected with a 422 (ValidationException / PINCODE_MISMATCH) rather than
    silently persisting a self-contradictory address."""
    from app.models.location import Location

    async with AsyncSessionLocal() as db:
        loc = Location(
            name="Secunderabad", name_norm="secunderabad",
            state="Telangana", pincode="500003",
        )
        db.add(loc)
        await db.commit()
        await db.refresh(loc)
        loc_id = loc.id

        gamer = User(
            id=uuid.uuid4(),
            email=f"onboard_pincode_mismatch_{uuid.uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("password123"),
            full_name="Onboard Pincode Mismatch Test",
            role=UserRole.GAMER,
            is_active=True
        )
        db.add(gamer)
        await db.commit()

        token = create_access_token(subject=str(gamer.id), role=gamer.role.value)
        headers = {"Authorization": f"Bearer {token}"}

        payload = {
            "name": "Onboard Pincode Mismatch Cafe",
            "addressLine1": "1 Pincode Mismatch St",
            "city": "Hyderabad",
            "state": "Telangana",
            "pincode": "110001",  # Delhi pincode, wrong for Secunderabad
            "locationId": loc_id,
            "phoneNumber": "+919000000090",
            "openingTime": "09:00:00",
            "closingTime": "21:00:00",
            "upiVpa": "testowner@okhdfcbank",
            "confirmUpiVpa": "testowner@okhdfcbank",
            "hardwareTiers": [
                {"platform": "pc", "model": "RTX 4070", "totalSeats": 6, "appBookableSeats": 2, "hourlyRate": 120},
            ],
        }

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            res = await client.post("/api/v1/owner/onboarding/submit", json=payload, headers=headers)
            assert res.status_code == 422, f"Expected 422 for pincode/location mismatch, got {res.status_code}: {res.text}"
            assert res.json()["error"]["code"] == "PINCODE_MISMATCH"


@pytest.mark.asyncio
async def test_submit_onboarding_allows_pincode_when_location_has_none_on_file():
    """Most Location rows don't have a pincode populated (it's optional, per
    the Task 2 seed audit). The consistency check must never block
    submission just because the location's pincode field is empty — only a
    genuine, known contradiction should be rejected."""
    from app.models.location import Location

    async with AsyncSessionLocal() as db:
        loc = Location(
            name="Some New Town", name_norm="some new town",
            state="Karnataka", pincode=None,
        )
        db.add(loc)
        await db.commit()
        await db.refresh(loc)
        loc_id = loc.id

        gamer = User(
            id=uuid.uuid4(),
            email=f"onboard_pincode_no_loc_pin_{uuid.uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("password123"),
            full_name="Onboard Pincode No Location Pincode Test",
            role=UserRole.GAMER,
            is_active=True
        )
        db.add(gamer)
        await db.commit()

        token = create_access_token(subject=str(gamer.id), role=gamer.role.value)
        headers = {"Authorization": f"Bearer {token}"}

        payload = {
            "name": "Onboard Pincode No Location Pincode Cafe",
            "addressLine1": "1 No Location Pincode St",
            "city": "Bengaluru",
            "state": "Karnataka",
            "pincode": "560001",
            "locationId": loc_id,
            "phoneNumber": "+919000000091",
            "openingTime": "09:00:00",
            "closingTime": "21:00:00",
            "upiVpa": "testowner@okhdfcbank",
            "confirmUpiVpa": "testowner@okhdfcbank",
            "hardwareTiers": [
                {"platform": "pc", "model": "RTX 4070", "totalSeats": 6, "appBookableSeats": 2, "hourlyRate": 120},
            ],
        }

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            res = await client.post("/api/v1/owner/onboarding/submit", json=payload, headers=headers)
            assert res.status_code == 200, f"Expected 200 when location has no pincode on file, got {res.status_code}: {res.text}"


@pytest.mark.asyncio
async def test_get_onboarding_draft_returns_cafe_id_once_a_draft_exists():
    """save_onboarding_draft already creates a real Cafe row (DRAFT status)
    the moment an owner clicks 'Next' past Step 1, and its own response
    already includes cafeId — but get_onboarding_draft (the GET used on page
    load/reload) didn't return it, leaving the wizard with no way to know
    which café to attach Step 5 photo uploads to on a fresh page load."""
    async with AsyncSessionLocal() as db:
        gamer = User(
            id=uuid.uuid4(),
            email=f"onboard_draft_cafeid_{uuid.uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("password123"),
            full_name="Onboard Draft CafeId Test",
            role=UserRole.GAMER,
            is_active=True
        )
        db.add(gamer)
        await db.commit()

        token = create_access_token(subject=str(gamer.id), role=gamer.role.value)
        headers = {"Authorization": f"Bearer {token}"}

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            save_resp = await client.post(
                "/api/v1/owner/onboarding/draft",
                json={"step": 2, "draftData": {"name": "Test Cafe"}},
                headers=headers,
            )
            assert save_resp.status_code == 200, save_resp.text
            cafe_id = save_resp.json()["data"]["cafeId"]
            assert cafe_id

            get_resp = await client.get("/api/v1/owner/onboarding/draft", headers=headers)
            assert get_resp.status_code == 200, get_resp.text
            assert get_resp.json()["data"]["cafeId"] == cafe_id


@pytest.mark.asyncio
async def test_get_onboarding_draft_returns_none_cafe_id_when_no_cafe_exists():
    """The `not cafe` branch (a brand-new owner who has never saved a draft
    or submitted) must return cafeId: None rather than omitting the key."""
    async with AsyncSessionLocal() as db:
        gamer = User(
            id=uuid.uuid4(),
            email=f"onboard_draft_no_cafe_{uuid.uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("password123"),
            full_name="Onboard Draft No Cafe Test",
            role=UserRole.GAMER,
            is_active=True
        )
        db.add(gamer)
        await db.commit()

        token = create_access_token(subject=str(gamer.id), role=gamer.role.value)
        headers = {"Authorization": f"Bearer {token}"}

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            get_resp = await client.get("/api/v1/owner/onboarding/draft", headers=headers)
            assert get_resp.status_code == 200, get_resp.text
            assert get_resp.json()["data"]["cafeId"] is None


@pytest.mark.asyncio
async def test_get_onboarding_draft_returns_cafe_id_from_post_submission_snapshot():
    """Once a café has been fully submitted at least once, draft_data is
    cleared and get_onboarding_draft reconstructs a snapshot instead — that
    branch's return statement must also carry cafeId (this is the final
    `return` in the function, reached only after a real submission)."""
    async with AsyncSessionLocal() as db:
        gamer = User(
            id=uuid.uuid4(),
            email=f"onboard_draft_snapshot_{uuid.uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("password123"),
            full_name="Onboard Draft Snapshot Test",
            role=UserRole.GAMER,
            is_active=True
        )
        db.add(gamer)
        await db.commit()

        token = create_access_token(subject=str(gamer.id), role=gamer.role.value)
        headers = {"Authorization": f"Bearer {token}"}

        payload = {
            "name": "Onboard Draft Snapshot Cafe",
            "addressLine1": "1 Draft Snapshot St",
            "city": "Hyderabad",
            "state": "Telangana",
            "pincode": "500001",
            "phoneNumber": "+919000000099",
            "openingTime": "09:00:00",
            "closingTime": "21:00:00",
            "upiVpa": "testowner@okhdfcbank",
            "confirmUpiVpa": "testowner@okhdfcbank",
            "hardwareTiers": [
                {"platform": "pc", "model": "RTX 4070", "totalSeats": 6, "appBookableSeats": 2, "hourlyRate": 120},
            ],
        }

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            submit_resp = await client.post("/api/v1/owner/onboarding/submit", json=payload, headers=headers)
            assert submit_resp.status_code == 200, submit_resp.text
            cafe_id = submit_resp.json()["data"]["cafeId"]

            get_resp = await client.get("/api/v1/owner/onboarding/draft", headers=headers)
            assert get_resp.status_code == 200, get_resp.text
            assert get_resp.json()["data"]["cafeId"] == cafe_id


@pytest.mark.asyncio
async def test_onboarding_submit_persists_menu_photos():
    """menu_photos is a new field on OnboardingSubmitRequest (Task 6),
    needed so Task 7's Step 5 photo-upload UI can submit the menu-photo
    URLs it uploaded via the existing cafe-scoped menu-photos/presign
    endpoint. Cafe.menu_photos is a flat URL-string list (unlike
    Cafe.photos, which carries a category), so this verifies persistence
    without any category wrapping."""
    async with AsyncSessionLocal() as db:
        gamer = User(
            id=uuid.uuid4(),
            email=f"onboard_menu_photos_{uuid.uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("password123"),
            full_name="Onboard Menu Photos Test",
            role=UserRole.GAMER,
            is_active=True
        )
        db.add(gamer)
        await db.commit()

        token = create_access_token(subject=str(gamer.id), role=gamer.role.value)
        headers = {"Authorization": f"Bearer {token}"}

        payload = {
            "name": "Onboard Menu Photos Cafe",
            "addressLine1": "1 Menu Photos St",
            "city": "Hyderabad",
            "state": "Telangana",
            "pincode": "500001",
            "phoneNumber": "+919000000098",
            "openingTime": "09:00:00",
            "closingTime": "21:00:00",
            "upiVpa": "testowner@okhdfcbank",
            "confirmUpiVpa": "testowner@okhdfcbank",
            "menuPhotos": ["https://example-bucket.s3.amazonaws.com/menu1.jpg"],
            "hardwareTiers": [
                {"platform": "pc", "model": "RTX 4070", "totalSeats": 6, "appBookableSeats": 2, "hourlyRate": 120},
            ],
        }

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            res = await client.post("/api/v1/owner/onboarding/submit", json=payload, headers=headers)
            assert res.status_code == 200, res.text
            cafe_id = res.json()["data"]["cafeId"]

        cafe = await db.get(Cafe, uuid.UUID(cafe_id))
        assert cafe.menu_photos == ["https://example-bucket.s3.amazonaws.com/menu1.jpg"]


@pytest.mark.asyncio
async def test_resubmitting_onboarding_updates_menu_photos():
    """The update branch of submit_onboarding_application (an existing café
    resubmitting, e.g. after CHANGES_REQUESTED) must also persist
    menu_photos, not just the create branch."""
    async with AsyncSessionLocal() as db:
        gamer = User(
            id=uuid.uuid4(),
            email=f"onboard_menu_photos_resubmit_{uuid.uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("password123"),
            full_name="Onboard Menu Photos Resubmit Test",
            role=UserRole.GAMER,
            is_active=True
        )
        db.add(gamer)
        await db.commit()

        token = create_access_token(subject=str(gamer.id), role=gamer.role.value)
        headers = {"Authorization": f"Bearer {token}"}

        base_payload = {
            "name": "Onboard Menu Photos Resubmit Cafe",
            "addressLine1": "1 Menu Photos Resubmit St",
            "city": "Hyderabad",
            "state": "Telangana",
            "pincode": "500001",
            "phoneNumber": "+919000000097",
            "openingTime": "09:00:00",
            "closingTime": "21:00:00",
            "upiVpa": "testowner@okhdfcbank",
            "confirmUpiVpa": "testowner@okhdfcbank",
            "hardwareTiers": [
                {"platform": "pc", "model": "RTX 4070", "totalSeats": 6, "appBookableSeats": 2, "hourlyRate": 120},
            ],
        }

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            first = await client.post("/api/v1/owner/onboarding/submit", json=base_payload, headers=headers)
            assert first.status_code == 200, first.text
            cafe_id = first.json()["data"]["cafeId"]

            second_payload = dict(base_payload)
            second_payload["menuPhotos"] = ["https://example-bucket.s3.amazonaws.com/menu-updated.jpg"]
            second = await client.post("/api/v1/owner/onboarding/submit", json=second_payload, headers=headers)
            assert second.status_code == 200, second.text

        cafe = await db.get(Cafe, uuid.UUID(cafe_id))
        assert cafe.menu_photos == ["https://example-bucket.s3.amazonaws.com/menu-updated.jpg"]
