"""Phase 3: Finish settles rewards and podium badges in one transaction, Reopen
and corrections never touch what already happened, a replacement for a redeemed
reward is KHEL-O-funded and flagged, and Admin -> Payouts lists what KHEL-O may
owe each café back without counting anything twice.

SQLite has no row locks, so nothing here proves the simultaneous cases: Finish
against Finish, and Finish against a booking, run against dev PostgreSQL
(scratchpad p3_*.py)."""
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy import func, select

from app.database import AsyncSessionLocal
from app.models.admin_audit_log import AdminAuditLog
from app.models.booking import Booking, BookingStatus
from app.models.cafe_payout import CafePayout, CafePayoutStatus
from app.models.cafe_payout_item import CafePayoutItem
from app.models.challenge import Challenge, ChallengeEntry
from app.models.hardware_tier import HardwareTier
from app.models.platform_fee import PlatformFee
from app.models.promotion import OfferCampaign, Promotion
from app.models.user import User
from app.models.user_badge import UserBadge
from app.services import challenge_day as day
from app.services import challenge_settlement as settlement
from tests.conftest import auth_headers
from tests.test_challenge_day import _all_matches, _play_out
from tests.test_challenge_integrity import _field, _u


async def _setup(async_client, db_session, n=4, config=None):
    """n real, checked-in players. Partner-café offers are off (they depend on which
    other cafés happen to exist) unless a test turns them on."""
    ch, admin, players = await _field(async_client, db_session, n)
    h = auth_headers(admin, is_admin=True)
    base = {
        "prizeHours": [2, 1.5, 1], "prizePrice": 1, "prizeDays": 30, "prizeKheloFunded": False, "winnerPercent": 10,
        "winnerDays": 30, "winnerKheloFunded": True, "winnerPartnersOn": False, "waitlistPercent": 10, "waitlistDays": 7,
        "waitlistKheloFunded": True, **(config or {}),
    }
    assert (await async_client.patch(_u(ch, "/rewards-config"), json=base, headers=h)).status_code == 200
    return ch, admin, players, h


async def _finished(async_client, db_session, n=4, config=None):
    """A drawn, played-out, FINISHED challenge of n real players. The side a player always wins."""
    ch, admin, players, h = await _setup(async_client, db_session, n, config)
    b = (await async_client.post(_u(ch, "/draw"), headers=h)).json()["data"]
    b = await _play_out(async_client, ch, admin, b)
    fin = await async_client.post(_u(ch, "/finish"), headers=h)
    assert fin.status_code == 200, fin.text
    return ch, admin, h, fin.json()["data"]


def _places(b):
    return {s["place"]: s["entryId"] for s in b["standings"]}


async def _campaigns(ch_id, current_only=False):
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(select(OfferCampaign).where(OfferCampaign.challenge_id == uuid.UUID(ch_id)))).scalars().all()
    return [c for c in rows if not current_only or c.superseded_at is None]


async def _badges(ch_id):
    async with AsyncSessionLocal() as db:
        keys = [settlement.badge_key(uuid.UUID(ch_id), p) for p in (1, 2, 3)]
        rows = (await db.execute(select(UserBadge).where(UserBadge.badge_key.in_(keys)))).scalars().all()
    return {r.badge_key: r for r in rows}


async def _audit_actions(ch_id):
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(select(AdminAuditLog.action).where(AdminAuditLog.entity_id == ch_id))).scalars().all()
    return list(rows)


async def _user_of(entry_id):
    async with AsyncSessionLocal() as db:
        return (await db.get(ChallengeEntry, uuid.UUID(entry_id))).user_id


async def _booking(ch_id, camp, gamer_id, status, discount="100", created_ago=None, ref=None, paid="1", fee_to_cafe=None):
    """A booking made with a reward, inserted directly (checkout itself is not what is tested here)."""
    async with AsyncSessionLocal() as db:
        c = await db.get(Challenge, uuid.UUID(ch_id))
        tier = (await db.execute(select(HardwareTier).where(HardwareTier.cafe_id == c.cafe_id))).scalars().first()
        if tier is None:
            tier = HardwareTier(
                id=uuid.uuid4(), cafe_id=c.cafe_id, name="Std", specs={"gpu": "x"}, price_per_hour=100.0,
                total_seats=4, app_bookable_seats=4, active_seats_count=4, is_active=True,
            )
            db.add(tier)
            await db.flush()
        promo = (await db.execute(select(Promotion).where(Promotion.campaign_id == camp.id))).scalars().first()
        now = datetime.now(timezone.utc)
        b = Booking(
            id=uuid.uuid4(), booking_reference=ref or "GC-" + uuid.uuid4().hex[:8].upper(), gamer_id=gamer_id, cafe_id=c.cafe_id,
            hardware_tier_id=tier.id, seats_count=1, session_date=(now + timedelta(days=2)).date(),
            start_time=datetime(2026, 1, 1, 18, 0).time(), end_time=datetime(2026, 1, 1, 20, 0).time(), duration_hours=2,
            base_amount=Decimal(paid) + Decimal(discount), discount_amount=Decimal(discount), total_amount=Decimal(paid),
            status=status, promotion_id=promo.id, created_at=now - (created_ago or timedelta(0)),
            released_at=now if status == BookingStatus.RELEASED_BY_OWNER else None,
        )
        db.add(b)
        await db.flush()
        if fee_to_cafe is not None:
            db.add(PlatformFee(id=uuid.uuid4(), booking_id=b.id, owner_settlement_amount=Decimal(fee_to_cafe)))
        await db.commit()
        return b.id, b.booking_reference


async def _flip_final(async_client, ch, h, to="b"):
    """Reopen with a reason and correct the final so the other finalist wins."""
    res = await async_client.post(_u(ch, "/reopen"), json={"reason": "Final was entered the wrong way round"}, headers=h)
    assert res.status_code == 200, res.text
    b = res.json()["data"]
    final = b["rounds"][-1]["matches"][0]
    need = final["bestOf"] // 2 + 1
    scores = {"scoreA": need - 1, "scoreB": need} if to == "b" else {"scoreA": need, "scoreB": need - 1}
    res = await async_client.post(_u(ch, f"/matches/{final['id']}/result"), json={"winner": to, **scores}, headers=h)
    assert res.status_code == 200, res.text
    return res.json()["data"]


# ── Finish settles everything, once ────────────────────────────────────────


@pytest.mark.asyncio
async def test_finish_makes_rewards_badges_and_audit_rows_together(async_client, db_session):
    ch, admin, h, fin = await _finished(async_client, db_session)
    b = fin
    assert b["challenge"]["status"] == "finished"
    s = fin["settlement"]
    assert sorted(s["made"]) == ["prize_1", "prize_2", "prize_3"] and s["badges"] == 3 and s["replaced"] == []
    current = await _campaigns(ch["id"], current_only=True)
    assert sorted(c.reward_kind for c in current) == ["prize_1", "prize_2", "prize_3"]
    places = _places(b)
    badges = await _badges(ch["id"])
    assert len(badges) == 3
    for place in (1, 2, 3):
        row = badges[settlement.badge_key(uuid.UUID(ch["id"]), place)]
        assert row.user_id == await _user_of(places[place])
        # linked to that place's reward
        assert row.campaign_id == next(c.id for c in current if c.reward_kind == f"prize_{place}")
    actions = await _audit_actions(ch["id"])
    assert actions.count("challenge.finish") == 1 and actions.count("challenge.reward_made") == 3
    assert actions.count("challenge.badge_granted") == 3


@pytest.mark.asyncio
async def test_finish_twice_changes_nothing(async_client, db_session):
    ch, admin, h, fin = await _finished(async_client, db_session)
    before = sorted(c.id for c in await _campaigns(ch["id"]))
    again = await async_client.post(_u(ch, "/finish"), headers=h)
    assert again.status_code == 200 and again.json()["data"]["settlement"] is None
    assert sorted(c.id for c in await _campaigns(ch["id"])) == before
    assert len(await _badges(ch["id"])) == 3
    assert (await _audit_actions(ch["id"])).count("challenge.finish") == 1
    async with AsyncSessionLocal() as db:
        first_finished_at = (await db.get(Challenge, uuid.UUID(ch["id"]))).finished_at
    await async_client.post(_u(ch, "/finish"), headers=h)
    async with AsyncSessionLocal() as db:
        assert (await db.get(Challenge, uuid.UUID(ch["id"]))).finished_at == first_finished_at


@pytest.mark.asyncio
async def test_a_failure_halfway_leaves_nothing_behind_and_retry_works(async_client, db_session, monkeypatch):
    ch, admin, players, h = await _setup(async_client, db_session, 4)
    b = (await async_client.post(_u(ch, "/draw"), headers=h)).json()["data"]
    await _play_out(async_client, ch, admin, b)

    async def boom(*a, **kw):
        raise RuntimeError("badge store unavailable")

    monkeypatch.setattr(settlement, "_sync_badges", boom)
    async with AsyncSessionLocal() as db:
        admin_row = await db.get(User, admin.id)
        with pytest.raises(RuntimeError):
            await day.finish(db, uuid.UUID(ch["id"]), admin_row)
    async with AsyncSessionLocal() as db:
        row = await db.get(Challenge, uuid.UUID(ch["id"]))
        assert row.status == "live" and row.finished_at is None
    assert await _campaigns(ch["id"]) == []
    assert await _badges(ch["id"]) == {}
    assert "challenge.finish" not in await _audit_actions(ch["id"])

    monkeypatch.undo()
    res = await async_client.post(_u(ch, "/finish"), headers=h)
    assert res.status_code == 200 and res.json()["data"]["challenge"]["status"] == "finished"
    assert len(await _campaigns(ch["id"])) == 3 and len(await _badges(ch["id"])) == 3


@pytest.mark.asyncio
async def test_missing_rewards_are_fine_and_come_back_on_the_next_finish(async_client, db_session):
    # Only a first-place reward is configured: 2nd and 3rd still get their badge, just no reward.
    ch, admin, h, fin = await _finished(async_client, db_session, config={"prizeHours": [2]})
    assert fin["settlement"]["made"] == ["prize_1"] and fin["settlement"]["badges"] == 3
    badges = await _badges(ch["id"])
    assert badges[settlement.badge_key(uuid.UUID(ch["id"]), 2)].campaign_id is None
    # A reward that has gone missing is made again, and the badge points at it.
    async with AsyncSessionLocal() as db:
        camp = (await _campaigns(ch["id"]))[0]
        for p in (await db.execute(select(Promotion).where(Promotion.campaign_id == camp.id))).scalars().all():
            await db.delete(p)
        await db.delete(await db.get(OfferCampaign, camp.id))
        await db.commit()
    res = await async_client.post(_u(ch, "/reopen"), json={"reason": "Re-checking the rewards"}, headers=h)
    assert res.status_code == 200
    again = (await async_client.post(_u(ch, "/finish"), headers=h)).json()["data"]["settlement"]
    assert again["made"] == ["prize_1"] and again["badges"] == 0
    new = (await _campaigns(ch["id"]))[0]
    assert (await _badges(ch["id"]))[settlement.badge_key(uuid.UUID(ch["id"]), 1)].campaign_id in (new.id, None)


@pytest.mark.asyncio
async def test_a_test_champion_gets_no_reward_and_no_badge_and_nobody_moves_up(async_client, db_session):
    ch, admin, players, h = await _setup(async_client, db_session, 4)
    b = (await async_client.post(_u(ch, "/draw"), headers=h)).json()["data"]
    b = await _play_out(async_client, ch, admin, b)
    places = _places(b)
    assert (await async_client.post(_u(ch, f"/entries/{places[1]}/test"), headers=h)).status_code == 200
    fin = (await async_client.post(_u(ch, "/finish"), headers=h)).json()["data"]
    assert sorted(fin["settlement"]["made"]) == ["prize_2", "prize_3"] and fin["settlement"]["badges"] == 2
    assert {s["place"]: s["entryId"] for s in fin["standings"]} == places
    badges = await _badges(ch["id"])
    assert settlement.badge_key(uuid.UUID(ch["id"]), 1) not in badges
    assert badges[settlement.badge_key(uuid.UUID(ch["id"]), 2)].user_id == await _user_of(places[2])


@pytest.mark.asyncio
async def test_the_waitlist_reward_is_made_once_at_finish_without_no_shows(async_client, db_session):
    from tests.test_challenges import _join, _player
    ch, admin, players, h = await _setup(async_client, db_session, 4)
    waiter = await _player(db_session, "Waiter")
    assert (await _join(async_client, ch["slug"], waiter)).json()["data"]["entry"]["status"] == "waitlist"
    b = (await async_client.post(_u(ch, "/draw"), headers=h)).json()["data"]
    await _play_out(async_client, ch, admin, b)
    fin = (await async_client.post(_u(ch, "/finish"), headers=h)).json()["data"]
    assert "waitlist" in fin["settlement"]["made"]
    wl = next(c for c in await _campaigns(ch["id"]) if c.reward_kind == "waitlist")
    assert wl.allowed_user_ids == [str(waiter.id)]
    # Reopen and finish again: it is not made a second time.
    await async_client.post(_u(ch, "/reopen"), json={"reason": "Checking something"}, headers=h)
    again = (await async_client.post(_u(ch, "/finish"), headers=h)).json()["data"]["settlement"]
    assert "waitlist" not in again["made"]
    assert len([c for c in await _campaigns(ch["id"]) if c.reward_kind == "waitlist"]) == 1


# ── Badges ─────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_badges_are_idempotent_and_show_on_the_players_rewards_page(async_client, db_session):
    ch, admin, h, fin = await _finished(async_client, db_session)
    for _ in range(2):
        await async_client.post(_u(ch, "/reopen"), json={"reason": "Looking again"}, headers=h)
        res = await async_client.post(_u(ch, "/finish"), headers=h)
        assert res.json()["data"]["settlement"]["badges"] == 0
    assert len(await _badges(ch["id"])) == 3
    champion = await _user_of(_places(fin)[1])
    async with AsyncSessionLocal() as db:
        user = await db.get(User, champion)
    page = (await async_client.get("/api/v1/rewards", headers=auth_headers(user))).json()["data"]
    podium = [a for a in page["achievements"] if a["id"].startswith("ch_")]
    assert len(podium) == 1 and podium[0]["isUnlocked"] and podium[0]["xpReward"] == 0
    assert podium[0]["title"].startswith("Champion")


# ── Reopen ─────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_reopen_needs_a_reason_a_finished_challenge_and_changes_nothing_else(async_client, db_session):
    ch, admin, h, fin = await _finished(async_client, db_session)
    rewards_before = sorted((c.id, c.is_active, c.superseded_at) for c in await _campaigns(ch["id"]))
    res = await async_client.post(_u(ch, "/reopen"), json={"reason": " "}, headers=h)
    assert res.status_code == 422 and res.json()["error"]["code"] == "REASON_REQUIRED"
    res = await async_client.post(_u(ch, "/reopen"), json={"reason": "Wrong winner entered"}, headers=h)
    assert res.status_code == 200 and res.json()["data"]["challenge"]["status"] == "live"
    assert sorted((c.id, c.is_active, c.superseded_at) for c in await _campaigns(ch["id"])) == rewards_before
    assert len(await _badges(ch["id"])) == 3
    audit = (await _audit_actions(ch["id"]))
    assert audit.count("challenge.reopen") == 1
    # Not finished any more: reopening again is a no-op, not an error and not a second audit row.
    assert (await async_client.post(_u(ch, "/reopen"), json={"reason": "Again please"}, headers=h)).status_code == 200
    assert (await _audit_actions(ch["id"])).count("challenge.reopen") == 1
    async with AsyncSessionLocal() as db:
        assert (await db.get(Challenge, uuid.UUID(ch["id"]))).finished_at is None
    non_admin = await async_client.post(_u(ch, "/reopen"), json={"reason": "Just because"})
    assert non_admin.status_code in (401, 403)


# ── Corrected winners ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_corrected_winner_with_unused_rewards_replaces_them_and_moves_the_badges(async_client, db_session):
    ch, admin, h, fin = await _finished(async_client, db_session)
    old_places = _places(fin)
    old_by_kind = {c.reward_kind: c for c in await _campaigns(ch["id"])}
    corrected = await _flip_final(async_client, ch, h)
    new_places = _places(corrected)
    assert new_places[1] == old_places[2] and new_places[2] == old_places[1] and new_places[3] == old_places[3]

    done = (await async_client.post(_u(ch, "/finish"), headers=h)).json()["data"]["settlement"]
    assert sorted(done["replaced"]) == ["prize_1", "prize_2"] and sorted(done["made"]) == ["prize_1", "prize_2"]
    assert done["needsFinancialReview"] == []  # nothing had been used
    rows = await _campaigns(ch["id"])
    for kind in ("prize_1", "prize_2"):
        old = next(c for c in rows if c.id == old_by_kind[kind].id)
        new = next(c for c in rows if c.reward_kind == kind and c.superseded_at is None)
        assert old.superseded_at is not None and old.is_active is False and old.khelo_funded is False
        assert new.id != old.id and new.replaces_campaign_id == old.id
        assert new.khelo_funded is False and new.financial_review_note is None  # follows the setting: café-funded
    assert next(c for c in rows if c.id == old_by_kind["prize_3"].id).superseded_at is None  # 3rd place untouched
    # Badges followed the places.
    badges = await _badges(ch["id"])
    key = lambda p: settlement.badge_key(uuid.UUID(ch["id"]), p)  # noqa: E731
    assert badges[key(1)].user_id == await _user_of(new_places[1]) and badges[key(2)].user_id == await _user_of(new_places[2])
    assert len(badges) == 3
    actions = await _audit_actions(ch["id"])
    assert actions.count("challenge.reward_replaced") == 2 and actions.count("challenge.badge_removed") == 2
    # The tracker lists old and new, each once.
    data = (await async_client.get(_u(ch, "/rewards"), headers=h)).json()["data"]
    assert len(data["rewards"]) == 5 and len({r["id"] for r in data["rewards"]}) == 5


@pytest.mark.asyncio
async def test_a_redeemed_reward_is_honoured_and_its_replacement_is_khelo_funded_and_flagged(async_client, db_session):
    ch, admin, h, fin = await _finished(async_client, db_session)
    old_places = _places(fin)
    old_first = next(c for c in await _campaigns(ch["id"]) if c.reward_kind == "prize_1")
    first_user = await _user_of(old_places[1])
    booking_id, ref = await _booking(ch["id"], old_first, first_user, BookingStatus.CONFIRMED, discount="199", paid="1")
    async with AsyncSessionLocal() as db:
        before = (await db.get(Booking, booking_id))
        snapshot = (before.status, before.promotion_id, before.discount_amount, before.total_amount, before.gamer_id)

    await _flip_final(async_client, ch, h)
    done = (await async_client.post(_u(ch, "/finish"), headers=h)).json()["data"]["settlement"]
    assert done["needsFinancialReview"] == ["prize_1"]

    async with AsyncSessionLocal() as db:
        after = await db.get(Booking, booking_id)
        assert (after.status, after.promotion_id, after.discount_amount, after.total_amount, after.gamer_id) == snapshot
        old = await db.get(OfferCampaign, old_first.id)
        assert old.superseded_at is not None and old.is_active is False
    rows = await _campaigns(ch["id"])
    new_first = next(c for c in rows if c.reward_kind == "prize_1" and c.superseded_at is None)
    assert new_first.khelo_funded is True and new_first.replaces_campaign_id == old_first.id
    assert ref in new_first.financial_review_note and "KHEL-O-funded" in new_first.financial_review_note
    assert new_first.allowed_user_ids == [str(await _user_of(_places(await _bracket(async_client, ch, h))[1]))]
    # The 2nd-place swap had nothing redeemed: no flag, café-funded by setting.
    new_second = next(c for c in rows if c.reward_kind == "prize_2" and c.superseded_at is None)
    assert new_second.khelo_funded is False and new_second.financial_review_note is None
    audit = [r async for r in _audit_rows(ch["id"]) if r.action == "challenge.reward_replaced" and ref in (r.reason or "")]
    assert len(audit) == 1 and "untouched" in audit[0].reason
    # The Rewards page shows the history and the flag.
    data = (await async_client.get(_u(ch, "/rewards"), headers=h)).json()["data"]
    flagged = [r for r in data["rewards"] if r["financialReviewNote"]]
    assert len(flagged) == 1 and flagged[0]["kheloFunded"] and flagged[0]["replacesRewardId"] == str(old_first.id)
    old_row = next(r for r in data["rewards"] if r["id"] == str(old_first.id))
    assert old_row["superseded"] and old_row["paidUses"] == 1


def _mine(data, ch):
    """This challenge's rows of the (global) add-back list, and their total."""
    rows = [r for c in data["cafes"] for r in c["bookings"] if r["challengeId"] == ch["id"]]
    return rows, round(sum(r["discount"] for r in rows), 2)


async def _bracket(async_client, ch, h):
    return (await async_client.get(_u(ch, "/bracket"), headers=h)).json()["data"]


async def _audit_rows(ch_id):
    async with AsyncSessionLocal() as db:
        for r in (await db.execute(select(AdminAuditLog).where(AdminAuditLog.entity_id == ch_id))).scalars().all():
            yield r


@pytest.mark.asyncio
async def test_a_checkout_in_its_payment_window_stops_finish_with_the_exact_retry_time(async_client, db_session):
    ch, admin, h, fin = await _finished(async_client, db_session)
    old_first = next(c for c in await _campaigns(ch["id"]) if c.reward_kind == "prize_1")
    user = await _user_of(_places(fin)[1])
    _id, _ref = await _booking(ch["id"], old_first, user, BookingStatus.PENDING_PAYMENT, created_ago=timedelta(minutes=4))
    async with AsyncSessionLocal() as db:
        created = (await db.get(Booking, _id)).created_at
    await _flip_final(async_client, ch, h)

    res = await async_client.post(_u(ch, "/finish"), headers=h)
    assert res.status_code == 409 and res.json()["error"]["code"] == "REWARD_IN_USE"
    msg = res.json()["error"]["message"]
    assert settlement.ist_moment(created.replace(tzinfo=timezone.utc) + timedelta(minutes=15)) in msg and "IST" in msg
    # Nothing was changed: still live, the old rewards still in force, no new rewards, no badges moved.
    async with AsyncSessionLocal() as db:
        assert (await db.get(Challenge, uuid.UUID(ch["id"]))).status == "live"
    rows = await _campaigns(ch["id"])
    assert len(rows) == 3 and all(c.superseded_at is None and c.is_active for c in rows)
    assert (await _badges(ch["id"]))[settlement.badge_key(uuid.UUID(ch["id"]), 1)].user_id == user

    # The hold ends (released) -> Finish works straight away.
    async with AsyncSessionLocal() as db:
        b = await db.get(Booking, _id)
        b.status, b.released_at = BookingStatus.RELEASED_BY_OWNER, datetime.now(timezone.utc)
        await db.commit()
    res = await async_client.post(_u(ch, "/finish"), headers=h)
    assert res.status_code == 200 and sorted(res.json()["data"]["settlement"]["replaced"]) == ["prize_1", "prize_2"]
    # Released, never paid: not redeemed, so the replacement follows the usual setting.
    new_first = next(c for c in await _campaigns(ch["id"]) if c.reward_kind == "prize_1" and c.superseded_at is None)
    assert new_first.khelo_funded is False and new_first.financial_review_note is None


@pytest.mark.asyncio
async def test_an_old_pending_checkout_no_longer_holds_the_reward(async_client, db_session):
    ch, admin, h, fin = await _finished(async_client, db_session)
    old_first = next(c for c in await _campaigns(ch["id"]) if c.reward_kind == "prize_1")
    user = await _user_of(_places(fin)[1])
    await _booking(ch["id"], old_first, user, BookingStatus.PENDING_PAYMENT, created_ago=timedelta(minutes=16))
    await _flip_final(async_client, ch, h)
    assert (await async_client.post(_u(ch, "/finish"), headers=h)).status_code == 200


def test_the_hold_window_and_ist_wording():
    assert settlement.HOLD == timedelta(minutes=15)
    assert settlement.ist_moment(datetime(2026, 10, 25, 10, 42, tzinfo=timezone.utc)) == "Sun 25 Oct, 4:12 PM IST"
    assert settlement.ist_moment(datetime(2026, 11, 1, 18, 29, 59, tzinfo=timezone.utc)) == "Sun 1 Nov, 11:59 PM IST"
    assert settlement.ist_moment(datetime(2026, 11, 1, 18, 30, tzinfo=timezone.utc)) == "Mon 2 Nov, 12:00 AM IST"


# ── Payouts: KHEL-O-funded rewards to add back ─────────────────────────────


@pytest.mark.asyncio
async def test_add_back_lists_funded_paid_bookings_once_each_and_never_claims_payment(async_client, db_session):
    # Café-funded prizes (default) and a KHEL-O-funded 1st place.
    ch, admin, h, fin = await _finished(async_client, db_session, config={"prizeKheloFunded": True})
    rows = {c.reward_kind: c for c in await _campaigns(ch["id"])}
    places = _places(fin)
    u1, u2 = await _user_of(places[1]), await _user_of(places[2])
    b1, ref1 = await _booking(ch["id"], rows["prize_1"], u1, BookingStatus.COMPLETED, discount="199", paid="1", fee_to_cafe="1")
    b2, ref2 = await _booking(ch["id"], rows["prize_2"], u2, BookingStatus.CONFIRMED, discount="149", paid="1", fee_to_cafe="1")
    # Not paid for: pending, cancelled and failed bookings are not owed.
    await _booking(ch["id"], rows["prize_3"], await _user_of(places[3]), BookingStatus.CANCELLED, discount="99")
    # The café's own share of the first booking is in a recorded payout; that says nothing about the add-back.
    async with AsyncSessionLocal() as db:
        fee = (await db.execute(select(PlatformFee).where(PlatformFee.booking_id == b1))).scalar_one()
        c = await db.get(Challenge, uuid.UUID(ch["id"]))
        payout = CafePayout(id=uuid.uuid4(), cafe_id=c.cafe_id, amount=Decimal("1"), status=CafePayoutStatus.PAID, created_by_admin_id=admin.id)
        db.add(payout)
        await db.flush()
        db.add(CafePayoutItem(id=uuid.uuid4(), payout_id=payout.id, platform_fee_id=fee.id, booking_id=b1, amount_allocated=Decimal("1")))
        await db.commit()

    res = await async_client.get("/api/v1/admin/cafe-payouts/add-back", headers=h)
    assert res.status_code == 200, res.text
    data = res.json()["data"]
    assert data["recorded"] is False and "estimate" in data["label"].lower() and "doesn't record" in data["note"]
    mine, total = _mine(data, ch)
    assert len(mine) == 2 and total == 348.0
    assert data["bookingCount"] >= 2 and data["estimateTotal"] >= 348.0
    cafe = next(c for c in data["cafes"] if any(r["challengeId"] == ch["id"] for r in c["bookings"]))
    assert cafe["total"] == round(sum(r["discount"] for r in cafe["bookings"]), 2)
    by_ref = {r["bookingReference"]: r for r in mine}
    assert set(by_ref) == {ref1, ref2}
    assert by_ref[ref1]["cafeShareInPayout"] is True and by_ref[ref2]["cafeShareInPayout"] is False
    assert by_ref[ref1]["discount"] == 199.0 and by_ref[ref1]["label"] == "1st place reward"
    # Same number as the Rewards page, nothing counted twice.
    tracker = (await async_client.get(_u(ch, "/rewards"), headers=h)).json()["data"]["rewards"]
    assert round(sum(a["amount"] for r in tracker for a in r["addBack"]), 2) == total


@pytest.mark.asyncio
async def test_add_back_after_a_correction_counts_each_booking_once_and_flags_the_replacement(async_client, db_session):
    ch, admin, h, fin = await _finished(async_client, db_session)  # café-funded prizes
    places = _places(fin)
    old = {c.reward_kind: c for c in await _campaigns(ch["id"])}
    # 1st place redeemed their café-funded reward; then the result is corrected.
    await _booking(ch["id"], old["prize_1"], await _user_of(places[1]), BookingStatus.COMPLETED, discount="199")
    await _flip_final(async_client, ch, h)
    assert (await async_client.post(_u(ch, "/finish"), headers=h)).status_code == 200
    new_places = _places(await _bracket(async_client, ch, h))
    new_first = next(c for c in await _campaigns(ch["id"]) if c.reward_kind == "prize_1" and c.superseded_at is None)
    # The rightful champion now uses the KHEL-O-funded replacement.
    _bid, ref_new = await _booking(ch["id"], new_first, await _user_of(new_places[1]), BookingStatus.CONFIRMED, discount="179")

    data = (await async_client.get("/api/v1/admin/cafe-payouts/add-back", headers=h)).json()["data"]
    # Only the funded replacement is owed; the café-funded original (superseded, redeemed) is not.
    mine, total = _mine(data, ch)
    assert len(mine) == 1 and total == 179.0 and data["needsReviewCount"] >= 1
    row = mine[0]
    assert row["bookingReference"] == ref_new and row["financialReviewNote"] and row["superseded"] is False
    # A funded reward that is later replaced keeps its paid booking in the list, once.
    tracker = (await async_client.get(_u(ch, "/rewards"), headers=h)).json()["data"]["rewards"]
    assert round(sum(a["amount"] for r in tracker for a in r["addBack"]), 2) == 179.0
    # Flip back: the funded replacement is itself replaced, yet its booking is still counted exactly once.
    await _flip_final(async_client, ch, h, to="a")
    res = await async_client.post(_u(ch, "/finish"), headers=h)
    if res.status_code == 409:  # the funded replacement's booking is paid, not pending: Finish must go through
        pytest.fail(res.text)
    data = (await async_client.get("/api/v1/admin/cafe-payouts/add-back", headers=h)).json()["data"]
    mine, total = _mine(data, ch)
    refs = [r["bookingReference"] for r in mine]
    assert refs == [ref_new] and total == 179.0
    allrefs = [r["bookingReference"] for c in data["cafes"] for r in c["bookings"]]
    assert len(allrefs) == len(set(allrefs))
    superseded_row = mine[0]
    assert superseded_row["superseded"] is True


@pytest.mark.asyncio
async def test_add_back_is_admin_only(async_client, db_session):
    ch, admin, h, fin = await _finished(async_client, db_session)
    assert (await async_client.get("/api/v1/admin/cafe-payouts/add-back")).status_code in (401, 403)
    user = await db_session.get(User, await _user_of(_places(fin)[1]))
    assert (await async_client.get("/api/v1/admin/cafe-payouts/add-back", headers=auth_headers(user))).status_code in (401, 403)


@pytest.mark.asyncio
async def test_the_locked_reward_read_sees_what_finish_just_committed(async_client, db_session):
    """Checkout loads the reward for its early check, then re-reads it under the lock.
    If Finish replaced the reward in between, the re-read must see that, not the old copy."""
    from app.repositories.promotion_repository import PromotionRepository
    ch, admin, h, fin = await _finished(async_client, db_session)
    camp = next(c for c in await _campaigns(ch["id"]) if c.reward_kind == "prize_1")
    async with AsyncSessionLocal() as checkout:
        repo = PromotionRepository(checkout)
        early = await checkout.get(OfferCampaign, camp.id)  # the unlocked check's copy
        assert early.is_active is True and early.superseded_at is None
        async with AsyncSessionLocal() as other:  # Finish replaces it and commits
            row = await other.get(OfferCampaign, camp.id)
            row.is_active, row.superseded_at = False, datetime.now(timezone.utc)
            await other.commit()
        locked = await repo.get_campaign_with_lock(camp.id)
        assert locked.is_active is False and locked.superseded_at is not None
