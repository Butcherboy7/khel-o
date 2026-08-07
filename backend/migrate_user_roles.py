"""
MIGRATION: Backfill user_roles table for all existing users.

CRITICAL: Run this BEFORE deploying new auth system to production.
Without this, 420+ users would be locked out.
"""

import asyncio
from app.database import AsyncSessionLocal
from sqlalchemy import text, select
from app.models.user import User, UserRole
from app.models.user_role import UserRoleMapping
import uuid

async def backfill_user_roles():
    """For every existing user, insert a user_roles row based on their users.role."""
    async with AsyncSessionLocal() as db:
        # Get all users
        result = await db.execute(text('SELECT id, role FROM users'))
        users = result.fetchall()
        
        print(f'Found {len(users)} users to process...')
        
        inserted_gamer = 0
        inserted_owner = 0
        inserted_staff = 0
        inserted_admin = 0
        skipped = 0
        
        for user_row in users:
            user_id = user_row[0]
            role_str = user_row[1]
            
            # Convert role string to enum
            try:
                role = UserRole(role_str) if isinstance(role_str, str) else role_str
            except:
                role = UserRole.GAMER
            
            # Ensure gamer role always exists
            gamer_check = await db.execute(
                text('SELECT id FROM user_roles WHERE user_id = :uid AND role = :role'),
                {'uid': str(user_id), 'role': 'gamer'}
            )
            if not gamer_check.scalar():
                await db.execute(
                    text('INSERT INTO user_roles (id, user_id, role, cafe_id, created_at) VALUES (:id, :uid, :role, NULL, datetime("now"))'),
                    {'id': str(uuid.uuid4()), 'uid': str(user_id), 'role': 'gamer'}
                )
                inserted_gamer += 1
            
            # Add their primary role if not gamer
            if role != UserRole.GAMER:
                role_check = await db.execute(
                    text('SELECT id FROM user_roles WHERE user_id = :uid AND role = :role'),
                    {'uid': str(user_id), 'role': role.value}
                )
                if not role_check.scalar():
                    await db.execute(
                        text('INSERT INTO user_roles (id, user_id, role, cafe_id, created_at) VALUES (:id, :uid, :role, NULL, datetime("now"))'),
                        {'id': str(uuid.uuid4()), 'uid': str(user_id), 'role': role.value}
                    )
                    if role == UserRole.CAFE_OWNER:
                        inserted_owner += 1
                    elif role == UserRole.STAFF:
                        inserted_staff += 1
                    elif role == UserRole.ADMIN:
                        inserted_admin += 1
                else:
                    skipped += 1
            else:
                skipped += 1
        
        await db.commit()
        
        print(f'\n Migration Complete:')
        print(f'  Inserted gamer roles: {inserted_gamer}')
        print(f'  Inserted cafe_owner roles: {inserted_owner}')
        print(f'  Inserted staff roles: {inserted_staff}')
        print(f'  Inserted admin roles: {inserted_admin}')
        print(f'  Skipped (already had): {skipped}')
        
        # Verify
        verify_result = await db.execute(text('SELECT COUNT(DISTINCT user_id) FROM user_roles'))
        final_count = verify_result.scalar()
        print(f'\nFinal count: {final_count} users with roles')

if __name__ == '__main__':
    print('Starting user_roles backfill migration...')
    asyncio.run(backfill_user_roles())
