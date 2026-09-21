from pydantic import BaseModel, EmailStr, Field, ConfigDict, model_validator
from typing import Optional, List, Dict, Any
from uuid import UUID
from datetime import datetime
from app.models.user import UserRole, GAMING_ACTIVITIES, PREFERRED_TIERS

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
    city: Optional[str] = Field(None, max_length=100)
    acquisition_source: Optional[str] = Field(None, max_length=100)
    acquisition_medium: Optional[str] = Field(None, max_length=100)
    acquisition_campaign: Optional[str] = Field(None, max_length=100)
    session_id: Optional[str] = Field(None, max_length=64)

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
    city: Optional[str] = Field(None, max_length=100)
    # Email is the login identity. This system has no email verification at
    # all, so allowing the change adds no bypass -- but the seeded
    # @khel-o.com café-owner addresses do not exist, which makes
    # forgot-password useless for them, so this is their only recovery path.
    # current_password is what stops a leaked session from silently
    # reassigning an account that holds payout bank details. It is an auth
    # input, never persisted -- see auth.update_me.
    email: Optional[EmailStr] = None
    current_password: Optional[str] = Field(None, max_length=128)
    # Google-only accounts (no password_hash) prove identity with a fresh
    # Google id_token instead -- see auth.update_me.
    google_id_token: Optional[str] = Field(None, max_length=4096)
    # Whole-document replace, not a partial merge: the client always sends
    # the full current preferences shape
    # ({"activities": [...], "preferredTier": str|None, "favoriteGames": [...]}).
    preferences: Optional[Dict[str, Any]] = None

    @model_validator(mode='after')
    def validate_preferences_gaming_requirement(self) -> 'UserUpdateRequest':
        if self.preferences is not None:
            activities = self.preferences.get('activities') or []
            tier = self.preferences.get('preferredTier')
            games = self.preferences.get('favoriteGames') or []
            has_gaming = any(a in GAMING_ACTIVITIES for a in activities)
            if not has_gaming and (tier or games):
                raise ValueError(
                    'preferredTier and favoriteGames require at least one gaming activity'
                )
            if tier is not None and tier not in PREFERRED_TIERS:
                raise ValueError(f'preferredTier must be one of {sorted(PREFERRED_TIERS)}')
        return self

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True
    )

UserUpdate = UserUpdateRequest

class UserResponse(UserBase):
    id: UUID
    role: UserRole
    is_active: bool
    city: Optional[str] = None
    preferences: Dict[str, Any] = Field(default_factory=dict)
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
