from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.schemas.user import UserCreate, UserResponse
from app.repositories.user_repository import UserRepository
from app.services.auth_service import AuthService

router = APIRouter()

@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register_user(payload: UserCreate, db: AsyncSession = Depends(get_db)):
    repo = UserRepository(db)
    service = AuthService(repo)
    return await service.register_user(payload)

@router.post("/login")
async def login_user(email: str, password: str, db: AsyncSession = Depends(get_db)):
    repo = UserRepository(db)
    service = AuthService(repo)
    return await service.authenticate_user(email, password)
