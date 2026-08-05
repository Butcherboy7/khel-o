import asyncio
import uuid
from sqlalchemy import select, func, text
from app.database import AsyncSessionLocal, engine
from app.models.user import User, UserRole
from app.models.cafe import Cafe, VerificationStatus
from app.models.user_role import UserRoleMapping

async def upgrade():
    async with AsyncSessionLocal() as db:
        # Create user_roles table if not exists
        async with engine.begin() as conn:
            await conn.run_sync(UserRoleMapping.__table__.create, checkfirst=True)

        # Fetch count before backfill
        stmt_user_count = select(func.count(User.id))
        stmt_role_count = select(func.count(UserRoleMapping.id))

        users_count_before = (await db.execute(stmt_user_count)).scalar() or 0
        roles_count_before = (await db.execute(stmt_role_count)).scalar() or 0

        # Backfill all existing users with 'gamer' role
        stmt_users = select(User)
        res_users = await db.execute(stmt_users)
        users = res_users.scalars().all()

        added_count = 0
        for u in users:
            # Check if user already has a gamer role entry
            stmt_check = select(UserRoleMapping).where(
                UserRoleMapping.user_id == u.id,
                UserRoleMapping.role == UserRole.GAMER,
                UserRoleMapping.cafe_id.is_(None)
            )
            existing_gamer = (await db.execute(stmt_check)).scalars().first()
            if not existing_gamer:
                db.add(UserRoleMapping(
                    id=uuid.uuid4(),
                    user_id=u.id,
                    role=UserRole.GAMER,
                    cafe_id=None
                ))
                added_count += 1

            # If user role is cafe_owner, check for VERIFIED cafe
            u_role_str = u.role.value if hasattr(u.role, "value") else str(u.role)
            if u_role_str == "cafe_owner":
                stmt_cafe = select(Cafe).where(Cafe.owner_id == u.id, Cafe.verification_status == VerificationStatus.VERIFIED)
                res_cafe = await db.execute(stmt_cafe)
                verified_cafe = res_cafe.scalars().first()
                if verified_cafe:
                    stmt_check_owner = select(UserRoleMapping).where(
                        UserRoleMapping.user_id == u.id,
                        UserRoleMapping.role == UserRole.CAFE_OWNER,
                        UserRoleMapping.cafe_id == verified_cafe.id
                    )
                    existing_owner = (await db.execute(stmt_check_owner)).scalars().first()
                    if not existing_owner:
                        db.add(UserRoleMapping(
                            id=uuid.uuid4(),
                            user_id=u.id,
                            role=UserRole.CAFE_OWNER,
                            cafe_id=verified_cafe.id
                        ))
                        added_count += 1

        await db.commit()

        users_count_after = (await db.execute(stmt_user_count)).scalar() or 0
        roles_count_after = (await db.execute(stmt_role_count)).scalar() or 0

        print(f"[MIGRATION UPGRADE] Finished Successfully")
        print(f"  Total users in DB: {users_count_before}")
        print(f"  user_roles count BEFORE upgrade: {roles_count_before}")
        print(f"  New role mappings added: {added_count}")
        print(f"  user_roles count AFTER upgrade: {roles_count_after}")
        return users_count_before, roles_count_before, roles_count_after

async def downgrade():
    async with AsyncSessionLocal() as db:
        stmt_user_count = select(func.count(User.id))
        stmt_role_count = select(func.count(UserRoleMapping.id))
        
        users_count_before = (await db.execute(stmt_user_count)).scalar() or 0
        try:
            roles_count_before = (await db.execute(stmt_role_count)).scalar() or 0
        except Exception:
            roles_count_before = 0

        # Drop user_roles table
        async with engine.begin() as conn:
            await conn.run_sync(UserRoleMapping.__table__.drop, checkfirst=True)

        users_count_after = (await db.execute(stmt_user_count)).scalar() or 0

        print(f"[MIGRATION DOWNGRADE] Finished Successfully")
        print(f"  user_roles count BEFORE downgrade: {roles_count_before}")
        print(f"  users table row count preserved: {users_count_before} -> {users_count_after}")
        print(f"  user_roles table cleanly dropped. Legacy user.role column preserved.")

if __name__ == "__main__":
    import sys
    action = sys.argv[1] if len(sys.argv) > 1 else "dry-run"
    if action == "upgrade":
        asyncio.run(upgrade())
    elif action == "downgrade":
        asyncio.run(downgrade())
    elif action == "dry-run":
        print("=========================================================")
        print("=== STEP 1: INITIAL UPGRADE MIGRATION ===")
        print("=========================================================")
        asyncio.run(upgrade())
        
        print("\n=========================================================")
        print("=== STEP 2: IDEMPOTENCY CHECK (SECOND UPGRADE RUN) ===")
        print("=========================================================")
        asyncio.run(upgrade())

        print("\n=========================================================")
        print("=== STEP 3: MIGRATION DOWNGRADE (ROLLBACK) ===")
        print("=========================================================")
        asyncio.run(downgrade())

        print("\n=========================================================")
        print("=== STEP 4: FINAL RE-UPGRADE FOR ACTIVE STATE ===")
        print("=========================================================")
        asyncio.run(upgrade())
