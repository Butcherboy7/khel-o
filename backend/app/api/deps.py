from typing import Optional
from fastapi import Depends
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.core.exceptions import ForbiddenException
from app.models.user import User, UserRole
from app.repositories.user_repository import UserRepository
from app.services.auth_service import AuthService

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")
oauth2_scheme_optional = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)

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
    current_user: User = Depends(get_current_active_user)
) -> User:
    role_val = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
    if role_val != "gamer":
        raise ForbiddenException("This action requires a gamer account")
    return current_user

async def require_cafe_owner(
    current_user: User = Depends(get_current_active_user)
) -> User:
    role_val = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
    if role_val not in ["cafe_owner", "admin"]:
        raise ForbiddenException("This action requires a café owner account")
    return current_user

async def require_staff(
    current_user: User = Depends(get_current_active_user)
) -> User:
    role_val = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
    if role_val not in ["staff", "cafe_owner", "admin"]:
        raise ForbiddenException("This action requires a staff or owner account")
    return current_user

async def require_staff_or_owner(
    current_user: User = Depends(get_current_active_user)
) -> User:
    return await require_staff(current_user)

async def require_admin(
    current_user: User = Depends(get_current_active_user)
) -> User:
    role_val = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
    if role_val != "admin":
        raise ForbiddenException("This action requires an admin account")
    return current_user

get_current_cafe_owner = require_cafe_owner
