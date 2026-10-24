"""Challenge rewards: ordinary link-only offers, locked to the people who earned them.

Each reward is an OfferCampaign with a random code and allowed_user_ids, so
only those accounts can use it (PromotionService.resolve_campaign checks it).
Payments are untouched: a reward is just a price the normal checkout charges.

- prize_1/2/3: N hours for ₹1 at the challenge café, 1 seat, one use, 30 days.
- winner_partners: the champion's % off at the other live partner cafés,
  paid by KHELO (added back to that café by hand in its payout).
- waitlist: % off at the challenge café for everyone who was on the waitlist,
  one booking each, from the event day for a week.

Every use is a booking with promotion_id set, so tracking reads bookings.

Our own test and practice entries keep their place in the results but get no
reward; nobody moves up into their place. A reward replaced after a corrected
result is superseded (superseded_at), switched off and kept with its bookings;
only one not-superseded reward per challenge and kind exists (unique index).
Rewards are made under the challenge row lock, so two clicks make one.
"""
from __future__ import annotations

import secrets
from datetime import datetime, time, timedelta, timezone
from decimal import Decimal
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import IST
from app.models.booking import REDEEMED_STATUSES, Booking, BookingStatus
from app.models.cafe import Cafe, VerificationStatus
from app.models.cafe_payout_item import CafePayoutItem
from app.models.challenge import Challenge, ChallengeEntry
from app.models.platform_fee import PlatformFee
from app.models.promotion import OfferCampaign, Promotion, PromotionType
from app.models.user import User
from app.services import challenge_service as svc

DEFAULTS: dict[str, Any] = {
    "prizeHours": [2, 1.5, 1],
    "prizePrice": 1,
    "prizeDays": 30,
    "prizeKheloFunded": False,
    "winnerPercent": 10,
    "winnerDays": 30,
    "winnerKheloFunded": True,
    # Off for a test run: the partner cafés' owners would see the offer.
    "winnerPartnersOn": True,
    "waitlistPercent": 10,
    "waitlistDays": 7,
    "waitlistKheloFunded": True,
}
PLACES = {1: "1st", 2: "2nd", 3: "3rd"}
ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]
# No 0/O/1/I/L: easy to read out loud.
_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


def config(ch: Challenge) -> dict[str, Any]:
    return {**DEFAULTS, **(ch.rewards_config or {})}


async def _new_code(db: AsyncSession) -> str:
    while True:
        code = "R" + "".join(secrets.choice(_ALPHABET) for _ in range(9))
        taken = (await db.execute(select(OfferCampaign.id).where(OfferCampaign.access_code == code))).first()
        if taken is None:
            return code


async def campaigns_for(db: AsyncSession, challenge_id) -> list[OfferCampaign]:
    return list((await db.execute(
        select(OfferCampaign).where(OfferCampaign.challenge_id == challenge_id).order_by(OfferCampaign.reward_kind)
    )).scalars().all())


def current(campaigns: list[OfferCampaign]) -> list[OfferCampaign]:
    """The rewards still in force: not replaced after a corrected result."""
    return [c for c in campaigns if c.superseded_at is None]


async def test_places(db: AsyncSession, places: dict[int, Any]) -> list[int]:
    """Podium places held by our own test or practice entries (no reward for them)."""
    out = []
    for place, entry_id in sorted(places.items()):
        entry = await db.get(ChallengeEntry, entry_id)
        if entry is not None and entry.is_test:
            out.append(place)
    return out


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _day_start(d) -> datetime:
    return datetime.combine(d, time(0, 0), tzinfo=IST)


def _day_end(d) -> datetime:
    return datetime.combine(d, time(23, 59, 59), tzinfo=IST)


def _promo(cafe_id, campaign: OfferCampaign, title: str, **kw) -> Promotion:
    return Promotion(
        cafe_id=cafe_id, title=title, campaign_id=campaign.id, applicable_tier_id=None,
        valid_from=campaign.starts_at, valid_until=campaign.ends_at,
        days_of_week=ALL_DAYS, start_hour=0, end_hour=24, is_active=True, **kw,
    )


async def partner_cafes(db: AsyncSession, exclude_cafe_id) -> list[Cafe]:
    """Live partner cafés: verified, taking bookings, not a lead listing, not
    our own demo cafés (owned by an @example.com account)."""
    rows = (await db.execute(
        select(Cafe).join(User, User.id == Cafe.owner_id).where(
            Cafe.is_active.is_(True),
            Cafe.verification_status == VerificationStatus.VERIFIED,
            Cafe.is_lead_listing.is_(False),
            Cafe.bookings_paused.is_(False),
            Cafe.id != exclude_cafe_id,
            ~User.email.ilike("%@example.com"),
        ).order_by(Cafe.name)
    )).scalars().all()
    return list(rows)


class RewardError(Exception):
    def __init__(self, message: str, code: str):
        super().__init__(message)
        self.message = message
        self.code = code


async def create_prizes(db: AsyncSession, ch: Challenge, places: dict[int, Any]) -> list[str]:
    """Prizes for the decided places, plus the champion's partner-café offer.
    Already-made rewards are left alone, and test or practice entries get
    none. Returns the kinds made. (Finish does this itself, in its own
    transaction; this is the admin's "make them now" button.)"""
    if 1 not in places:
        raise RewardError("Finish the final first: the podium rewards need the final's result.", "NO_WINNER")
    ch = await svc.lock(db, ch.id)
    try:
        made = await _create_prizes(db, ch, places)
        await db.commit()
        return made
    except IntegrityError:
        # Another request made the same reward first (the unique index held).
        await db.rollback()
        return []


async def make_prize(
    db: AsyncSession, ch: Challenge, place: int, entry: ChallengeEntry, *,
    khelo_funded: Optional[bool] = None, replaces: Optional[OfferCampaign] = None, review_note: Optional[str] = None,
) -> OfferCampaign:
    """One place's reward for one account. No commit: the caller owns the transaction."""
    cfg = config(ch)
    hours = Decimal(str(cfg["prizeHours"][place - 1]))
    now = svc.now()
    camp = OfferCampaign(
        name=f"{ch.title}: {PLACES[place]} place reward", cafe_id=ch.cafe_id, is_public=False,
        access_code=await _new_code(db), max_uses=1, starts_at=now, ends_at=now + timedelta(days=int(cfg["prizeDays"])),
        is_active=True, allowed_user_ids=[str(entry.user_id)], max_uses_per_user=1, max_seats=1,
        khelo_funded=bool(cfg["prizeKheloFunded"]) if khelo_funded is None else khelo_funded,
        challenge_id=ch.id, reward_kind=f"prize_{place}",
        replaces_campaign_id=replaces.id if replaces is not None else None, financial_review_note=review_note,
    )
    db.add(camp)
    await db.flush()
    db.add(_promo(
        ch.cafe_id, camp, f"{PLACES[place]} place reward: {_hours(hours)} for ₹{cfg['prizePrice']}",
        description=f"{ch.title} reward. 1 seat, any setup.",
        promotion_type=PromotionType.FIXED_PRICE, fixed_price_amount=Decimal(str(cfg["prizePrice"])),
        min_duration_hours=hours, play_mode="solo", max_uses=1,
    ))
    return camp


async def make_partner_offer(
    db: AsyncSession, ch: Challenge, winner: ChallengeEntry, cafes: list[Cafe], *,
    khelo_funded: Optional[bool] = None, replaces: Optional[OfferCampaign] = None, review_note: Optional[str] = None,
) -> OfferCampaign:
    """The champion's % off at the other partner cafés. No commit."""
    cfg = config(ch)
    now = svc.now()
    camp = OfferCampaign(
        name=f"{ch.title}: champion's {cfg['winnerPercent']}% at partner cafés", cafe_id=None, is_public=False,
        access_code=await _new_code(db), max_uses=None, starts_at=now,
        ends_at=now + timedelta(days=int(cfg["winnerDays"])), is_active=True,
        allowed_user_ids=[str(winner.user_id)], max_uses_per_user=None, max_seats=1,
        khelo_funded=bool(cfg["winnerKheloFunded"]) if khelo_funded is None else khelo_funded,
        challenge_id=ch.id, reward_kind="winner_partners",
        replaces_campaign_id=replaces.id if replaces is not None else None, financial_review_note=review_note,
    )
    db.add(camp)
    await db.flush()
    for cafe in cafes:
        db.add(_promo(
            cafe.id, camp, f"Champion's {cfg['winnerPercent']}% off",
            description=f"{ch.title} champion. Paid by KHEL-O.",
            promotion_type=PromotionType.PERCENTAGE, discount_percentage=int(cfg["winnerPercent"]),
            play_mode="any", max_uses=None,
        ))
    return camp


async def _create_prizes(db: AsyncSession, ch: Challenge, places: dict[int, Any]) -> list[str]:
    """Missing podium rewards only. No commit."""
    cfg = config(ch)
    have = {c.reward_kind for c in current(await campaigns_for(db, ch.id))}
    made = []
    for place, entry_id in sorted(places.items()):
        kind = f"prize_{place}"
        if kind in have or place > len(cfg["prizeHours"]):
            continue
        entry = await db.get(ChallengeEntry, entry_id)
        if entry.is_test:
            continue
        await make_prize(db, ch, place, entry)
        made.append(kind)

    if "winner_partners" not in have and cfg["winnerPartnersOn"]:
        winner = await db.get(ChallengeEntry, places[1])
        cafes = await partner_cafes(db, ch.cafe_id) if not winner.is_test else []
        if cafes:
            await make_partner_offer(db, ch, winner, cafes)
            made.append("winner_partners")
    return made


def _hours(h: Decimal) -> str:
    n = float(h)
    return f"{int(n)} hr" + ("s" if n > 1 else "") if n == int(n) else f"{n:g} hrs"


def waitlist_user_ids(rows: list[ChallengeEntry]) -> list[str]:
    """Everyone who was on the waitlist: still waiting, or moved up (they keep
    it), except anyone moved up who then didn't show. Never test entries."""
    return [
        str(e.user_id) for e in rows
        if not e.is_test and (e.status == "waitlist" or (e.promoted_at is not None and e.status != "no_show"))
    ]


async def create_or_refresh_waitlist(db: AsyncSession, ch: Challenge) -> int:
    """Make the waitlist reward, or update who it's for. Returns how many people."""
    ch = await svc.lock(db, ch.id)
    try:
        return await _create_or_refresh_waitlist(db, ch)
    except IntegrityError:
        await db.rollback()
        existing = next((c for c in current(await campaigns_for(db, ch.id)) if c.reward_kind == "waitlist"), None)
        return len(existing.allowed_user_ids or []) if existing else 0


async def _create_or_refresh_waitlist(db: AsyncSession, ch: Challenge) -> int:
    users = waitlist_user_ids(await svc.entries(db, ch.id))
    existing = next((c for c in current(await campaigns_for(db, ch.id)) if c.reward_kind == "waitlist"), None)
    if existing is not None:
        existing.allowed_user_ids = users
        await db.commit()
        return len(users)
    if not users:
        await db.rollback()
        raise RewardError("Nobody was on the waitlist.", "NO_WAITLIST")
    await make_waitlist(db, ch, users)
    await db.commit()
    return len(users)


async def make_waitlist(db: AsyncSession, ch: Challenge, users: list[str]) -> OfferCampaign:
    """The waitlist thank-you for these accounts. No commit."""
    cfg = config(ch)
    event_day = ch.starts_at.astimezone(IST).date()
    camp = OfferCampaign(
        name=f"{ch.title}: waitlist {cfg['waitlistPercent']}% off", cafe_id=ch.cafe_id, is_public=False,
        access_code=await _new_code(db), max_uses=None, starts_at=_day_start(event_day),
        ends_at=_day_end(event_day + timedelta(days=int(cfg["waitlistDays"]))), is_active=True,
        allowed_user_ids=users, max_uses_per_user=1, max_seats=None,
        khelo_funded=bool(cfg["waitlistKheloFunded"]), challenge_id=ch.id, reward_kind="waitlist",
    )
    db.add(camp)
    await db.flush()
    db.add(_promo(
        ch.cafe_id, camp, f"Waitlist thank-you: {cfg['waitlistPercent']}% off",
        description=f"For everyone on the {ch.title} waitlist. One booking each.",
        promotion_type=PromotionType.PERCENTAGE, discount_percentage=int(cfg["waitlistPercent"]),
        play_mode="any", max_uses=None,
    ))
    return camp


# ── Reading them back ──────────────────────────────────────────────────────


async def _uses(db: AsyncSession, campaign_id) -> list[tuple[Booking, Cafe, User]]:
    return list((await db.execute(
        select(Booking, Cafe, User)
        .join(Promotion, Promotion.id == Booking.promotion_id)
        .join(Cafe, Cafe.id == Booking.cafe_id)
        .join(User, User.id == Booking.gamer_id)
        .where(Promotion.campaign_id == campaign_id)
        .order_by(Booking.created_at.desc())
    )).all())


def _paid(b: Booking) -> bool:
    return b.status in REDEEMED_STATUSES


KIND_LABEL = {
    "prize_1": "1st place reward", "prize_2": "2nd place reward", "prize_3": "3rd place reward",
    "winner_partners": "Champion's partner-café discount", "waitlist": "Waitlist thank-you",
}


async def funded_bookings(db: AsyncSession, challenge_id=None) -> list[dict]:
    """Every paid booking made with a KHEL-O-funded challenge reward, once each,
    current and replaced rewards alike. The ONE source for what KHEL-O may owe a
    café back: the Rewards tracker and Admin -> Payouts both read it.

    A booking has one promotion, a promotion one campaign, a fee row one booking
    and a payout item one fee row, so nothing here can repeat."""
    q = (
        select(Booking, Cafe, OfferCampaign, Challenge, PlatformFee.owner_settlement_amount, CafePayoutItem.id)
        .join(Promotion, Promotion.id == Booking.promotion_id)
        .join(OfferCampaign, OfferCampaign.id == Promotion.campaign_id)
        .join(Challenge, Challenge.id == OfferCampaign.challenge_id)
        .join(Cafe, Cafe.id == Booking.cafe_id)
        .outerjoin(PlatformFee, PlatformFee.booking_id == Booking.id)
        .outerjoin(CafePayoutItem, CafePayoutItem.platform_fee_id == PlatformFee.id)
        .where(OfferCampaign.khelo_funded.is_(True), Booking.status.in_(REDEEMED_STATUSES))
        .order_by(Cafe.name, Booking.session_date, Booking.created_at)
    )
    if challenge_id is not None:
        q = q.where(OfferCampaign.challenge_id == challenge_id)
    out = []
    for b, cafe, camp, ch, cafe_share, payout_item in (await db.execute(q)).all():
        out.append({
            "bookingId": str(b.id), "bookingReference": b.booking_reference,
            "sessionDate": b.session_date.isoformat(), "startTime": b.start_time.strftime("%H:%M"),
            "status": b.status.value if isinstance(b.status, BookingStatus) else str(b.status),
            "discount": round(float(b.discount_amount or 0), 2),
            "cafeId": str(cafe.id), "cafe": cafe.name,
            "campaignId": str(camp.id), "kind": camp.reward_kind, "label": KIND_LABEL.get(camp.reward_kind or "", camp.name),
            "superseded": camp.superseded_at is not None,
            "financialReviewNote": camp.financial_review_note,
            "challengeId": str(ch.id), "challenge": ch.title,
            # Whether the café's own share of this booking is in a recorded payout. It says
            # nothing about the discount KHEL-O funded: that is not recorded anywhere.
            "cafeShare": round(float(cafe_share), 2) if cafe_share is not None else None,
            "cafeShareInPayout": payout_item is not None,
        })
    return out


async def tracker(db: AsyncSession, ch: Challenge, entries_by_user: dict[str, ChallengeEntry]) -> list[dict]:
    """Every reward with every use, and what KHELO owes each café back."""
    out = []
    funded = await funded_bookings(db, ch.id)
    for camp in await campaigns_for(db, ch.id):
        uses = await _uses(db, camp.id)
        paid = [u for u in uses if _paid(u[0])]
        add_back: dict[str, float] = {}
        for row in funded:
            if row["campaignId"] == str(camp.id):
                add_back[row["cafe"]] = add_back.get(row["cafe"], 0) + row["discount"]
        people = [entries_by_user.get(uid) for uid in (camp.allowed_user_ids or [])]
        out.append({
            "id": str(camp.id),
            "kind": camp.reward_kind,
            "label": KIND_LABEL.get(camp.reward_kind or "", camp.name),
            "name": camp.name,
            "code": camp.access_code,
            "isActive": camp.is_active,
            # Replaced after a corrected result: kept, with its bookings, for the records.
            "superseded": camp.superseded_at is not None,
            # A replacement for a reward already redeemed: KHEL-O-funded, to be looked at with the books.
            "replacesRewardId": str(camp.replaces_campaign_id) if camp.replaces_campaign_id else None,
            "financialReviewNote": camp.financial_review_note,
            "startsAt": _aware(camp.starts_at).isoformat(),
            "endsAt": _aware(camp.ends_at).isoformat(),
            "kheloFunded": camp.khelo_funded,
            "forPeople": [svc.public_name(e) for e in people if e is not None],
            "peopleCount": len(camp.allowed_user_ids or []),
            "paidUses": len(paid),
            "unpaidOrCancelled": len(uses) - len(paid),
            "discountTotal": round(sum(float(b.discount_amount or 0) for b, _c, _u in paid), 2),
            "paidTotal": round(sum(float(b.total_amount or 0) for b, _c, _u in paid), 2),
            "addBack": [{"cafe": k, "amount": round(v, 2)} for k, v in sorted(add_back.items())],
            "uses": [{
                "bookingReference": b.booking_reference,
                "cafe": cafe.name,
                "player": entries_by_user[str(u.id)].name if str(u.id) in entries_by_user else (u.full_name or "Someone"),
                "sessionDate": b.session_date.isoformat(),
                "startTime": b.start_time.strftime("%H:%M"),
                "hours": float(b.duration_hours),
                "status": b.status.value if isinstance(b.status, BookingStatus) else str(b.status),
                "discount": float(b.discount_amount or 0),
                "paid": float(b.total_amount or 0),
                "createdAt": b.created_at.isoformat(),
            } for b, cafe, u in uses],
        })
    return out


async def mine(db: AsyncSession, ch: Challenge, user_id) -> list[dict]:
    """The rewards this person can use, with links that open the café with the
    code already applied. Only ever sent to that person."""
    out = []
    now = svc.now()
    for camp in await campaigns_for(db, ch.id):
        if str(user_id) not in (camp.allowed_user_ids or []) or not camp.is_active:
            continue
        uses = await _uses(db, camp.id)
        used = sum(1 for b, _c, u in uses if _paid(b) and str(u.id) == str(user_id))
        limit = camp.max_uses_per_user
        promos = (await db.execute(
            select(Promotion, Cafe).join(Cafe, Cafe.id == Promotion.cafe_id).where(Promotion.campaign_id == camp.id)
            .order_by(Cafe.name)
        )).all()
        first = promos[0][0] if promos else None
        out.append({
            "kind": camp.reward_kind,
            "label": KIND_LABEL.get(camp.reward_kind or "", camp.name),
            "title": first.title if first else camp.name,
            "detail": _detail(camp, first),
            "startsAt": _aware(camp.starts_at).isoformat(),
            "endsAt": _aware(camp.ends_at).isoformat(),
            "notStarted": now < _aware(camp.starts_at),
            "ended": now > _aware(camp.ends_at),
            "usedUp": limit is not None and used >= limit,
            "used": used,
            "cafes": [{"name": c.name, "href": f"/cafe/{c.slug}?promoCode={camp.access_code}"} for _p, c in promos],
        })
    return out


def _detail(camp: OfferCampaign, p: Optional[Promotion]) -> str:
    bits = []
    if camp.max_seats == 1:
        bits.append("1 seat")
    if p is not None and p.promotion_type == PromotionType.FIXED_PRICE:
        bits.append(f"book exactly {_hours(Decimal(str(p.min_duration_hours)))}")
        bits.append("any setup")
    if camp.max_uses_per_user == 1 or camp.max_uses == 1:
        bits.append("one booking")
    return ", ".join(bits).capitalize()
