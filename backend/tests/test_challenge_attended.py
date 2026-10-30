"""The checked-in thank-you (20% off at the host café, one booking, a week) and the
weekly café statement. The reward applies on its own to whoever was checked in, never
to anyone else, only once, and only at the café that hosted the challenge."""
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.booking import Booking, BookingStatus
from app.models.challenge import Challenge
from app.models.hardware_tier import HardwareTier
from app.models.platform_fee import PlatformFee
from app.models.promotion import OfferCampaign, Promotion
from app.models.cafe import Cafe
from app.services import cafe_statement
from tests.conftest import auth_headers
from tests.test_challenge_integrity import _field, _u
from tests.test_challenges import _player
from tests.test_offer_campaigns import _body

CONFIG = {
    "prizeHours": [2, 1.5, 1], "prizePrice": 1, "prizeDays": 30, "prizeKheloFunded": False, "winnerPercent": 10,
    "winnerDays": 30, "winnerKheloFunded": True, "winnerPartnersOn": False, "waitlistPercent": 10, "waitlistDays": 7,
    "waitlistKheloFunded": True, "attendedOn": True, "attendedPercent": 20, "attendedDays": 7, "attendedKheloFunded": False,
}


async def _start(async_client, db_session, n=2):
    ch, admin, players = await _field(async_client, db_session, n)
    h = auth_headers(admin, is_admin=True)
    res = await async_client.patch(_u(ch, "/rewards-config"), json=CONFIG, headers=h)
    assert res.status_code == 200, res.text
    async with AsyncSessionLocal() as db:
        row = await db.get(Challenge, uuid.UUID(ch["id"]))
        cafe = await db.get(Cafe, row.cafe_id)
        camp = (await db.execute(select(OfferCampaign).where(
            OfferCampaign.challenge_id == row.id, OfferCampaign.reward_kind == "attended"))).scalar_one()
        # The event is on a fixed date; open the window now so the quote can be asked today.
        camp.starts_at = datetime.now(timezone.utc) - timedelta(days=1)
        camp.ends_at = datetime.now(timezone.utc) + timedelta(days=6)
        for promo in (await db.execute(select(Promotion).where(Promotion.campaign_id == camp.id))).scalars().all():
            promo.valid_from, promo.valid_until = camp.starts_at, camp.ends_at
        tier = HardwareTier(
            id=uuid.uuid4(), cafe_id=cafe.id, name="PS5", specs={"gpu": "x"}, price_per_hour=200.0,
            total_seats=4, app_bookable_seats=4, active_seats_count=4, is_active=True,
        )
        db.add(tier)
        await db.commit()
        await db.refresh(cafe)
        await db.refresh(tier)
    return ch, admin, h, players, cafe, tier


async def _quote(async_client, cafe, tier, user=None):
    headers = auth_headers(user) if user is not None else None
    return (await async_client.post("/api/v1/bookings/quote", json=_body(cafe, tier), headers=headers)).json()["data"]


@pytest.mark.asyncio
async def test_turning_it_on_makes_one_campaign_and_it_is_off_by_default(async_client, db_session):
    ch, admin, players = await _field(async_client, db_session, 2)
    h = auth_headers(admin, is_admin=True)
    off = {**CONFIG, "attendedOn": False}
    assert (await async_client.patch(_u(ch, "/rewards-config"), json=off, headers=h)).status_code == 200
    async with AsyncSessionLocal() as db:
        assert (await db.execute(select(OfferCampaign).where(OfferCampaign.challenge_id == uuid.UUID(ch["id"])))).first() is None
    for _ in range(2):
        assert (await async_client.patch(_u(ch, "/rewards-config"), json=CONFIG, headers=h)).status_code == 200
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(select(OfferCampaign).where(OfferCampaign.challenge_id == uuid.UUID(ch["id"])))).scalars().all()
    assert len(rows) == 1 and rows[0].reward_kind == "attended" and rows[0].khelo_funded is False
    assert rows[0].allowed_user_ids is None


@pytest.mark.asyncio
async def test_a_checked_in_player_gets_twenty_percent_on_their_own_and_a_stranger_does_not(async_client, db_session):
    ch, admin, h, players, cafe, tier = await _start(async_client, db_session)
    quote = await _quote(async_client, cafe, tier, players[0])
    assert quote["discountAmount"] == pytest.approx(40.0)  # 20% of one hour at Rs 200
    assert "20" in str(quote["appliedOffer"])

    stranger = await _player(db_session, "Stranger")
    assert (await _quote(async_client, cafe, tier, stranger))["discountAmount"] == 0
    assert (await _quote(async_client, cafe, tier))["discountAmount"] == 0


@pytest.mark.asyncio
async def test_someone_signed_up_but_not_checked_in_gets_nothing_until_they_are(async_client, db_session):
    ch, admin, h, players, cafe, tier = await _start(async_client, db_session, n=1)
    late = await _player(db_session, "Late")
    from tests.test_challenges import _join
    assert (await _join(async_client, ch["slug"], late)).status_code == 201
    assert (await _quote(async_client, cafe, tier, late))["discountAmount"] == 0
    detail = (await async_client.get(f"/api/v1/admin/challenges/{ch['id']}", headers=h)).json()["data"]
    mine = next(e for e in detail["entries"] if not e["present"])
    assert (await async_client.post(_u(ch, f"/entries/{mine['id']}/checkin"), headers=h)).status_code == 200
    assert (await _quote(async_client, cafe, tier, late))["discountAmount"] == pytest.approx(40.0)


@pytest.mark.asyncio
async def test_it_is_used_once_and_then_gone(async_client, db_session):
    ch, admin, h, players, cafe, tier = await _start(async_client, db_session)
    res = await async_client.post("/api/v1/bookings", json=_body(cafe, tier), headers=auth_headers(players[0]))
    assert res.status_code == 201, res.text
    assert float(res.json()["data"]["booking"]["discountAmount"]) == pytest.approx(40.0)
    # The booking is not paid yet, but the reward is already spoken for: pay it, then it is used up.
    async with AsyncSessionLocal() as db:
        b = (await db.execute(select(Booking).where(Booking.gamer_id == players[0].id))).scalars().first()
        b.status = BookingStatus.CONFIRMED
        await db.commit()
    assert (await _quote(async_client, cafe, tier, players[0]))["discountAmount"] == 0
    # The other checked-in player still has theirs.
    assert (await _quote(async_client, cafe, tier, players[1]))["discountAmount"] == pytest.approx(40.0)


@pytest.mark.asyncio
async def test_it_only_works_at_the_host_cafe_and_inside_the_week(async_client, db_session):
    ch, admin, h, players, cafe, tier = await _start(async_client, db_session)
    async with AsyncSessionLocal() as db:
        other_cafe = (await db.execute(select(Cafe).where(Cafe.id != cafe.id))).scalars().first()
    if other_cafe is not None:
        other_tier = HardwareTier(
            id=uuid.uuid4(), cafe_id=other_cafe.id, name="PC", specs={"gpu": "x"}, price_per_hour=200.0,
            total_seats=4, app_bookable_seats=4, active_seats_count=4, is_active=True,
        )
        async with AsyncSessionLocal() as db:
            db.add(other_tier)
            await db.commit()
        assert (await _quote(async_client, other_cafe, other_tier, players[0]))["discountAmount"] == 0
    async with AsyncSessionLocal() as db:
        camp = (await db.execute(select(OfferCampaign).where(OfferCampaign.reward_kind == "attended", OfferCampaign.challenge_id == uuid.UUID(ch["id"])))).scalar_one()
        camp.ends_at = datetime.now(timezone.utc) - timedelta(hours=1)
        for promo in (await db.execute(select(Promotion).where(Promotion.campaign_id == camp.id))).scalars().all():
            promo.valid_until = camp.ends_at
        await db.commit()
    assert (await _quote(async_client, cafe, tier, players[0]))["discountAmount"] == 0


@pytest.mark.asyncio
async def test_it_shows_in_the_rewards_tracker_and_on_the_players_page(async_client, db_session):
    ch, admin, h, players, cafe, tier = await _start(async_client, db_session)
    res = await async_client.post("/api/v1/bookings", json=_body(cafe, tier), headers=auth_headers(players[0]))
    assert res.status_code == 201
    async with AsyncSessionLocal() as db:
        b = (await db.execute(select(Booking).where(Booking.gamer_id == players[0].id))).scalars().first()
        b.status = BookingStatus.CONFIRMED
        await db.commit()
    data = (await async_client.get(_u(ch, "/rewards"), headers=h)).json()["data"]
    assert data["checkedInPeople"] == 2
    row = next(r for r in data["rewards"] if r["kind"] == "attended")
    assert row["peopleCount"] == 2 and row["paidUses"] == 1 and row["discountTotal"] == pytest.approx(40.0)
    assert row["kheloFunded"] is False and row["addBack"] == []
    mine = (await async_client.get(f"/api/v1/challenges/{ch['slug']}/me", headers=auth_headers(players[1]))).json()["data"]
    assert any(r["kind"] == "attended" for r in mine["rewards"])


# ── The weekly statement ───────────────────────────────────────────────────


async def _paid_booking(cafe, tier, gamer, day, ref, base, discount, earnings, camp=None):
    async with AsyncSessionLocal() as db:
        promo_id = None
        if camp is not None:
            promo_id = (await db.execute(select(Promotion.id).where(Promotion.campaign_id == camp.id))).scalars().first()
        b = Booking(
            id=uuid.uuid4(), booking_reference=ref, gamer_id=gamer.id, cafe_id=cafe.id, hardware_tier_id=tier.id,
            seats_count=1, session_date=day, start_time=datetime(2026, 1, 1, 18, 0).time(),
            end_time=datetime(2026, 1, 1, 19, 0).time(), duration_hours=1, base_amount=Decimal(base),
            discount_amount=Decimal(discount), total_amount=Decimal(earnings), status=BookingStatus.COMPLETED, promotion_id=promo_id,
        )
        db.add(b)
        await db.flush()
        db.add(PlatformFee(id=uuid.uuid4(), booking_id=b.id, owner_settlement_amount=Decimal(earnings)))
        await db.commit()


@pytest.mark.asyncio
async def test_the_statement_splits_discounts_and_totals_what_the_cafe_is_due(async_client, db_session):
    ch, admin, h, players, cafe, tier = await _start(async_client, db_session)
    monday = cafe_statement.week_monday(date.today()) - timedelta(days=7)
    async with AsyncSessionLocal() as db:
        camp = (await db.execute(select(OfferCampaign).where(OfferCampaign.reward_kind == "attended", OfferCampaign.challenge_id == uuid.UUID(ch["id"])))).scalar_one()
    await _paid_booking(cafe, tier, players[0], monday + timedelta(days=1), "ST-0001", "200", "40", "160", camp)   # challenge, café-funded
    await _paid_booking(cafe, tier, players[1], monday + timedelta(days=2), "ST-0002", "300", "0", "300")          # plain
    await _paid_booking(cafe, tier, players[1], monday + timedelta(days=9), "ST-0003", "300", "0", "300")          # next week: not in it

    res = await async_client.get(f"/api/v1/admin/cafe-payouts/{cafe.id}/statement?weekStart={monday.isoformat()}", headers=h)
    assert res.status_code == 200, res.text
    t = res.json()["data"]["totals"]
    assert t["bookings"] == 2 and t["value"] == 500 and t["challengeDiscounts"] == 40 and t["offerDiscounts"] == 0
    assert t["earnings"] == 460 and t["addedBack"] == 0 and t["totalDue"] == 460
    assert res.json()["data"]["number"].startswith("KHELO/") and "/WK" in res.json()["data"]["number"]


@pytest.mark.asyncio
async def test_the_statement_pdf_and_zip_download(async_client, db_session):
    ch, admin, h, players, cafe, tier = await _start(async_client, db_session)
    monday = cafe_statement.week_monday(date.today()) - timedelta(days=7)
    await _paid_booking(cafe, tier, players[0], monday + timedelta(days=1), "ST-0101", "200", "0", "200")
    pdf = await async_client.get(f"/api/v1/admin/cafe-payouts/{cafe.id}/statement.pdf?weekStart={monday.isoformat()}", headers=h)
    assert pdf.status_code == 200 and pdf.headers["content-type"] == "application/pdf" and pdf.content.startswith(b"%PDF")
    assert "KHELO-" in pdf.headers["content-disposition"]
    # No bookings at all still gives a valid, honest statement.
    empty = await async_client.get(f"/api/v1/admin/cafe-payouts/{cafe.id}/statement.pdf?weekStart=2020-01-06", headers=h)
    assert empty.status_code == 200 and empty.content.startswith(b"%PDF")
    zipped = await async_client.get(f"/api/v1/admin/cafe-payouts/statements.zip?weekStart={monday.isoformat()}", headers=h)
    assert zipped.status_code == 200 and zipped.content.startswith(b"PK")
    # Not for players.
    assert (await async_client.get(f"/api/v1/admin/cafe-payouts/{cafe.id}/statement.pdf", headers=auth_headers(players[0]))).status_code in (401, 403)


def test_amounts_in_words_and_indian_grouping():
    assert cafe_statement.in_words(Decimal("1250")) == "Rupees One Thousand Two Hundred Fifty Only"
    assert cafe_statement.in_words(Decimal("100000.50")) == "Rupees One Lakh and Fifty Paise Only"
    assert cafe_statement.in_words(0) == "Rupees Zero Only"
    assert cafe_statement.inr(Decimal("1234567.5")) == "Rs 12,34,567.50"
    assert cafe_statement.inr(Decimal("-40")) == "-Rs 40.00"
    assert cafe_statement.financial_year(date(2026, 11, 2)) == "2026-27"
    assert cafe_statement.financial_year(date(2027, 2, 1)) == "2026-27"


@pytest.mark.asyncio
async def test_the_statement_shows_what_was_paid_and_what_is_left(async_client, db_session):
    from app.models.cafe_payout import CafePayout, CafePayoutStatus
    from app.models.cafe_payout_item import CafePayoutItem
    ch, admin, h, players, cafe, tier = await _start(async_client, db_session)
    monday = cafe_statement.week_monday(date.today()) - timedelta(days=7)
    await _paid_booking(cafe, tier, players[0], monday + timedelta(days=1), "PD-0001", "400", "0", "400")
    await _paid_booking(cafe, tier, players[1], monday + timedelta(days=2), "PD-0002", "300", "0", "300")
    async with AsyncSessionLocal() as db:
        fee = (await db.execute(select(PlatformFee).join(Booking, Booking.id == PlatformFee.booking_id).where(Booking.booking_reference == "PD-0001"))).scalar_one()
        payout = CafePayout(
            id=uuid.uuid4(), cafe_id=cafe.id, amount=Decimal("400"), utr_reference="UTR123456", status=CafePayoutStatus.PAID,
            created_by_admin_id=admin.id, paid_at=datetime.now(timezone.utc),
        )
        db.add(payout)
        await db.flush()
        db.add(CafePayoutItem(id=uuid.uuid4(), payout_id=payout.id, platform_fee_id=fee.id, booking_id=fee.booking_id, amount_allocated=Decimal("400")))
        await db.commit()
    data = (await async_client.get(f"/api/v1/admin/cafe-payouts/{cafe.id}/statement?weekStart={monday.isoformat()}", headers=h)).json()["data"]
    assert data["totals"]["totalDue"] == 700 and data["totals"]["paidOut"] == 400 and data["totals"]["balance"] == 300
    by = {l["reference"]: l for l in data["lines"]}
    assert by["PD-0001"]["payment"] == "paid" and by["PD-0001"]["utr"] == "UTR123456"
    assert by["PD-0002"]["payment"] == "pending" and by["PD-0002"]["utr"] == ""
    pdf = await async_client.get(f"/api/v1/admin/cafe-payouts/{cafe.id}/statement.pdf?weekStart={monday.isoformat()}", headers=h)
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")
