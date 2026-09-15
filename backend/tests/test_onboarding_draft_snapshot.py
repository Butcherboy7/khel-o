import pytest
import uuid
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.models.user import User, UserRole
from app.core.security import create_access_token, get_password_hash
from app.database import AsyncSessionLocal


@pytest.mark.asyncio
async def test_draft_endpoint_synthesizes_snapshot_after_full_submit():
    async with AsyncSessionLocal() as db:
        gamer = User(
            id=uuid.uuid4(),
            email=f"onboard_snapshot_{uuid.uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("password123"),
            full_name="Onboard Snapshot Test",
            role=UserRole.GAMER,
            is_active=True
        )
        db.add(gamer)
        await db.commit()

        token = create_access_token(subject=str(gamer.id), role=gamer.role.value)
        headers = {"Authorization": f"Bearer {token}"}

        submit_payload = {
            "name": "Onboard Snapshot Cafe",
            "addressLine1": "1 Snapshot St",
            "city": "Hyderabad",
            "state": "Telangana",
            "pincode": "500001",
            "phoneNumber": "+919000000060",
            "openingTime": "09:00:00",
            "closingTime": "21:00:00",
            "upiVpa": "testowner@okhdfcbank",
            "confirmUpiVpa": "testowner@okhdfcbank",
            "supportedGames": {"pc": ["Valorant"]},
            "businessPan": "ABCDE1234F",
            "hasGst": True,
            "gstin": "29ABCDE1234F1Z5",
            "legalDocumentUrl": "https://example.com/legal-doc.pdf",
            "socialLinks": {"instagram": "khelo_snapshot", "discord": "khelo#1234"},
            "hardwareTiers": [
                {"platform": "pc", "model": "RTX 4070", "totalSeats": 6, "appBookableSeats": 2, "hourlyRate": 120},
            ],
        }

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            submit_res = await client.post("/api/v1/owner/onboarding/submit", json=submit_payload, headers=headers)
            assert submit_res.status_code == 200

            draft_res = await client.get("/api/v1/owner/onboarding/draft", headers=headers)
            assert draft_res.status_code == 200
            draft = draft_res.json()["data"]["draft"]

            assert draft["name"] == "Onboard Snapshot Cafe"
            assert draft["supportedGames"] == {"pc": ["Valorant"]}
            assert len(draft["hardwareTiers"]) == 1
            assert draft["hardwareTiers"][0]["platform"] == "pc"
            assert draft["hardwareTiers"][0]["model"] == "RTX 4070"
            assert draft["hardwareTiers"][0]["totalSeats"] == 6

            # Business PAN / GSTIN / legal doc URL / social links must survive
            # the draft_data-cleared-at-submit round trip too — these are real
            # Cafe columns populated by the submit handler, and the frontend's
            # loadDraft() merges {...prev, ...draft}, so a missing key here
            # silently resets the field to blank on wizard re-entry.
            assert draft["businessPan"] == "ABCDE1234F"
            assert draft["gstin"] == "29ABCDE1234F1Z5"
            assert draft["legalDocumentUrl"] == "https://example.com/legal-doc.pdf"
            assert draft["instagram"] == "khelo_snapshot"
            assert draft["discord"] == "khelo#1234"
