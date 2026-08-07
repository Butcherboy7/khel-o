from typing import Optional, List
from uuid import UUID
from fastapi import Depends, Path
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.core.exceptions import ForbiddenException
from app.models.user import User, UserRole
from app.models.user_role import UserRoleMapping
from app.models.cafe import Cafe, VerificationStatus
from app.repositories.user_repository import UserRepository
from app.services.auth_service import AuthService

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")
oauth2_scheme_optional = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)

async def get_user_roles(user_id, db: AsyncSession) -> List[str]:
    """Fetch all roles for a user from user_roles table (sole source of truth for authorization)."""
    stmt = select(UserRoleMapping.role).where(UserRoleMapping.user_id == user_id)
    res = await db.execute(stmt)
    roles = res.scalars().all()
    return [r.value if hasattr(r, "value") else str(r) for r in roles]

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db)
) -> User:
    repo = UserRepository(db)
    service = AuthService(repo)
    return await service.get_current_user(token)

async def get_optional_user(
    token: Optional[str] = Depends(oauth2_scheme_optional),
    db: AsyncSession = Depends(get_db)
) -> Optional[User]:
    if not token:
        return None
    try:
        repo = UserRepository(db)
        service = AuthService(repo)
        return await service.get_current_user(token)
    except Exception:
        return None

async def get_current_active_user(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> User:
    # DB-backed re-check for revocation / deactivation mid-session
    repo = UserRepository(db)
    fresh_user = await repo.get_by_id(current_user.id)
    if not fresh_user or not fresh_user.is_active:
        raise ForbiddenException("Your account has been deactivated or revoked.")
    return fresh_user

async def require_gamer(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
) -> User:
    roles = await get_user_roles(current_user.id, db)
    if "gamer" not in roles:
        raise ForbiddenException("This action requires a gamer account")
    return current_user

async def require_cafe_owner(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
) -> User:
    roles = await get_user_roles(current_user.id, db)
    if "cafe_owner" not in roles and "admin" not in roles:
        raise ForbiddenException("This action requires a café owner account")
    
    if "cafe_owner" in roles:
        from app.models.cafe import Cafe, VerificationStatus
        stmt = select(Cafe).where(Cafe.owner_id == current_user.id).order_by(Cafe.created_at.desc())
        res = await db.execute(stmt)
        cafe = res.scalars().first()
        if cafe and cafe.verification_status == VerificationStatus.SUSPENDED:
            raise ForbiddenException("Suspended café accounts cannot perform live operations", error_code="CAFE_SUSPENDED")

    return current_user

async def require_staff(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
) -> User:
    roles = await get_user_roles(current_user.id, db)
    if "staff" not in roles and "cafe_owner" not in roles and "admin" not in roles:
        raise ForbiddenException("This action requires a staff or owner account")
    return current_user

async def require_staff_or_owner(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
) -> User:
    return await require_staff(current_user, db)

async def require_admin(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
) -> User:
    roles = await get_user_roles(current_user.id, db)
    if "admin" not in roles:
        raise ForbiddenException("This action requires an admin account")
    return current_user

async def require_cafe_ownership(
    cafe_id: UUID = Path(...),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
) -> Cafe:
    """
    Verify BOTH that user has cafe_owner role AND owns the specific cafe.
    Returns the Cafe if authorized, raises ForbiddenException otherwise.
    """
    roles = await get_user_roles(current_user.id, db)
    if "cafe_owner" not in roles and "admin" not in roles:
        raise ForbiddenException("This action requires a café owner account", error_code="NOT_CAFE_OWNER")
    
    stmt = select(Cafe).where(Cafe.id == cafe_id)
    res = await db.execute(stmt)
    cafe = res.scalars().first()
    
    if not cafe:
        raise ForbiddenException("Café not found", error_code="CAFE_NOT_FOUND")
    
    if str(cafe.owner_id) != str(current_user.id) and "admin" not in roles:
        raise ForbiddenException("You do not have permission to manage this café", error_code="NOT_CAFE_OWNER")
    
    if cafe.verification_status == VerificationStatus.SUSPENDED:
        raise ForbiddenException("Suspended café accounts cannot perform live operations", error_code="CAFE_SUSPENDED")
    
    return cafe

get_current_cafe_owner = require_cafe_owner
