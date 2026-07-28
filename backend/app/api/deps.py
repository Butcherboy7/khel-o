from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import AsyncGenerator

from app.database import get_db
from app.core.security import decode_token
from app.core.exceptions import AuthException
from app.models.user import User

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
