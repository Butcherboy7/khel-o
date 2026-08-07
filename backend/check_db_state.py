import asyncio
from app.database import AsyncSessionLocal
from sqlalchemy import text

async def check_counts():
    async with AsyncSessionLocal() as db:
        users_result = await db.execute(text('SELECT COUNT(*) FROM users'))
        users_count = users_result.scalar()
        
        roles_result = await db.execute(text('SELECT COUNT(DISTINCT user_id) FROM user_roles'))
        roles_count = roles_result.scalar()
        
        admin_result = await db.execute(text("SELECT COUNT(*) FROM user_roles WHERE role = 'admin'"))
        admin_count = admin_result.scalar()
        
        gamer_result = await db.execute(text("SELECT COUNT(*) FROM user_roles WHERE role = 'gamer'"))
        gamer_count = gamer_result.scalar()
        
        print(f'Total users: {users_count}')
        print(f'Users with roles: {roles_count}')
        print(f'Gamer roles: {gamer_count}')
        print(f'Admin roles: {admin_count}')
        
        if users_count != roles_count:
            print(f'\n⚠️  LOCKOUT RISK: {users_count - roles_count} users missing user_roles rows!')
        else:
            print(f'\n✅ All users have user_roles rows')
        
        if admin_count == 0:
            print('🚨 CRITICAL: NO ADMIN HAS ROLE MAPPING - ADMIN LOCKED OUT!')
        else:
            print(f'✅ {admin_count} admin(s) have role mapping')

asyncio.run(check_counts())
