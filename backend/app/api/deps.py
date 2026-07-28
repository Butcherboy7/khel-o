from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.core.security import decode_token
from app.core.exceptions import AuthException, ForbiddenException
from app.models.user import User, UserRole
from fastapi.security import OAuth2PasswordBearer

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")

async def get_current_user(
    db: AsyncSession = Depends(get_db),
    token: str = Depends(oauth2_scheme)
) -> User:
    payload = decode_token(token)
    user_id = payload.get("sub")
    if not user_id:
        raise AuthException(message="Invalid token payload")
        
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()
    if not user or not user.is_active:
        raise AuthException(message="User not found or inactive")
        
    return user

async def get_current_cafe_owner(
    current_user: User = Depends(get_current_user)
) -> User:
    if current_user.role not in [UserRole.CAFE_OWNER, UserRole.ADMIN]:
        raise ForbiddenException(message="Only café owners can perform this action")
    return current_user
