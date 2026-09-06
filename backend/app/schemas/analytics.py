import json
from enum import Enum
from typing import Any, Optional
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, field_validator


def to_camel(string: str) -> str:
    components = string.split('_')
    return components[0] + ''.join(x.title() for x in components[1:])


class AnalyticsEventType(str, Enum):
    SEARCH_PERFORMED = "search_performed"
    VENUE_VIEWED = "venue_viewed"
    BOOKING_FLOW_STARTED = "booking_flow_started"


MAX_METADATA_BYTES = 2048


class AnalyticsEventCreateRequest(BaseModel):
    session_id: str = Field(..., min_length=1, max_length=64)
    event_type: AnalyticsEventType
    cafe_id: Optional[UUID] = None
    metadata: dict[str, Any] = Field(default_factory=dict)

    @field_validator("metadata")
    @classmethod
    def cap_metadata_size(cls, v: dict[str, Any]) -> dict[str, Any]:
        if len(json.dumps(v)) > MAX_METADATA_BYTES:
            raise ValueError(f"metadata exceeds {MAX_METADATA_BYTES} bytes")
        return v

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True
    )
