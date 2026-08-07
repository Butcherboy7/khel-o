"""
Comprehensive fix for all backend tests to use create_test_user helper.
"""

import asyncio
from sqlalchemy import text
from app.database import AsyncSessionLocal
from app.models.user import User, UserRole
from app.models.user_role import UserRoleMapping
from app.core.security import get_password_hash
from uuid import uuid4

async def ensure_all_users_have_roles():
    """One-time fix: Ensure all existing users in test DB have role mappings."""
    async with AsyncSessionLocal() as db:
        # Get all users without role mappings
        result = await db.execute(text("""
            SELECT u.id, u.role 
            FROM users u 
            LEFT JOIN user_roles ur ON u.id = ur.user_id 
            WHERE ur.id IS NULL
        """))
        
        users_without_roles = result.fetchall()
        
        for user_id, role_str in users_without_roles:
            # Add gamer role
            try:
                role_enum = UserRole(role_str) if isinstance(role_str, str) else role_str
            except:
                role_enum = UserRole.GAMER
            
            # Insert gamer role
            await db.execute(
                text("INSERT INTO user_roles (id, user_id, role, cafe_id, created_at) VALUES (:id, :uid, 'gamer', NULL, datetime('now'))"),
                {'id': str(uuid4()), 'uid': str(user_id)}
            )
            
            # Insert primary role if not gamer
            if role_enum != UserRole.GAMER:
                await db.execute(
                    text("INSERT INTO user_roles (id, user_id, role, cafe_id, created_at) VALUES (:id, :uid, :role, NULL, datetime('now'))"),
                    {'id': str(uuid4()), 'uid': str(user_id), 'role': role_enum.value}
                )
        
        await db.commit()
        print(f"Fixed {len(users_without_roles)} users")

if __name__ == "__main__":
    asyncio.run(ensure_all_users_have_roles())
