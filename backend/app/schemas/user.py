from pydantic import BaseModel, EmailStr, Field, ConfigDict
from typing import Optional, List
from uuid import UUID
from datetime import datetime
from app.models.user import UserRole

def to_camel(string: str) -> str:
    components = string.split('_')
    return components[0] + ''.join(x.title() for x in components[1:])

class UserBase(BaseModel):
    email: EmailStr
    full_name: str = Field(..., min_length=2, max_length=255)
    phone_number: Optional[str] = Field(None, max_length=20)
    avatar_url: Optional[str] = Field(None, max_length=500)

class UserCreateRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8)
    full_name: str = Field(..., min_length=2, max_length=255)
    phone_number: Optional[str] = Field(None, max_length=20)

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True
    )

UserCreate = UserCreateRequest

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True
    )

class GoogleAuthRequest(BaseModel):
    id_token: str = Field(..., alias="idToken")

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True
    )

class RefreshTokenRequest(BaseModel):
    refresh_token: str = Field(..., alias="refreshToken")

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True
    )

class SwitchRoleRequest(BaseModel):
    target_role: str = Field(..., alias="targetRole")

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True
    )

class UserUpdateRequest(BaseModel):
    full_name: Optional[str] = Field(None, min_length=2, max_length=255)
    phone_number: Optional[str] = Field(None, max_length=20)
    avatar_url: Optional[str] = Field(None, max_length=500)

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True
    )

UserUpdate = UserUpdateRequest

class UserResponse(UserBase):
    id: UUID
    role: UserRole
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(
        from_attributes=True,
        alias_generator=to_camel,
        populate_by_name=True
    )

class UserListResponse(BaseModel):
    items: List[UserResponse]
    total: int
    page: int
    page_size: int

    model_config = ConfigDict(
        from_attributes=True,
        alias_generator=to_camel,
        populate_by_name=True
    )
