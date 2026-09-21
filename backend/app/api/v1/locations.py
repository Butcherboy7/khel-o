from fastapi import APIRouter, Depends, Query
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
from pydantic import BaseModel, Field, ConfigDict, field_validator

from app.database import get_db
from app.api.deps import get_current_active_user
from app.models.user import User
from app.models.location import Location, normalize_location_name
from app.constants import validate_state


def to_camel(string: str) -> str:
    components = string.split('_')
    return components[0] + ''.join(x.title() for x in components[1:])


class LocationResponse(BaseModel):
    id: int
    name: str
    state: str
    district: Optional[str] = None
    pincode: Optional[str] = None

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


class LocationCreateRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    state: str = Field(..., min_length=2, max_length=100)
    district: Optional[str] = Field(None, max_length=100)
    pincode: Optional[str] = Field(None, max_length=10)

    @field_validator("name")
    @classmethod
    def _reject_garbage_name(cls, v: str) -> str:
        cleaned = " ".join(v.strip().split())
        # .replace(" ", "") before isdigit() so a spaced-out numeric string
        # like "123 456" doesn't slip past a bare cleaned.isdigit() check.
        if len(cleaned) < 2 or cleaned.replace(" ", "").isdigit():
            raise ValueError("Please enter a valid city/town name.")
        return cleaned

    @field_validator("state")
    @classmethod
    def _validate_state(cls, v: str) -> str:
        return validate_state(v)

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


router = APIRouter()


@router.get("/search", status_code=200)
async def search_locations(
    # q is now optional: an empty/omitted q with a state provided powers the
    # "popular cities" prefetch (frontend fires this on focus, before the
    # owner has typed anything) — it returns that state's rows ordered by
    # name rather than 422ing on a missing search term. A bare q with no
    # state, or neither, still falls through to the empty-results guard
    # below exactly as before.
    q: Optional[str] = Query(None, max_length=100),
    state: Optional[str] = Query(None),
    limit: int = Query(10, ge=1, le=25),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    term = normalize_location_name(q) if q else ""
    if not term and not state:
        return {"success": True, "data": []}
    stmt = select(Location)
    if term:
        stmt = stmt.where(func.lower(Location.name_norm).like(f"%{term}%"))
    if state:
        stmt = stmt.where(func.lower(Location.state) == state.strip().lower())
    stmt = stmt.order_by(
        func.lower(Location.name_norm).like(f"{term}%").desc() if term else Location.name,
        Location.name,
    ).limit(limit)
    res = await db.execute(stmt)
    results = [LocationResponse.model_validate(loc).model_dump(by_alias=True) for loc in res.scalars().all()]
    return {"success": True, "data": results}


@router.post("", status_code=200)
async def get_or_create_location(
    payload: LocationCreateRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    # payload.name is already whitespace-collapsed by the field_validator
    # above; name_norm additionally lowercases it for the dedup match.
    name_norm = normalize_location_name(payload.name)

    # payload.state is already canonicalized to one of the fixed 36
    # state/UT strings by validate_state (see the field_validator above), so
    # an exact match here is safe — no case-insensitive compare needed, and
    # no risk of two differently-cased rows for the same state.
    stmt = select(Location).where(
        Location.name_norm == name_norm,
        Location.state == payload.state,
    )
    res = await db.execute(stmt)
    existing = res.scalars().first()

    if not existing:
        location = Location(
            name=payload.name,
            name_norm=name_norm,
            state=payload.state,
            district=payload.district.strip() if payload.district else None,
            pincode=payload.pincode.strip() if payload.pincode else None,
        )
        db.add(location)
        try:
            await db.commit()
        except IntegrityError:
            # Lost a race with a concurrent create for the same (name_norm,
            # state) — the unique constraint caught it, so just re-select the
            # winner instead of surfacing a 500 for what is really a
            # get-or-create hit. Only IntegrityError is treated as "lost the
            # race" — any other failure propagates as a real error instead of
            # being silently reinterpreted as one.
            await db.rollback()
            res = await db.execute(stmt)
            existing = res.scalars().first()
            if not existing:
                raise
        else:
            await db.refresh(location)
            existing = location

    return {"success": True, "data": LocationResponse.model_validate(existing).model_dump(by_alias=True)}
