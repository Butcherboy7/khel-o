from pydantic import BaseModel, ConfigDict
from typing import List, Dict, Any


def to_camel(string: str) -> str:
    components = string.split('_')
    return components[0] + ''.join(x.title() for x in components[1:])


class ExecutiveDashboardResponse(BaseModel):
    total_users: int
    total_cafes: int
    active_cafes: int
    new_users_this_period: int
    new_cafes_this_period: int
    bookings_this_period: int
    gmv: float
    khel_revenue: float
    avg_booking_value: float
    cancellation_rate: float
    repeat_booking_rate: float
    period_days: int

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True
    )
