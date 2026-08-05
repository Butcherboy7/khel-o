import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.models.user import User, UserRole
from app.models.cafe import Cafe, VerificationStatus
from app.core.security import create_access_token, get_password_hash
from app.database import AsyncSessionLocal
import uuid

@pytest_asyncio.fixture
async def async_client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client

@pytest.mark.asyncio
async def test_onboarding_submission_succeeds_without_422(async_client: AsyncClient):
    """Verify that café onboarding submission with properly formatted pincode, times, and tier numbers returns 200 OK."""
    async with AsyncSessionLocal() as db:
        user = User(
            id=uuid.uuid4(),
            email=f"onboard_test_{uuid.uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("password123"),
            full_name="Onboarding Gamer",
            role=UserRole.GAMER,
            is_active=True
        )
        db.add(user)
        await db.commit()

        token = create_access_token(subject=str(user.id), role=user.role.value)
        headers = {"Authorization": f"Bearer {token}"}

        payload = {
            "name": "Velocity Gaming Arena",
            "description": "High-end RTX 4090 lounge",
            "addressLine1": "Indiranagar 100ft Road",
            "addressLine2": "Suite 4B",
            "city": "Bengaluru",
            "state": "Karnataka",
            "pincode": "560038",
            "latitude": 12.9716,
            "longitude": 77.5946,
            "phoneNumber": "+919876543210",
            "email": "velocity@khelo.com",
            "openingTime": "09:00:00",
            "closingTime": "23:00:00",
            "totalSeats": 20,
            "amenities": ["High-speed Wi-Fi", "Air Conditioned"],
            "photos": ["https://images.unsplash.com/photo-1542751371-adc38448a05e"],
            "supportedGames": ["Valorant", "CS2"],
            "businessPan": "ABCDE1234F",
            "gstin": "29ABCDE1234F1Z5",
            "legalDocumentUrl": "https://example.com/legal.pdf",
            "bankAccountNumber": "91827364501",
            "bankIfsc": "HDFC0001234",
            "accountHolderName": "Onboarding Gamer",
            "cancellationPolicy": "Free cancellation up to 2 hours before session.",
            "houseRules": ["No outside food"],
            "socialLinks": {"instagram": "@velocity", "discord": "discord.gg/velocity"},
            "hardwareTiers": [
                {
                    "name": "Flagship RTX 4090 Pods",
                    "gpu": "NVIDIA RTX 4090 / 240Hz",
                    "hourlyRate": 250,
                    "totalSeats": 8
                }
            ]
        }

        response = await async_client.post("/api/v1/owner/onboarding/submit", json=payload, headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "cafeId" in data["data"]
