from typing import Optional, Dict, Any
from app.repositories.user_repository import UserRepository
from app.schemas.user import UserCreate, UserResponse
from app.models.user import User, UserRole
from app.core.security import get_password_hash, verify_password, create_access_token
from app.core.exceptions import AuthException, ConflictException

class AuthService:
    def __init__(self, user_repo: UserRepository):
        self.user_repo = user_repo

    async def register_user(self, user_in: UserCreate) -> UserResponse:
        existing = await self.user_repo.get_by_email(user_in.email)
        if existing:
            raise ConflictException(message="Email address already registered", error_code="EMAIL_EXISTS")

        hashed_password = get_password_hash(user_in.password) if user_in.password else None
        user = User(
            email=user_in.email,
            password_hash=hashed_password,
            google_id=user_in.google_id,
            full_name=user_in.full_name,
            phone_number=user_in.phone_number,
            role=user_in.role,
            avatar_url=user_in.avatar_url,
        )
        created = await self.user_repo.create(user)
        return UserResponse.model_validate(created)

    async def authenticate_user(self, email: str, password: str) -> Dict[str, Any]:
        user = await self.user_repo.get_by_email(email)
        if not user or not user.password_hash or not verify_password(password, user.password_hash):
            raise AuthException(message="Invalid email or password", error_code="INVALID_CREDENTIALS")

        access_token = create_access_token(subject=str(user.id), role=user.role.value)
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user": UserResponse.model_validate(user)
        }
