"""GET /admin/search?q= and GET /admin/search/person?phone= (admin only)."""
import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_admin
from app.database import get_db
from app.models.admin_audit_log import AdminAuditLog
from app.models.user import User
from app.services.admin_search import admin_search, person_by_phone

router = APIRouter()


@router.get("", status_code=status.HTTP_200_OK)
async def search_everything(
    q: str = Query("", max_length=100),
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    return {"success": True, "data": await admin_search(db, q)}


@router.get("/person", status_code=status.HTTP_200_OK)
async def person(
    phone: str = Query(..., min_length=3, max_length=20),
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Every record that holds one phone number. Each lookup is written to the audit log."""
    data = await person_by_phone(db, phone)
    if data["digits"]:
        db.add(AdminAuditLog(
            id=uuid.uuid4(), admin_id=current_admin.id, admin_email=current_admin.email, action="person_lookup",
            entity_type="phone", entity_id=f"…{data['digits'][-4:]}", entity_name=data.get("name"),
        ))
        await db.commit()
    return {"success": True, "data": data}
