from typing import Optional, Dict, Any
from uuid import UUID

from app.repositories.support_ticket_repository import SupportTicketRepository
from app.models.support_ticket import SupportTicket, SupportTicketStatus, SupportTicketPriority
from app.schemas.support import SupportTicketCreateRequest, SupportTicketResponse
from app.core.exceptions import NotFoundException, ValidationException


class SupportTicketService:
    def __init__(self, ticket_repo: SupportTicketRepository):
        self.ticket_repo = ticket_repo

    async def create_ticket(self, user_id: UUID, payload: SupportTicketCreateRequest) -> SupportTicketResponse:
        ticket = SupportTicket(
            user_id=user_id,
            subject=payload.subject,
            description=payload.description,
            category=payload.category,
            booking_id=payload.booking_id,
            cafe_id=payload.cafe_id,
        )
        created = await self.ticket_repo.create(ticket)
        return SupportTicketResponse.model_validate(created)

    async def list_my_tickets(self, user_id: UUID, page: int = 1, limit: int = 20) -> Dict[str, Any]:
        items, total = await self.ticket_repo.get_by_user(user_id, page, limit)
        return {
            "items": [SupportTicketResponse.model_validate(t) for t in items],
            "total": total,
            "page": page,
            "pageSize": limit,
        }

    async def list_all_tickets(
        self, status: Optional[str] = None, category: Optional[str] = None, page: int = 1, limit: int = 20
    ) -> Dict[str, Any]:
        status_enum = None
        if status:
            try:
                status_enum = SupportTicketStatus(status)
            except ValueError:
                raise ValidationException(message=f"Invalid status '{status}'", error_code="INVALID_STATUS")
        items, total = await self.ticket_repo.list_all(status_enum, category, page, limit)
        return {
            "items": [SupportTicketResponse.model_validate(t) for t in items],
            "total": total,
            "page": page,
            "pageSize": limit,
        }

    async def get_ticket(self, ticket_id: UUID) -> SupportTicket:
        ticket = await self.ticket_repo.get_by_id(ticket_id)
        if not ticket:
            raise NotFoundException(message="Support ticket not found", error_code="TICKET_NOT_FOUND")
        return ticket

    async def update_ticket(
        self,
        ticket_id: UUID,
        resolved_by: UUID,
        status: Optional[str] = None,
        priority: Optional[str] = None,
        admin_notes: Optional[str] = None,
    ) -> SupportTicketResponse:
        ticket = await self.get_ticket(ticket_id)

        fields: Dict[str, Any] = {"admin_notes": admin_notes}
        if status:
            try:
                fields["status"] = SupportTicketStatus(status)
            except ValueError:
                raise ValidationException(message=f"Invalid status '{status}'", error_code="INVALID_STATUS")
        if priority:
            try:
                fields["priority"] = SupportTicketPriority(priority)
            except ValueError:
                raise ValidationException(message=f"Invalid priority '{priority}'", error_code="INVALID_PRIORITY")
        if fields.get("status") in (SupportTicketStatus.RESOLVED, SupportTicketStatus.CLOSED):
            fields["resolved_by"] = resolved_by

        updated = await self.ticket_repo.update_fields(ticket, fields)
        return SupportTicketResponse.model_validate(updated)
