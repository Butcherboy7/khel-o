# backend/app/api/v1/owner_payouts.py — full replacement
from decimal import Decimal

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.api.deps import require_cafe_owner
from app.core.exceptions import AuthException, BadRequestException
from app.core.payout_encryption import decrypt_bank_account_number
from app.core.security import verify_password
from app.models.cafe import Cafe
from app.models.owner_audit_log import OwnerAuditLog
from app.models.user import User
from app.repositories.cafe_payout_repository import CafePayoutRepository
from app.repositories.owner_payout_repository import OwnerPayoutRepository
from app.schemas.owner_payout_destination import OwnerPayoutDestinationUpdateRequest
from app.services.notification_service import NotificationService

router = APIRouter()


def _mask_summary(account) -> str:
    if not account:
        return "No destination on file"
    parts = []
    if account.upi_vpa:
        parts.append(f"UPI: {account.upi_vpa}")
    if account.bank_account_number_masked:
        parts.append(f"Bank: {account.bank_account_number_masked} / IFSC {account.bank_ifsc}")
    return " | ".join(parts) if parts else "No destination on file"


def _destination_response(account) -> dict | None:
    if not account:
        return None
    return {
        "upiVpa": account.upi_vpa,
        "bankAccountNumberMasked": account.bank_account_number_masked,
        "bankIfsc": account.bank_ifsc,
        "accountHolderName": account.account_holder_name,
        "version": account.version,
        "updatedAt": account.updated_at.isoformat(),
    }


@router.get("/cafe-payouts", status_code=status.HTTP_200_OK)
async def get_owner_cafe_payouts(
    current_owner: User = Depends(require_cafe_owner),
    db: AsyncSession = Depends(get_db),
):
    # An owner can have multiple cafés. This must aggregate across ALL of
    # them (outstanding balance summed, history merged) to agree with
    # /payouts/summary on the same owner payouts screen, which already
    # aggregates across every café the owner owns — picking just the
    # most-recently-created café here would silently hide any other café's
    # balance/history.
    cafe_stmt = (
        select(Cafe)
        .where(Cafe.owner_id == current_owner.id)
        .order_by(Cafe.created_at.desc())
    )
    cafes = (await db.execute(cafe_stmt)).scalars().all()

    if not cafes:
        return {"success": True, "data": {"outstandingAmount": 0.0, "history": []}}

    cafe_ids = [c.id for c in cafes]
    repo = CafePayoutRepository(db)

    outstanding = Decimal("0")
    for cafe_id in cafe_ids:
        outstanding += await repo.get_outstanding_amount(cafe_id)

    history = await repo.list_payouts(cafe_id=cafe_ids)

    return {
        "success": True,
        "data": {
            "outstandingAmount": float(outstanding),
            "history": history["items"],
        },
    }


@router.get("/destination", status_code=status.HTTP_200_OK)
async def get_payout_destination(
    current_owner: User = Depends(require_cafe_owner),
    db: AsyncSession = Depends(get_db),
):
    account = await OwnerPayoutRepository(db).get_by_owner_id(current_owner.id)
    return {"success": True, "data": {"destination": _destination_response(account)}}


@router.patch("/destination", status_code=status.HTTP_200_OK)
async def update_payout_destination(
    payload: OwnerPayoutDestinationUpdateRequest,
    current_owner: User = Depends(require_cafe_owner),
    db: AsyncSession = Depends(get_db),
):
    if not verify_password(payload.current_password, current_owner.password_hash):
        raise AuthException("Incorrect password.")

    payout_repo = OwnerPayoutRepository(db)
    existing = await payout_repo.get_by_owner_id(current_owner.id)
    before_summary = _mask_summary(existing)

    # A field absent from the request body means "leave unchanged" — resolve
    # it from the existing account. An explicit null in the body still means
    # "clear this field": model_dump(exclude_unset=True) keeps explicit None
    # values, only true omissions are missing from `sent`.
    sent = payload.model_dump(exclude_unset=True)

    resolved_upi_vpa = sent.get("upi_vpa", existing.upi_vpa if existing else None)
    resolved_bank_ifsc = sent.get("bank_ifsc", existing.bank_ifsc if existing else None)
    resolved_account_holder_name = sent.get(
        "account_holder_name", existing.account_holder_name if existing else None
    )
    resolved_bank_name = sent.get("bank_name", existing.bank_name if existing else None)
    resolved_account_type = sent.get("account_type", existing.account_type if existing else None)
    resolved_business_pan = sent.get("business_pan", existing.business_pan if existing else None)

    if "bank_account_number" in sent:
        resolved_bank_account_number = sent["bank_account_number"]
    elif existing and existing.bank_account_number_encrypted:
        try:
            resolved_bank_account_number = decrypt_bank_account_number(
                existing.bank_account_number_encrypted
            )
        except Exception:
            raise BadRequestException(
                "We couldn't read your existing bank account number to keep it while saving "
                "these changes. Please re-enter your bank account number along with your other "
                "changes to continue."
            )
    else:
        resolved_bank_account_number = None

    would_clear_destination = not resolved_upi_vpa and not resolved_bank_account_number
    if would_clear_destination:
        cafe_ids = [
            row[0] for row in
            (await db.execute(select(Cafe.id).where(Cafe.owner_id == current_owner.id))).all()
        ]
        outstanding = await CafePayoutRepository(db).get_outstanding_amount_for_owner_cafes(cafe_ids)
        if outstanding > 0:
            raise BadRequestException(
                "You can't remove your only payout destination while you have an outstanding "
                "balance — add a valid UPI ID or bank account first, or wait until it's paid out."
            )

    account = await payout_repo.upsert_payout_details(
        owner_id=current_owner.id,
        upi_vpa=resolved_upi_vpa,
        bank_account_number=resolved_bank_account_number,
        bank_ifsc=resolved_bank_ifsc,
        account_holder_name=resolved_account_holder_name,
        bank_name=resolved_bank_name,
        account_type=resolved_account_type,
        business_pan=resolved_business_pan,
        default_holder_name=current_owner.full_name,
    )
    after_summary = _mask_summary(account)

    db.add(OwnerAuditLog(
        owner_id=current_owner.id,
        action="payout_details.updated",
        entity_type="owner_payout_account",
        entity_id=str(account.id),
        before_summary=before_summary,
        after_summary=after_summary,
    ))
    await db.commit()
    await db.refresh(account)

    await NotificationService().send_payout_details_changed(
        email=current_owner.email, full_name=current_owner.full_name,
    )

    return {"success": True, "data": {"destination": _destination_response(account)}}
