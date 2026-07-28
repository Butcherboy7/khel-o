from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.schemas.user import (
    UserCreateRequest,
    LoginRequest,
    GoogleAuthRequest,
    RefreshTokenRequest,
    UserResponse
)
from app.repositories.user_repository import UserRepository
from app.services.auth_service import AuthService
from app.api.deps import get_current_user
from app.models.user import User

router = APIRouter()

@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register_user(payload: UserCreateRequest, db: AsyncSession = Depends(get_db)):
    repo = UserRepository(db)
    service = AuthService(repo)
    result = await service.register_with_email(payload)
    return {
        "success": True,
        "data": result
    }

@router.post("/login", status_code=status.HTTP_200_OK)
async def login_user(payload: LoginRequest, db: AsyncSession = Depends(get_db)):
    repo = UserRepository(db)
    service = AuthService(repo)
    result = await service.login_with_email(payload.email, payload.password)
    return {
        "success": True,
        "data": result
    }

@router.post("/google", status_code=status.HTTP_200_OK)
async def google_auth(payload: GoogleAuthRequest, db: AsyncSession = Depends(get_db)):
    repo = UserRepository(db)
    service = AuthService(repo)
    result = await service.login_with_google(payload.id_token)
    return {
        "success": True,
        "data": result
    }

@router.post("/refresh", status_code=status.HTTP_200_OK)
async def refresh_token(payload: RefreshTokenRequest, db: AsyncSession = Depends(get_db)):
    repo = UserRepository(db)
    service = AuthService(repo)
    result = await service.refresh_access_token(payload.refresh_token)
    return {
        "success": True,
        "data": result
    }

@router.get("/me", status_code=status.HTTP_200_OK)
async def get_me(current_user: User = Depends(get_current_user)):
    return {
        "success": True,
        "data": {
            "user": UserResponse.model_validate(current_user)
        }
    }
