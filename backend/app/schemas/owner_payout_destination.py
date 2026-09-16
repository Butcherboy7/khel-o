# backend/app/schemas/owner_payout_destination.py
from typing import Optional
from pydantic import BaseModel, ConfigDict


def to_camel(string: str) -> str:
    components = string.split('_')
    return components[0] + ''.join(x.title() for x in components[1:])


class OwnerPayoutDestinationUpdateRequest(BaseModel):
    current_password: str
    upi_vpa: Optional[str] = None
    bank_account_number: Optional[str] = None
    bank_ifsc: Optional[str] = None
    account_holder_name: Optional[str] = None
    bank_name: Optional[str] = None
    account_type: Optional[str] = None
    business_pan: Optional[str] = None

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
