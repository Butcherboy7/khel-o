from datetime import datetime, timezone
from uuid import uuid4
from fastapi import APIRouter, Depends, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field, ConfigDict

from app.database import get_db
from app.schemas.user import (
    UserCreateRequest,
    LoginRequest,
    GoogleAuthRequest,
    RefreshTokenRequest,
    SwitchRoleRequest,
    UserResponse,
    UserUpdateRequest
)
from app.repositories.user_repository import UserRepository
from app.repositories.cafe_repository import CafeRepository
from app.repositories.staff_invitation_repository import StaffInvitationRepository
from app.services.auth_service import AuthService
from app.api.deps import get_current_user
from app.models.user import User, UserRole
from app.core.security import get_password_hash, verify_password
from app.core.exceptions import BadRequestException, NotFoundException

def to_camel(string: str) -> str:
    components = string.split('_')
    return components[0] + ''.join(x.title() for x in components[1:])

class AcceptInvitationRequest(BaseModel):
    token: str = Field(..., min_length=1)
    password: str = Field(..., min_length=6)

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

class ForgotPasswordRequest(BaseModel):
    email: str = Field(..., min_length=3)

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

class ResetPasswordRequest(BaseModel):
    token: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=6)

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

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

@router.post("/forgot-password", status_code=status.HTTP_200_OK)
async def forgot_password(payload: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    repo = UserRepository(db)
    service = AuthService(repo)
    await service.request_password_reset(payload.email)
    return {
        "success": True,
        "data": {"message": "If that email is registered, a reset link has been sent."}
    }

@router.post("/reset-password", status_code=status.HTTP_200_OK)
async def reset_password(payload: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    repo = UserRepository(db)
    service = AuthService(repo)
    await service.reset_password(payload.token, payload.new_password)
    return {
        "success": True,
        "data": {"message": "Password has been reset. You can now log in."}
    }

@router.get("/me", status_code=status.HTTP_200_OK)
async def get_me(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    from app.api.deps import get_user_roles
    
    roles = await get_user_roles(current_user.id, db)
    
    inv_repo = StaffInvitationRepository(db)
    pending_invs = await inv_repo.get_pending_by_email(current_user.email)
    cafe_repo = CafeRepository(db)
    pending_invitations_list = []
    for inv in pending_invs:
        c = await cafe_repo.get_by_id(inv.venue_id)
        pending_invitations_list.append({
            "id": str(inv.id),
            "venueName": c.name if c else "Gaming Cafe",
            "token": inv.token,
            "role": inv.role,
            "createdAt": inv.created_at.isoformat()
        })

    user_dict = UserResponse.model_validate(current_user).model_dump(by_alias=True)
    user_dict["roles"] = roles
    user_dict["pendingInvitations"] = pending_invitations_list
    
    return {
        "success": True,
        "data": {
            "user": user_dict
        }
    }

@router.patch("/me", status_code=status.HTTP_200_OK)
async def update_me(
    payload: UserUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    repo = UserRepository(db)
    update_data = payload.model_dump(exclude_unset=True, exclude_none=True)
    updated = await repo.update(current_user.id, update_data) if update_data else current_user
    user_dict = UserResponse.model_validate(updated).model_dump(by_alias=True)
    return {
        "success": True,
        "data": {
            "user": user_dict
        }
    }

@router.post("/switch-role", status_code=status.HTTP_200_OK)
async def switch_role(
    payload: SwitchRoleRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    repo = UserRepository(db)
    service = AuthService(repo)
    result = await service.switch_active_role(current_user, payload.target_role, db)
    return {
        "success": True,
        "data": result
    }

@router.get("/invitation", status_code=status.HTTP_200_OK)
async def get_invitation_details(
    token: str = Query(...),
    db: AsyncSession = Depends(get_db)
):
    inv_repo = StaffInvitationRepository(db)
    invitation = await inv_repo.get_by_token(token)
    if not invitation:
        raise NotFoundException("Invitation not found")

    if invitation.status != "pending":
        raise BadRequestException(f"Invitation has already been {invitation.status}")

    now = datetime.now(timezone.utc)
    expires_at = invitation.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if expires_at < now:
        await inv_repo.update_status(invitation.id, "expired")
        raise BadRequestException("Invitation has expired")

    cafe_repo = CafeRepository(db)
    cafe = await cafe_repo.get_by_id(invitation.venue_id)
    venue_name = cafe.name if cafe else "Gaming Cafe"

    return {
        "success": True,
        "data": {
            "invitation": {
                "id": str(invitation.id),
                "email": invitation.email,
                "fullName": invitation.full_name,
                "role": invitation.role,
                "venueId": str(invitation.venue_id),
                "venueName": venue_name,
                "expiresAt": invitation.expires_at.isoformat()
            }
        }
    }

@router.post("/accept-invitation", status_code=status.HTTP_200_OK)
async def accept_invitation(
    payload: AcceptInvitationRequest,
    db: AsyncSession = Depends(get_db)
):
    inv_repo = StaffInvitationRepository(db)
    invitation = await inv_repo.get_by_token(payload.token)
    if not invitation:
        raise NotFoundException("Invitation not found")

    if invitation.status != "pending":
        raise BadRequestException(f"Invitation has already been {invitation.status}")

    now = datetime.now(timezone.utc)
    expires_at = invitation.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if expires_at < now:
        await inv_repo.update_status(invitation.id, "expired")
        raise BadRequestException("Invitation has expired")

    user_repo = UserRepository(db)
    user = await user_repo.get_by_email(invitation.email)

    if user:
        if payload.password:
            await user_repo.update(user.id, {"password_hash": get_password_hash(payload.password)})
        await user_repo.update_role(user.id, UserRole.STAFF, cafe_id=invitation.venue_id)
    else:
        new_user_dict = {
            "id": uuid4(),
            "email": invitation.email,
            "password_hash": get_password_hash(payload.password),
            "full_name": invitation.full_name,
            "phone_number": invitation.phone_number,
            "role": UserRole.STAFF,
            "is_active": True
        }
        user = await user_repo.create(new_user_dict)
        await user_repo.update_role(user.id, UserRole.STAFF, cafe_id=invitation.venue_id)

    await inv_repo.update_status(invitation.id, "accepted")
    await db.commit()

    auth_svc = AuthService(user_repo)
    access_token, refresh_token = auth_svc.create_tokens(user)

    return {
        "success": True,
        "data": {
            "accessToken": access_token,
            "refreshToken": refresh_token,
            "user": await auth_svc._user_response_with_roles(user)
        }
    }

