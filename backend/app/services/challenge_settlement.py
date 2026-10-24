"""What Finish settles, in Finish's own transaction.

Nothing here commits. `challenge_day.finish` locks the challenge, validates
the bracket, calls `settle`, writes the status and commits once. Any error
rolls back every reward, badge and audit row with it, and pressing Finish
again simply starts over.

For each podium place (and the champion's partner-café offer):

- the right account already has the current reward  -> nothing changes;
- no reward yet                                    -> make it;
- the reward is for a different account (a corrected result)
    - nobody is using it  -> mark it replaced (kept, switched off), make the new one;
    - it was redeemed     -> the booking is never touched; the old reward is
      marked replaced and the replacement is KHEL-O-funded, linked to the old
      reward and flagged for financial review (Admin -> Payouts shows it);
    - a booking is waiting for payment on it -> Finish is refused with the
      exact time to retry (the hold clears itself 15 minutes after checkout).

Test or practice entries keep their place but get no reward and no badge, and
nobody moves up into it. The waitlist thank-you is made once, here.

Podium badges are rows in user_badges keyed `ch_<challenge hex>_<place>`,
inserted ON CONFLICT DO NOTHING, so granting twice is harmless; a corrected
result moves the badge to the right account (the removal is audited).

Locks follow checkout's order (promotions, then the campaign row) so a
booking and a Finish can never wait on each other.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from uuid import UUID, uuid4

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import IST
from app.models.admin_audit_log import AdminAuditLog
from app.models.booking import REDEEMED_STATUSES, Booking, BookingStatus
from app.models.challenge import Challenge, ChallengeEntry
from app.models.promotion import OfferCampaign, Promotion
from app.models.user import User
from app.models.user_badge import UserBadge
from app.services import challenge_rewards as rewards
from app.services import challenge_service as svc

# A checkout's payment window: after this the booking can't be paid for
# (a late capture is refunded automatically), so it no longer holds a reward.
HOLD = timedelta(minutes=15)
PLACES = (1, 2, 3)


class SettlementError(Exception):
    def __init__(self, message: str, code: str):
        super().__init__(message)
        self.message = message
        self.code = code


@dataclass
class Settlement:
    made: list[str] = field(default_factory=list)
    replaced: list[str] = field(default_factory=list)
    badges: int = 0
    badges_moved: int = 0
    review: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "made": self.made, "replaced": self.replaced, "badges": self.badges,
            "badgesMoved": self.badges_moved, "needsFinancialReview": self.review,
        }


def badge_key(challenge_id: UUID, place: int) -> str:
    return f"ch_{challenge_id.hex}_{place}"


def ist_moment(dt: datetime) -> str:
    """'Sun 25 Oct, 4:12 PM IST'."""
    d = (dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)).astimezone(IST)
    hour = d.hour % 12 or 12
    return f"{d.strftime('%a')} {d.day} {d.strftime('%b')}, {hour}:{d.minute:02d} {'AM' if d.hour < 12 else 'PM'} IST"


def audit(db: AsyncSession, admin: User, action: str, ch: Challenge, reason: str) -> None:
    db.add(AdminAuditLog(
        admin_id=admin.id, admin_email=admin.email, action=action, entity_type="challenge",
        entity_id=str(ch.id), entity_name=ch.title, reason=reason,
    ))


# ── Reading a reward's real state ──────────────────────────────────────────


async def holds_on(db: AsyncSession, campaign_id, now: datetime) -> list[Booking]:
    """Checkouts still inside their payment window: pending, not released, under 15 minutes old."""
    return list((await db.execute(
        select(Booking).join(Promotion, Promotion.id == Booking.promotion_id).where(
            Promotion.campaign_id == campaign_id,
            Booking.status == BookingStatus.PENDING_PAYMENT,
            Booking.released_at.is_(None),
            Booking.created_at > now - HOLD,
        ).order_by(Booking.created_at)
    )).scalars().all())


async def redeemed_on(db: AsyncSession, campaign_id) -> list[Booking]:
    return list((await db.execute(
        select(Booking).join(Promotion, Promotion.id == Booking.promotion_id).where(
            Promotion.campaign_id == campaign_id, Booking.status.in_(REDEEMED_STATUSES),
        ).order_by(Booking.created_at)
    )).scalars().all())


async def _lock_reward(db: AsyncSession, campaign_id) -> OfferCampaign:
    """Same order as checkout: the promotions, then the campaign. Fresh from the database."""
    await db.execute(select(Promotion.id).where(Promotion.campaign_id == campaign_id).order_by(Promotion.id).with_for_update())
    return (await db.execute(
        select(OfferCampaign).where(OfferCampaign.id == campaign_id).with_for_update().execution_options(populate_existing=True)
    )).scalar_one()


# ── Settlement ─────────────────────────────────────────────────────────────


async def settle(db: AsyncSession, ch: Challenge, places: dict[int, Any], admin: User) -> Settlement:
    """Rewards and badges for the standings. The caller holds the challenge lock and commits."""
    out = Settlement()
    cfg = rewards.config(ch)
    now = svc.now()
    entries: dict[int, ChallengeEntry] = {}
    for place, entry_id in places.items():
        entries[place] = await db.get(ChallengeEntry, entry_id)
    camps = {c.reward_kind: c for c in rewards.current(await rewards.campaigns_for(db, ch.id))}

    # 1. What each reward should be.
    plan: list[tuple[str, int, Optional[ChallengeEntry], Optional[OfferCampaign]]] = []
    for place in PLACES:
        if place <= len(cfg["prizeHours"]) and place in entries:
            plan.append((f"prize_{place}", place, entries[place], camps.get(f"prize_{place}")))
    if 1 in entries and (cfg["winnerPartnersOn"] or "winner_partners" in camps):
        plan.append(("winner_partners", 1, entries[1], camps.get("winner_partners")))

    def wanted(entry: Optional[ChallengeEntry]) -> Optional[str]:
        return str(entry.user_id) if entry is not None and not entry.is_test else None

    changes = [
        (kind, place, entry, old) for kind, place, entry, old in plan
        if old is not None and (old.allowed_user_ids or []) != ([wanted(entry)] if wanted(entry) else [])
    ]

    # 2. Lock the rewards that will be replaced, then look at what is really
    #    happening on them. A checkout in its payment window stops Finish.
    locked: dict[str, OfferCampaign] = {}
    redeemed: dict[str, list[Booking]] = {}
    blocking: list[tuple[str, Booking]] = []
    for kind, place, entry, old in changes:
        locked[kind] = await _lock_reward(db, old.id)
        for b in await holds_on(db, old.id, now):
            blocking.append((kind, b))
        redeemed[kind] = await redeemed_on(db, old.id)
    if blocking:
        kind = blocking[0][0]
        retry = max(_aware(b.created_at) for _k, b in blocking) + HOLD
        raise SettlementError(
            f"Someone is paying for the {rewards.KIND_LABEL.get(kind, kind).lower()} right now, so it can't be replaced yet. "
            f"Try Finish again after {ist_moment(retry)}. It clears sooner if that payment is completed or cancelled.",
            "REWARD_IN_USE",
        )

    # 3. Replace what changed (the old one is kept, switched off), then make what is missing.
    for kind, place, entry, old in changes:
        old = locked[kind]
        old.is_active = False
        old.superseded_at = now
        out.replaced.append(kind)
        used = redeemed[kind]
        audit(db, admin, "challenge.reward_replaced", ch, (
            f"{kind} (place {place}): reward for another account replaced after a corrected result; "
            f"entry now holding the place: {entry.id if entry else 'none'}"
            f"{' (test entry: no new reward)' if entry is not None and entry.is_test else ''}. "
            + (f"It had been redeemed on booking(s) {', '.join(b.booking_reference for b in used)} "
               f"(discount {sum(float(b.discount_amount or 0) for b in used):.2f}); those bookings are untouched." if used else "It had not been used.")
        ))
    await db.flush()
    for kind in locked:
        camps.pop(kind, None)  # replaced: no longer the current reward

    for kind, place, entry, _old in plan:
        if wanted(entry) is None or kind in camps:
            continue
        old = locked.get(kind)
        funded, note = None, None
        if old is not None and redeemed.get(kind):
            refs = ", ".join(b.booking_reference for b in redeemed[kind])
            funded = True
            note = (
                f"Replacement for the {rewards.KIND_LABEL.get(kind, kind)} that was already redeemed (booking {refs}) "
                f"by the account that held the place before a corrected result. KHEL-O-funded. "
                f"Check with the café how the first redemption is to be settled."
            )
            out.review.append(kind)
        if kind == "winner_partners":
            cafes = await rewards.partner_cafes(db, ch.cafe_id)
            if not cafes:
                continue
            new = await rewards.make_partner_offer(db, ch, entry, cafes, khelo_funded=funded, replaces=old, review_note=note)
        else:
            new = await rewards.make_prize(db, ch, place, entry, khelo_funded=funded, replaces=old, review_note=note)
        camps[kind] = new
        out.made.append(kind)
        audit(db, admin, "challenge.reward_made", ch, (
            f"{kind} made for entry {entry.id}" + (f", replacing a redeemed reward; KHEL-O-funded, flagged for financial review" if funded else "")
        ))

    # 4. The waitlist thank-you: once.
    if "waitlist" not in camps:
        users = rewards.waitlist_user_ids(await svc.entries(db, ch.id))
        if users:
            await rewards.make_waitlist(db, ch, users)
            out.made.append("waitlist")
            audit(db, admin, "challenge.reward_made", ch, f"waitlist thank-you made for {len(users)} account(s)")

    # 5. Podium badges.
    await _sync_badges(db, ch, entries, camps, admin, out)
    await db.flush()
    return out


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


async def _sync_badges(
    db: AsyncSession, ch: Challenge, entries: dict[int, ChallengeEntry], camps: dict[str, OfferCampaign],
    admin: User, out: Settlement,
) -> None:
    await db.flush()  # the session doesn't autoflush
    keys = {place: badge_key(ch.id, place) for place in PLACES}
    held = list((await db.execute(select(UserBadge).where(UserBadge.badge_key.in_(keys.values())))).scalars().all())
    insert = pg_insert if db.get_bind().dialect.name == "postgresql" else sqlite_insert
    for place in PLACES:
        entry = entries.get(place)
        want = entry.user_id if entry is not None and not entry.is_test else None
        for row in [r for r in held if r.badge_key == keys[place]]:
            if want is None or row.user_id != want:
                await db.execute(delete(UserBadge).where(UserBadge.id == row.id))
                out.badges_moved += 1
                audit(db, admin, "challenge.badge_removed", ch, f"place {place} badge removed from the account that no longer holds the place (entry now: {entry.id if entry else 'none'})")
        if want is None:
            continue
        reward = camps.get(f"prize_{place}")
        res = await db.execute(
            insert(UserBadge).values(
                id=uuid4(), user_id=want, badge_key=keys[place], campaign_id=reward.id if reward else None,
                granted_at=svc.now(),
            ).on_conflict_do_nothing(index_elements=["user_id", "badge_key"])
        )
        if res.rowcount:
            out.badges += 1
            audit(db, admin, "challenge.badge_granted", ch, f"place {place} badge granted to entry {entry.id}")
        elif reward is not None:
            await db.execute(
                UserBadge.__table__.update().where(
                    UserBadge.user_id == want, UserBadge.badge_key == keys[place], UserBadge.campaign_id.is_distinct_from(reward.id),
                ).values(campaign_id=reward.id)
            )
