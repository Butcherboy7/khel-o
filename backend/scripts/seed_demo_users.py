import asyncio
from uuid import uuid4
from app.database import AsyncSessionLocal
from app.models.user import UserRole
from app.repositories.user_repository import UserRepository
from app.core.security import get_password_hash

async def seed_users():
    async with AsyncSessionLocal() as session:
        user_repo = UserRepository(session)

        demo_users = [
            {
                "email": "gamer@khelo.com",
                "password": "Gamer123!",
                "full_name": "Arjun Sharma (Gamer)",
                "role": UserRole.GAMER,
            },
            {
                "email": "owner@khelo.com",
                "password": "Owner123!",
                "full_name": "Vikram Singh (Owner)",
                "role": UserRole.CAFE_OWNER,
            },
            {
                "email": "admin@khelo.com",
                "password": "Admin123!",
                "full_name": "Platform Admin",
                "role": UserRole.ADMIN,
            },
        ]

        for u in demo_users:
            email = u["email"]
            existing = await user_repo.get_by_email(email)
            hashed = get_password_hash(u["password"])

            if existing:
                await user_repo.update(
                    existing.id,
                    {
                        "password_hash": hashed,
                        "role": u["role"],
                        "is_active": True,
                        "full_name": u["full_name"],
                    },
                )
                print(f"Updated user {email} ({u['role'].value})")
            else:
                await user_repo.create(
                    {
                        "id": uuid4(),
                        "email": email,
                        "password_hash": hashed,
                        "full_name": u["full_name"],
                        "role": u["role"],
                        "is_active": True,
                    }
                )
                print(f"Created user {email} ({u['role'].value})")

        await session.commit()
        print("Demo users successfully seeded!")

if __name__ == "__main__":
  asyncio.run(seed_users())
