from pydantic import BaseModel, Field, ConfigDict
from typing import Optional
from uuid import UUID
from datetime import datetime

def to_camel(string: str) -> str:
    components = string.split('_')
    return components[0] + ''.join(x.title() for x in components[1:])

class PayoutAccountCreateRequest(BaseModel):
    business_pan: str = Field(..., min_length=10, max_length=10)
    bank_account_number: str = Field(..., min_length=9, max_length=18)
    bank_ifsc: str = Field(..., min_length=11, max_length=11)
    account_holder_name: str = Field(..., min_length=3, max_length=100)

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True
    )

class PayoutAccountResponse(BaseModel):
    id: UUID
    owner_id: UUID
    razorpay_account_id: Optional[str] = None
    kyc_status: str
    business_pan: Optional[str] = None
    bank_account_number_masked: Optional[str] = None
    bank_ifsc: Optional[str] = None
    account_holder_name: Optional[str] = None
    submitted_at: Optional[datetime] = None

    model_config = ConfigDict(
        from_attributes=True,
        alias_generator=to_camel,
        populate_by_name=True
    )
