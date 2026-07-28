"""
Script to promote an existing user from gamer to cafe_owner role.

Usage:
  python -m scripts.create_cafe_owner --email owner@khelo.in

Options:
  --email    Email address of existing user to promote
"""

import asyncio
import argparse

from app.database import AsyncSessionLocal
from app.models.user import UserRole
from app.repositories.user_repository import UserRepository

async def promote_to_cafe_owner(email: str):
    async with AsyncSessionLocal() as session:
        user_repo = UserRepository(session)
        clean_email = email.strip().lower()
        
        user = await user_repo.get_by_email(clean_email)
        if not user:
            print(f"Error: User with email '{clean_email}' not found.")
            return

        updated = await user_repo.update(user.id, {"role": UserRole.CAFE_OWNER, "is_active": True})
        print(f"Successfully promoted user {updated.email} to CAFE_OWNER.")
        print(f"ID: {updated.id}")
        print(f"Role: {updated.role.value if hasattr(updated.role, 'value') else str(updated.role)}")
        print(f"Is Active: {updated.is_active}")

def main():
    parser = argparse.ArgumentParser(description="Promote a user to Cafe Owner")
    parser.add_argument("--email", required=True, help="User email address")

    args = parser.parse_args()
    asyncio.run(promote_to_cafe_owner(args.email))

if __name__ == "__main__":
    main()
