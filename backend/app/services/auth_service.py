from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any, Tuple
from uuid import UUID, uuid4
from jose import jwt, JWTError, ExpiredSignatureError
import httpx

from app.config import settings
from app.repositories.user_repository import UserRepository
from app.schemas.user import UserCreateRequest, UserResponse
from app.models.user import User, UserRole
from app.core.security import get_password_hash, verify_password
from app.core.exceptions import AuthException, ConflictException, ForbiddenException

ALGORITHM = "HS256"

class AuthService:
    def __init__(self, user_repo: UserRepository):
        self.user_repo = user_repo

    def create_tokens(self, user: User) -> Tuple[str, str]:
        now = datetime.now(timezone.utc)
        
        role_str = user.role.value if hasattr(user.role, "value") else str(user.role)

        # Access Token
        access_exp = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        access_payload = {
            "sub": str(user.id),
            "email": user.email,
            "role": role_str,
            "type": "access",
            "exp": access_exp
        }
        access_token = jwt.encode(access_payload, settings.SECRET_KEY, algorithm=ALGORITHM)

        # Refresh Token
        refresh_exp = now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
        refresh_payload = {
            "sub": str(user.id),
            "type": "refresh",
            "exp": refresh_exp
        }
        refresh_token = jwt.encode(refresh_payload, settings.SECRET_KEY, algorithm=ALGORITHM)

        return access_token, refresh_token

    async def register_with_email(self, user_data: UserCreateRequest) -> Dict[str, Any]:
        clean_email = user_data.email.strip().lower()
        existing = await self.user_repo.get_by_email(clean_email)
        if existing:
            raise ConflictException(
                message="An account with this email already exists",
                error_code="EMAIL_ALREADY_EXISTS"
            )

        hashed_password = get_password_hash(user_data.password)
        
        user_dict = {
            "id": uuid4(),
            "email": clean_email,
            "password_hash": hashed_password,
            "full_name": user_data.full_name.strip(),
            "phone_number": user_data.phone_number,
            "role": UserRole.GAMER,
            "is_active": True,
            "google_id": None,
            "avatar_url": None
        }

        created_user = await self.user_repo.create(user_dict)
        access_token, refresh_token = self.create_tokens(created_user)

        return {
            "accessToken": access_token,
            "refreshToken": refresh_token,
            "user": UserResponse.model_validate(created_user)
        }

    async def login_with_email(self, email: str, password: str) -> Dict[str, Any]:
        clean_email = email.strip().lower()
        user = await self.user_repo.get_by_email(clean_email)
        
        if not user:
            raise AuthException(message="Invalid email or password", error_code="UNAUTHORIZED")

        if not user.password_hash:
            raise AuthException(
                message="This account uses Google Sign In. Please login with Google.",
                error_code="UNAUTHORIZED"
            )

        if not verify_password(password, user.password_hash):
            raise AuthException(message="Invalid email or password", error_code="UNAUTHORIZED")

        if not user.is_active:
            raise ForbiddenException(message="Your account has been deactivated", error_code="ACCOUNT_DEACTIVATED")

        access_token, refresh_token = self.create_tokens(user)

        return {
            "accessToken": access_token,
            "refreshToken": refresh_token,
            "user": UserResponse.model_validate(user)
        }

    async def login_with_google(self, id_token: str) -> Dict[str, Any]:
        url = f"https://oauth2.googleapis.com/tokeninfo?id_token={id_token}"
        async with httpx.AsyncClient() as client:
            res = await client.get(url)
        
        if res.status_code != 200:
            raise AuthException(message="Invalid Google token", error_code="UNAUTHORIZED")
        
        token_info = res.json()
        
        if settings.GOOGLE_CLIENT_ID and token_info.get("aud") != settings.GOOGLE_CLIENT_ID:
            raise AuthException(message="Token audience mismatch", error_code="UNAUTHORIZED")

        google_id = token_info.get("sub")
        email = token_info.get("email", "").strip().lower()
        full_name = token_info.get("name", "Google User")
        avatar_url = token_info.get("picture")

        if not google_id or not email:
            raise AuthException(message="Invalid Google payload", error_code="UNAUTHORIZED")

        # 1. Check if user exists by google_id
        user = await self.user_repo.get_by_google_id(google_id)
        if user:
            if not user.is_active:
                raise ForbiddenException(message="Your account has been deactivated", error_code="ACCOUNT_DEACTIVATED")
            access_token, refresh_token = self.create_tokens(user)
            return {
                "accessToken": access_token,
                "refreshToken": refresh_token,
                "user": UserResponse.model_validate(user)
            }

        # 2. Check if user exists by email
        user_by_email = await self.user_repo.get_by_email(email)
        if user_by_email:
            if not user_by_email.is_active:
                raise ForbiddenException(message="Your account has been deactivated", error_code="ACCOUNT_DEACTIVATED")
            # Link Google ID and avatar
            updated_data = {"google_id": google_id}
            if avatar_url and not user_by_email.avatar_url:
                updated_data["avatar_url"] = avatar_url
            user = await self.user_repo.update(user_by_email.id, updated_data)
        else:
            # 3. Create new user
            user_dict = {
                "id": uuid4(),
                "email": email,
                "password_hash": None,
                "google_id": google_id,
                "full_name": full_name,
                "avatar_url": avatar_url,
                "role": UserRole.GAMER,
                "is_active": True
            }
            user = await self.user_repo.create(user_dict)

        access_token, refresh_token = self.create_tokens(user)
        return {
            "accessToken": access_token,
            "refreshToken": refresh_token,
            "user": UserResponse.model_validate(user)
        }

    async def refresh_access_token(self, refresh_token: str) -> Dict[str, Any]:
        try:
            payload = jwt.decode(refresh_token, settings.SECRET_KEY, algorithms=[ALGORITHM])
        except ExpiredSignatureError:
            raise AuthException(message="Invalid or expired refresh token", error_code="UNAUTHORIZED")
        except JWTError:
            raise AuthException(message="Invalid or expired refresh token", error_code="UNAUTHORIZED")

        if payload.get("type") != "refresh":
            raise AuthException(message="Invalid or expired refresh token", error_code="UNAUTHORIZED")

        sub = payload.get("sub")
        if not sub:
            raise AuthException(message="Invalid or expired refresh token", error_code="UNAUTHORIZED")

        try:
            user_id = UUID(sub)
        except ValueError:
            raise AuthException(message="Invalid or expired refresh token", error_code="UNAUTHORIZED")

        user = await self.user_repo.get_by_id(user_id)
        if not user or not user.is_active:
            raise AuthException(message="Invalid or expired refresh token", error_code="UNAUTHORIZED")

        now = datetime.now(timezone.utc)
        access_exp = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        role_str = user.role.value if hasattr(user.role, "value") else str(user.role)
        access_payload = {
            "sub": str(user.id),
            "email": user.email,
            "role": role_str,
            "type": "access",
            "exp": access_exp
        }
        new_access_token = jwt.encode(access_payload, settings.SECRET_KEY, algorithm=ALGORITHM)

        return {
            "accessToken": new_access_token
        }

    async def get_current_user(self, token: str) -> User:
        try:
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
        except ExpiredSignatureError:
            raise AuthException(message="Session expired. Please login again.", error_code="UNAUTHORIZED")
        except JWTError:
            raise AuthException(message="Invalid authentication token", error_code="UNAUTHORIZED")

        if payload.get("type") != "access":
            raise AuthException(message="Invalid authentication token", error_code="UNAUTHORIZED")

        sub = payload.get("sub")
        if not sub:
            raise AuthException(message="Invalid authentication token", error_code="UNAUTHORIZED")

        try:
            user_id = UUID(sub)
        except ValueError:
            raise AuthException(message="Invalid authentication token", error_code="UNAUTHORIZED")

        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise AuthException(message="Invalid authentication token", error_code="UNAUTHORIZED")

        if not user.is_active:
            raise ForbiddenException(message="Your account has been deactivated", error_code="ACCOUNT_DEACTIVATED")

        return user
