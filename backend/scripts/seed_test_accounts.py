import asyncio
import uuid
from datetime import time
from app.database import AsyncSessionLocal
from app.models.user import User, UserRole
from app.models.cafe import Cafe, VerificationStatus
from app.models.hardware_tier import HardwareTier
from app.core.security import get_password_hash
from sqlalchemy import select

TEST_ACCOUNTS = [
    {
        "email": "test@example.com",
        "password": "testpass123",
        "full_name": "Demo Gamer",
        "role": UserRole.GAMER,
    },
    {
        "email": "pending@example.com",
        "password": "testpass123",
        "full_name": "Pending Cafe Owner",
        "role": UserRole.GAMER, # Role remains gamer until application verified
    },
    {
        "email": "owner@example.com",
        "password": "testpass123",
        "full_name": "Verified Cafe Owner",
        "role": UserRole.CAFE_OWNER,
    },
    {
        "email": "staff@example.com",
        "password": "testpass123",
        "full_name": "Arena Staff Member",
        "role": UserRole.STAFF,
    },
    {
        "email": "admin@example.com",
        "password": "testpass123",
        "full_name": "Platform Admin",
        "role": UserRole.ADMIN,
    },
]

from app.repositories.user_repository import UserRepository

async def seed_all():
    async with AsyncSessionLocal() as db:
        user_repo = UserRepository(db)
        user_map = {}
        for acc in TEST_ACCOUNTS:
            existing = await user_repo.get_by_email(acc["email"])
            hashed_pwd = get_password_hash(acc["password"])
            if existing:
                existing.password_hash = hashed_pwd
                existing.full_name = acc["full_name"]
                existing.is_active = True
                await user_repo.update_role(existing.id, acc["role"])
                user_map[acc["email"]] = existing
            else:
                user = await user_repo.create({
                    "id": uuid.uuid4(),
                    "email": acc["email"],
                    "password_hash": hashed_pwd,
                    "full_name": acc["full_name"],
                    "role": acc["role"],
                    "is_active": True,
                })
                if acc["role"] != UserRole.GAMER:
                    await user_repo.update_role(user.id, acc["role"])
                user_map[acc["email"]] = user

        # Seed Verified Cafe for owner@example.com
        owner_user = user_map["owner@example.com"]
        stmt_cafe = select(Cafe).where(Cafe.owner_id == owner_user.id)
        res_cafe = await db.execute(stmt_cafe)
        verified_cafe = res_cafe.scalars().first()

        if not verified_cafe:
            verified_cafe = Cafe(
                id=uuid.uuid4(),
                owner_id=owner_user.id,
                name="LXG Esports Arena",
                description="Premium RTX 4090 gaming lounge in Indiranagar",
                address_line1="100 Feet Road, Indiranagar",
                city="Bengaluru",
                state="Karnataka",
                pincode="560038",
                latitude=12.9716,
                longitude=77.5946,
                phone_number="+919876543210",
                email="lxg@khelo.com",
                opening_time=time(9, 0),
                closing_time=time(23, 0),
                verification_status=VerificationStatus.VERIFIED,
                total_seats=20,
                amenities=["High-speed Wi-Fi", "Air Conditioned", "Snacks & Drinks", "4K OLED"],
                photos=["https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=1200&auto=format&fit=crop"],
                supported_games=["Valorant", "Counter-Strike 2", "EA Sports FC 24", "GTA V"],
                business_pan="ABCDE1234F",
                gstin="29ABCDE1234F1Z5",
                is_active=True,
            )
            db.add(verified_cafe)
            await db.commit()

        # Ensure Hardware Tiers exist for Verified Cafe
        stmt_tier = select(HardwareTier).where(HardwareTier.cafe_id == verified_cafe.id)
        res_tier = await db.execute(stmt_tier)
        existing_tiers = res_tier.scalars().all()

        if not existing_tiers:
            t1 = HardwareTier(
                id=uuid.uuid4(),
                cafe_id=verified_cafe.id,
                name="Standard RTX 3060 Pods",
                specs={"gpu": "NVIDIA RTX 3060", "cpu": "Intel i7 12700K", "ram": "16GB DDR5", "monitor": "144Hz Full HD"},
                price_per_hour=100.0,
                total_seats=12,
                app_bookable_seats=10,
                reserved_walkin_seats=2,
                active_seats_count=12,
                is_active=True,
            )
            t2 = HardwareTier(
                id=uuid.uuid4(),
                cafe_id=verified_cafe.id,
                name="High-End RTX 4070 Pods",
                specs={"gpu": "NVIDIA RTX 4070", "cpu": "Intel i9 13900K", "ram": "32GB DDR5", "monitor": "240Hz Quad HD"},
                price_per_hour=150.0,
                total_seats=8,
                app_bookable_seats=6,
                reserved_walkin_seats=2,
                active_seats_count=8,
                is_active=True,
            )
            db.add(t1)
            db.add(t2)
            await db.commit()

        # Seed Pending Cafe Application for pending@example.com
        pending_user = user_map["pending@example.com"]
        stmt_pcafe = select(Cafe).where(Cafe.owner_id == pending_user.id)
        res_pcafe = await db.execute(stmt_pcafe)
        pending_cafe = res_pcafe.scalars().first()

        if not pending_cafe:
            pending_cafe = Cafe(
                id=uuid.uuid4(),
                owner_id=pending_user.id,
                name="Respawn Gaming Lounge (Pending)",
                description="New gaming venue pending admin verification",
                address_line1="Koramangala 5th Block",
                city="Bengaluru",
                state="Karnataka",
                pincode="560095",
                phone_number="+919876543211",
                email="respawn@khelo.com",
                verification_status=VerificationStatus.PENDING,
                total_seats=15,
                is_active=True,
            )
            db.add(pending_cafe)
            await db.commit()

        print("Test database accounts & cafes seeded successfully!")

if __name__ == "__main__":
    asyncio.run(seed_all())
