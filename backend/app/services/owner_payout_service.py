import uuid
from datetime import datetime, timezone
from typing import Optional
import httpx
from app.repositories.owner_payout_repository import OwnerPayoutRepository
from app.schemas.owner_payout import PayoutAccountCreateRequest, PayoutAccountResponse
from app.models.owner_payout_account import OwnerPayoutAccount
from app.core.exceptions import NotFoundException, ValidationException
from app.config import settings

class OwnerPayoutService:
    def __init__(self, payout_repo: OwnerPayoutRepository):
        self.payout_repo = payout_repo

    async def get_payout_status(self, owner_id: uuid.UUID) -> Optional[PayoutAccountResponse]:
        account = await self.payout_repo.get_by_owner_id(owner_id)
        if not account:
            return None
        return PayoutAccountResponse.model_validate(account)

    async def submit_payout_details(self, owner_id: uuid.UUID, payload: PayoutAccountCreateRequest, owner_email: str) -> PayoutAccountResponse:
        existing = await self.payout_repo.get_by_owner_id(owner_id)
        if existing and existing.kyc_status == "activated":
            raise ValidationException(message="KYC has already been completed and verified", error_code="KYC_ALREADY_VERIFIED")

        # Call Razorpay Create Linked Account API in test/mock mode
        # In a real environment, you make a POST call to Razorpay accounts endpoint.
        # We check feature flag first.
        razorpay_account_id = f"acc_mock_{uuid.uuid4().hex[:12]}"
        kyc_status = "submitted"

        if getattr(settings, "RAZORPAY_ROUTE_ENABLED", False):
            # Real API call to Razorpay
            try:
                auth = (settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET)
                async with httpx.AsyncClient() as client:
                    res = await client.post(
                        "https://api.razorpay.com/v1/accounts",
                        auth=auth,
                        json={
                            "email": owner_email,
                            "phone": "9999999999", # placeholder
                            "type": "route",
                            "reference_id": str(owner_id),
                            "legal_business_name": payload.account_holder_name,
                            "profile": {
                                "category": "services",
                                "subcategory": "gaming"
                            }
                        }
                    )
                    if res.status_code == 200:
                        data = res.json()
                        razorpay_account_id = data.get("id", razorpay_account_id)
                    else:
                        raise ValidationException(
                            message=f"Razorpay account creation failed: {res.text}",
                            error_code="PAYMENT_GATEWAY_ERROR"
                        )
            except Exception as e:
                # Fallback to mock in local dev if gateway fails
                if settings.ENVIRONMENT == "production":
                     raise ValidationException(message=f"Failed connecting to Razorpay: {str(e)}", error_code="PAYMENT_GATEWAY_ERROR")

        payout_dict = {
            "id": uuid.uuid4() if not existing else existing.id,
            "owner_id": owner_id,
            "razorpay_account_id": razorpay_account_id,
            "kyc_status": kyc_status,
            "business_pan": payload.business_pan,
            "bank_account_number_masked": f"******{payload.bank_account_number[-4:]}",
            "bank_ifsc": payload.bank_ifsc,
            "account_holder_name": payload.account_holder_name,
            "submitted_at": datetime.now(timezone.utc),
            "details": {"mocked": True} if not getattr(settings, "RAZORPAY_ROUTE_ENABLED", False) else {}
        }

        if existing:
            updated = await self.payout_repo.update(owner_id, payout_dict)
            return PayoutAccountResponse.model_validate(updated)
        else:
            created = await self.payout_repo.create(payout_dict)
            return PayoutAccountResponse.model_validate(created)

    async def handle_kyc_webhook(self, razorpay_account_id: str, new_status: str) -> None:
        account = await self.payout_repo.get_by_razorpay_account_id(razorpay_account_id)
        if not account:
            return
        
        status_map = {
            "account.activated": "activated",
            "account.suspended": "suspended",
            "account.rejected": "rejected"
        }
        mapped_status = status_map.get(new_status, "pending")
        await self.payout_repo.update(account.owner_id, {"kyc_status": mapped_status})
