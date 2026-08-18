from uuid import UUID
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.support import SupportTicketCreateRequest, SupportTicketResponse
from app.repositories.support_ticket_repository import SupportTicketRepository
from app.services.support_ticket_service import SupportTicketService
from app.api.deps import get_current_active_user
from app.models.user import User

router = APIRouter(prefix="/support/tickets", tags=["Support"])


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_ticket(
    payload: SupportTicketCreateRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    service = SupportTicketService(SupportTicketRepository(db))
    ticket = await service.create_ticket(current_user.id, payload)
    return {"success": True, "data": {"ticket": ticket}}


@router.get("", status_code=status.HTTP_200_OK)
async def list_my_tickets(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=50),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    service = SupportTicketService(SupportTicketRepository(db))
    result = await service.list_my_tickets(current_user.id, page, limit)
    return {"success": True, "data": result}


@router.get("/{ticket_id}", status_code=status.HTTP_200_OK)
async def get_my_ticket(
    ticket_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    service = SupportTicketService(SupportTicketRepository(db))
    ticket = await service.get_ticket(ticket_id)
    if ticket.user_id != current_user.id and current_user.role.value != "admin":
        from app.core.exceptions import ForbiddenException
        raise ForbiddenException("You cannot view another user's support ticket")
    return {"success": True, "data": {"ticket": SupportTicketResponse.model_validate(ticket)}}
