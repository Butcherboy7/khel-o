"""Tournaments: the player side (/tournaments) and the organiser console (/host).

Rules live in app/services/tournament_service.py; these handlers only parse,
authorise and shape responses.
"""
from datetime import datetime, timezone
from typing import Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_active_user, get_optional_user, require_admin
from app.core import tournament_games as games
from app.core.exceptions import BadRequestException, NotFoundException
from app.database import get_db
from app.models.hardware_tier import HardwareTier
from app.models.tournament import Organiser, OrganiserMember
from app.models.user import User
from app.services import tournament_service as ts

public_router = APIRouter(prefix="/tournaments", tags=["Tournaments"])
host_router = APIRouter(prefix="/host", tags=["Tournament Host"])


def to_camel(string: str) -> str:
    first, *rest = string.split("_")
    return first + "".join(word.capitalize() for word in rest)


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


def ok(data):
    return {"success": True, "data": data}


# ------------------------------------------------------------------ player

class RegisterRequest(CamelModel):
    gamer_tag: str = Field(..., max_length=40)
    phone: Optional[str] = Field(None, max_length=20)
    team_name: Optional[str] = Field(None, max_length=60)
    teammates: list[str] = Field(default_factory=list, max_length=4)


class VerifyRequest(CamelModel):
    entry_id: UUID
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


@public_router.get("")
async def list_tournaments(
    game: Optional[str] = None, city: Optional[str] = None, past: bool = False, db: AsyncSession = Depends(get_db),
):
    return ok(await ts.list_public(db, game=game, city=city, past=past))


@public_router.get("/games")
async def list_games():
    return ok({"games": games.public_list(), "houseRules": games.HOUSE_RULES})


@public_router.get("/capacity")
async def capacity(
    teams: int = Query(16, ge=2, le=256), stations: int = Query(4, ge=1, le=64),
    match_minutes: int = Query(15, alias="matchMinutes", ge=3, le=120), third_place: bool = Query(False, alias="thirdPlace"),
):
    return ok(ts.estimate(teams, stations, match_minutes, third_place))


@public_router.get("/leaderboard")
async def leaderboard(city: Optional[str] = None, db: AsyncSession = Depends(get_db)):
    return ok(await ts.leaderboard(db, city=city))


@public_router.get("/me/entries")
async def my_entries(user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    return ok(await ts.my_passes(db, user))


@public_router.get("/{slug}")
async def get_tournament(slug: str, user: Optional[User] = Depends(get_optional_user), db: AsyncSession = Depends(get_db)):
    t = await ts.get_public(db, slug)
    return ok(await ts.detail(db, t, user))


@public_router.post("/{slug}/register")
async def register(slug: str, body: RegisterRequest, user: User = Depends(get_current_active_user),
                   db: AsyncSession = Depends(get_db)):
    t = await ts.get_public(db, slug)
    return ok(await ts.register(db, user, t, body.gamer_tag, body.phone, body.team_name, body.teammates))


@public_router.post("/{slug}/verify-payment")
async def verify_payment(slug: str, body: VerifyRequest, user: User = Depends(get_current_active_user),
                         db: AsyncSession = Depends(get_db)):
    t = await ts.get_public(db, slug)
    return ok(await ts.verify_payment(db, user, t, body.entry_id, body.razorpay_order_id,
                                      body.razorpay_payment_id, body.razorpay_signature))


@public_router.post("/{slug}/cancel-entry")
async def cancel_entry(slug: str, user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    t = await ts.get_public(db, slug)
    await ts.cancel_entry(db, user, t)
    return ok({"cancelled": True})


@public_router.get("/{slug}/pass")
async def get_pass(slug: str, user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    t = await ts.get_public(db, slug)
    entry = await ts.my_entry(db, t, user)
    if not entry:
        raise NotFoundException(message="You aren't registered for this tournament", error_code="ENTRY_NOT_FOUND")
    return ok({"tournament": await ts.card(db, t), "entry": await ts._entry_payload(db, t, entry),
               "bracket": await ts.bracket(db, t)})


# ------------------------------------------------------------------ host

class Prize(CamelModel):
    place: str = Field(..., max_length=30)
    prize: str = Field(..., max_length=80)


class TournamentWrite(CamelModel):
    organiser_id: Optional[UUID] = None
    cafe_id: Optional[UUID] = None
    hardware_tier_id: Optional[UUID] = None
    title: Optional[str] = Field(None, max_length=120)
    game_key: Optional[str] = Field(None, max_length=30)
    game_name: Optional[str] = Field(None, max_length=60)
    team_size: Optional[int] = None
    third_place: Optional[bool] = None
    max_teams: Optional[int] = None
    entry_fee: Optional[float] = None
    starts_at: Optional[datetime] = None
    check_in_minutes: Optional[int] = Field(None, ge=10, le=120)
    registration_closes_at: Optional[datetime] = None
    match_minutes: Optional[int] = None
    stations: Optional[int] = None
    prizes: Optional[list[Prize]] = None
    sponsor_name: Optional[str] = Field(None, max_length=80)
    sponsor_logo_url: Optional[str] = Field(None, max_length=500)
    about: Optional[str] = Field(None, max_length=4000)
    rules: Optional[str] = Field(None, max_length=4000)

    def data(self) -> dict:
        d = self.model_dump(exclude_unset=True, exclude={"organiser_id"})
        if "prizes" in d and d["prizes"] is not None:
            d["prizes"] = [{"place": p["place"].strip(), "prize": p["prize"].strip()} for p in d["prizes"]
                           if p["place"].strip() and p["prize"].strip()]
        for k in ("starts_at", "registration_closes_at"):
            if d.get(k) is not None:
                d[k] = ts.aware(d[k]).astimezone(timezone.utc)  # SQLite keeps wall time only
        return d


class CheckInRequest(CamelModel):
    code: Optional[str] = Field(None, max_length=10)
    entry_id: Optional[UUID] = None
    undo: bool = False


class WalkInRequest(CamelModel):
    gamer_tag: str = Field(..., max_length=40)
    phone: Optional[str] = Field(None, max_length=20)
    team_name: Optional[str] = Field(None, max_length=60)
    paid_at_counter: bool = False


class BracketRequest(CamelModel):
    seeding: Literal["random", "check_in"] = "random"


class CallRequest(CamelModel):
    station: Optional[int] = None


class ScoreRequest(CamelModel):
    score_a: Optional[int] = Field(None, ge=0, le=999)
    score_b: Optional[int] = Field(None, ge=0, le=999)
    walkover_winner: Optional[Literal["a", "b"]] = None


class CancelRequest(CamelModel):
    reason: str = Field("", max_length=300)


def _org(o: Organiser) -> dict:
    return {"id": str(o.id), "kind": o.kind, "name": o.name, "slug": o.slug, "logoUrl": o.logo_url,
            "cafeId": str(o.cafe_id) if o.cafe_id else None}


@host_router.get("/me")
async def host_me(user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    orgs = await ts.my_organisers(db, user)
    out = []
    for o in orgs:
        venues = await ts.venues_for(db, user, o)
        out.append({**_org(o), "venues": [{"id": str(c.id), "name": c.name.strip(), "city": c.city} for c in venues]})
    return ok({"organisers": out, "isAdmin": await ts.is_admin(db, user)})


@host_router.get("/cafes/{cafe_id}/tiers")
async def host_tiers(cafe_id: UUID, user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    orgs = await ts.my_organisers(db, user)
    allowed = False
    for o in orgs:
        if any(c.id == cafe_id for c in await ts.venues_for(db, user, o)):
            allowed = True
            break
    if not allowed:
        raise NotFoundException(message="Café not found", error_code="CAFE_NOT_FOUND")
    tiers = (await db.execute(select(HardwareTier).where(HardwareTier.cafe_id == cafe_id, HardwareTier.is_active.is_(True))
                              .order_by(HardwareTier.name))).scalars().all()
    return ok([{"id": str(t.id), "name": t.name, "stations": t.app_bookable_seats or t.total_seats or 0,
                "platform": t.platform.value if t.platform else None} for t in tiers])


@host_router.get("/tournaments")
async def host_list(user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    return ok(await ts.host_list(db, user))


@host_router.post("/tournaments")
async def host_create(body: TournamentWrite, user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    if not body.organiser_id:
        raise BadRequestException(message="Pick who is organising", error_code="ORGANISER_REQUIRED")
    data = body.data()
    for k, label in (("cafe_id", "a café"), ("starts_at", "a start time"), ("title", "a name")):
        if not data.get(k):
            raise BadRequestException(message=f"Pick {label}", error_code="MISSING_FIELD")
    t = await ts.create(db, user, body.organiser_id, data)
    return ok(await ts.host_detail(db, user, t.id))


@host_router.get("/tournaments/{tournament_id}")
async def host_get(tournament_id: UUID, user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    return ok(await ts.host_detail(db, user, tournament_id))


@host_router.patch("/tournaments/{tournament_id}")
async def host_update(tournament_id: UUID, body: TournamentWrite, user: User = Depends(get_current_active_user),
                      db: AsyncSession = Depends(get_db)):
    await ts.update(db, user, tournament_id, body.data())
    return ok(await ts.host_detail(db, user, tournament_id))


@host_router.post("/tournaments/{tournament_id}/publish")
async def host_publish(tournament_id: UUID, user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    await ts.publish(db, user, tournament_id)
    return ok(await ts.host_detail(db, user, tournament_id))


@host_router.post("/tournaments/{tournament_id}/close-registration")
async def host_close(tournament_id: UUID, user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    await ts.close_registration(db, user, tournament_id)
    return ok(await ts.host_detail(db, user, tournament_id))


@host_router.post("/tournaments/{tournament_id}/cancel")
async def host_cancel(tournament_id: UUID, body: CancelRequest, user: User = Depends(get_current_active_user),
                      db: AsyncSession = Depends(get_db)):
    await ts.cancel(db, user, tournament_id, body.reason)
    return ok(await ts.host_detail(db, user, tournament_id))


@host_router.post("/tournaments/{tournament_id}/check-in")
async def host_check_in(tournament_id: UUID, body: CheckInRequest, user: User = Depends(get_current_active_user),
                        db: AsyncSession = Depends(get_db)):
    if not body.code and not body.entry_id:
        raise BadRequestException(message="Enter the player's code", error_code="CODE_REQUIRED")
    e = await ts.check_in(db, user, tournament_id, body.code, body.entry_id, body.undo)
    return ok({"entryId": str(e.id), "name": ts.display_name(e), "checkedIn": bool(e.checked_in_at)})


@host_router.post("/tournaments/{tournament_id}/walk-ins")
async def host_walk_in(tournament_id: UUID, body: WalkInRequest, user: User = Depends(get_current_active_user),
                       db: AsyncSession = Depends(get_db)):
    await ts.add_walk_in(db, user, tournament_id, body.gamer_tag, body.phone, body.team_name, body.paid_at_counter)
    return ok(await ts.host_detail(db, user, tournament_id))


@host_router.post("/tournaments/{tournament_id}/entries/{entry_id}/remove")
async def host_remove(tournament_id: UUID, entry_id: UUID, user: User = Depends(get_current_active_user),
                      db: AsyncSession = Depends(get_db)):
    await ts.remove_entry(db, user, tournament_id, entry_id)
    return ok(await ts.host_detail(db, user, tournament_id))


@host_router.post("/tournaments/{tournament_id}/bracket")
async def host_bracket(tournament_id: UUID, body: BracketRequest, user: User = Depends(get_current_active_user),
                       db: AsyncSession = Depends(get_db)):
    await ts.generate_bracket(db, user, tournament_id, body.seeding)
    return ok(await ts.host_detail(db, user, tournament_id))


@host_router.post("/tournaments/{tournament_id}/matches/{match_id}/call")
async def host_call(tournament_id: UUID, match_id: UUID, body: CallRequest, user: User = Depends(get_current_active_user),
                    db: AsyncSession = Depends(get_db)):
    await ts.call_match(db, user, tournament_id, match_id, body.station)
    return ok(await ts.host_detail(db, user, tournament_id))


@host_router.post("/tournaments/{tournament_id}/matches/{match_id}/score")
async def host_score(tournament_id: UUID, match_id: UUID, body: ScoreRequest, user: User = Depends(get_current_active_user),
                     db: AsyncSession = Depends(get_db)):
    await ts.report_score(db, user, tournament_id, match_id, body.score_a, body.score_b, body.walkover_winner)
    return ok(await ts.host_detail(db, user, tournament_id))


# ------------------------------------------------------------------ admin: organisers (companies, staff)

class OrganiserCreate(CamelModel):
    name: str = Field(..., min_length=2, max_length=120)
    kind: Literal["company", "khelo"] = "company"
    logo_url: Optional[str] = Field(None, max_length=500)
    member_email: Optional[str] = Field(None, max_length=255)


class MemberAdd(CamelModel):
    email: str = Field(..., max_length=255)
    role: Literal["owner", "staff"] = "staff"


async def _members(db: AsyncSession, organiser_id: UUID) -> list[dict]:
    rows = (await db.execute(select(OrganiserMember, User).join(User, User.id == OrganiserMember.user_id)
                             .where(OrganiserMember.organiser_id == organiser_id))).all()
    return [{"userId": str(u.id), "name": u.full_name, "email": u.email, "role": m.role} for m, u in rows]


@host_router.get("/organisers")
async def admin_organisers(user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    orgs = await ts.my_organisers(db, user)
    return ok([{**_org(o), "members": await _members(db, o.id)} for o in orgs])


async def _user_by_email(db: AsyncSession, email: str) -> User:
    u = (await db.execute(select(User).where(User.email == email.strip().lower()))).scalars().first()
    if not u:
        raise NotFoundException(message="No KHEL-O account with that email. Ask them to sign up first.",
                                error_code="USER_NOT_FOUND")
    return u


@host_router.post("/organisers")
async def admin_create_organiser(body: OrganiserCreate, user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    member = await _user_by_email(db, body.member_email) if body.member_email else None
    org = Organiser(kind=body.kind, name=body.name.strip(), logo_url=body.logo_url,
                    slug=await ts._unique_organiser_slug(db, body.name))
    db.add(org)
    await db.flush()
    if member:
        db.add(OrganiserMember(organiser_id=org.id, user_id=member.id, role="owner"))
    await db.commit()
    return ok({**_org(org), "members": await _members(db, org.id)})


@host_router.post("/organisers/{organiser_id}/members")
async def admin_add_member(organiser_id: UUID, body: MemberAdd, user: User = Depends(get_current_active_user),
                           db: AsyncSession = Depends(get_db)):
    await ts.require_manager(db, user, organiser_id)
    member = await _user_by_email(db, body.email)
    exists = (await db.execute(select(OrganiserMember).where(
        OrganiserMember.organiser_id == organiser_id, OrganiserMember.user_id == member.id))).scalars().first()
    if not exists:
        db.add(OrganiserMember(organiser_id=organiser_id, user_id=member.id, role=body.role))
        await db.commit()
    return ok(await _members(db, organiser_id))


@host_router.delete("/organisers/{organiser_id}/members/{user_id}")
async def admin_remove_member(organiser_id: UUID, user_id: UUID, user: User = Depends(get_current_active_user),
                              db: AsyncSession = Depends(get_db)):
    await ts.require_manager(db, user, organiser_id)
    if user_id == user.id:
        raise BadRequestException(message="You can't remove yourself", error_code="SELF_REMOVE")
    m = (await db.execute(select(OrganiserMember).where(
        OrganiserMember.organiser_id == organiser_id, OrganiserMember.user_id == user_id))).scalars().first()
    if m:
        await db.delete(m)
        await db.commit()
    return ok(await _members(db, organiser_id))
