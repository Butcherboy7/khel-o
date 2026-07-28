"""
Seed script to create an initial Admin user.

Usage:
  python -m scripts.create_admin --email admin@khelo.in --password adminpass123 --name "Platform Admin"

Options:
  --email    Admin user email address
  --password Admin password
  --name     Full display name
"""

import asyncio
import argparse
import sys
from uuid import uuid4

from app.database import AsyncSessionLocal
from app.models.user import User, UserRole
from app.repositories.user_repository import UserRepository
from app.core.security import get_password_hash

async def create_admin(email: str, password: str, full_name: str):
    async with AsyncSessionLocal() as session:
        user_repo = UserRepository(session)
        clean_email = email.strip().lower()
        
        existing = await user_repo.get_by_email(clean_email)
        if existing:
            if existing.role != UserRole.ADMIN:
                updated = await user_repo.update(existing.id, {"role": UserRole.ADMIN, "is_active": True})
                print(f"Updated existing user {clean_email} to role ADMIN.")
                print(f"ID: {updated.id}, Role: {updated.role.value}, IsActive: {updated.is_active}")
            else:
                print(f"User {clean_email} is already an ADMIN.")
                print(f"ID: {existing.id}, Role: {existing.role.value}, IsActive: {existing.is_active}")
            return

        hashed_password = get_password_hash(password)
        user_dict = {
            "id": uuid4(),
            "email": clean_email,
            "password_hash": hashed_password,
            "full_name": full_name.strip(),
            "role": UserRole.ADMIN,
            "is_active": True
        }
        created = await user_repo.create(user_dict)
        print(f"Successfully created Admin user: {created.email}")
        print(f"ID: {created.id}")
        print(f"Role: {created.role.value if hasattr(created.role, 'value') else str(created.role)}")
        print(f"Is Active: {created.is_active}")

def main():
    parser = argparse.ArgumentParser(description="Create an Admin user for KHEL-O")
    parser.add_argument("--email", required=True, help="Admin email address")
    parser.add_argument("--password", required=True, help="Admin password")
    parser.add_argument("--name", default="System Admin", help="Admin full name")

    args = parser.parse_args()
    asyncio.run(create_admin(args.email, args.password, args.name))

if __name__ == "__main__":
    main()
