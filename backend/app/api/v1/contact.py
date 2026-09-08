from fastapi import APIRouter, status
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Depends

from app.database import get_db
from app.schemas.contact import ContactMessageCreateRequest
from app.repositories.platform_settings_repository import PlatformSettingsRepository
from app.services.notification_service import NotificationService
from app.core.logging import logger

router = APIRouter(prefix="/contact", tags=["Contact"])


@router.post("", status_code=status.HTTP_202_ACCEPTED)
async def submit_contact_message(
    payload: ContactMessageCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Public, unauthenticated — the marketing/legal contact page's form.
    Always reports success to the caller (including to bots that trip the
    honeypot) so the field's presence can't be used to fingerprint it."""
    if payload.company:
        logger.warning("contact_form_honeypot_triggered", email=payload.email)
        return {"success": True, "data": {"submitted": True}}

    settings_repo = PlatformSettingsRepository(db)
    settings = await settings_repo.get_or_create()

    notification_service = NotificationService()
    await notification_service.send_contact_message(
        to_email=settings.support_email,
        name=payload.name,
        from_email=payload.email,
        category=payload.category,
        message=payload.message,
    )

    return {"success": True, "data": {"submitted": True}}
