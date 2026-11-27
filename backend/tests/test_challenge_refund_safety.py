"""Payment safety: a failed automatic refund is parked as refund_due (never left looking
paid), an admin is alerted without personal details, replays never refund twice, and an
admin settles it by entering the real Razorpay refund id. Razorpay is mocked throughout."""
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select, update

from app.config import settings
from app.models.admin_audit_log import AdminAuditLog
from app.models.challenge import ChallengePayment
from app.services import challenge_teams as teams
from tests.conftest import auth_headers
from tests.test_challenges import _player
# _mock_payments is the offline-payments fixture of the other file; importing it applies it here too.
from tests.test_challenge_teams import _entry, _mock_payments, _pay, _team_challenge, _verify  # noqa: F401


class _Refunds:
    """A fake Razorpay refund call: fails or succeeds on demand and counts every attempt."""

    def __init__(self):
        self.fail = True
        self.calls = 0

    def __call__(self, payment_id, amount, note):
        self.calls += 1
        if self.fail:
            raise RuntimeError("razorpay is down")
        return "rfnd_mock_ok1"


@pytest.fixture
def refunds(monkeypatch):
    r = _Refunds()
    monkeypatch.setattr("app.services.drop_service.refund_payment", r)
    return r


@pytest.fixture
def alerts(monkeypatch):
    sent = []

    async def fake(db, title, body, url=None, *a, **k):
        sent.append((title, body))

    monkeypatch.setattr("app.services.admin_alerts.alert_admins", fake)
    return sent


async def _late_payment(async_client, db_session):
    """A's hold ran out, B took the only spot, then A's money still arrives. Returns (slug, challenge id, admin, A, A's order)."""
    ch, admin = await _team_challenge(async_client, db_session, max_teams=1)
    a, b = await _player(db_session, "A"), await _player(db_session, "B")
    order_a = (await _pay(async_client, ch["slug"], a, _entry())).json()["data"]["orderId"]
    await db_session.execute(update(ChallengePayment).where(ChallengePayment.razorpay_order_id == order_a)
                             .values(expires_at=datetime.now(timezone.utc) - timedelta(minutes=1)))
    await db_session.commit()
    order_b = (await _pay(async_client, ch["slug"], b, _entry())).json()["data"]["orderId"]
    assert (await _verify(async_client, ch["slug"], b, order_b)).status_code == 200
    return ch["slug"], ch["id"], admin, a, order_a


async def _row(db_session, order):
    return (await db_session.execute(select(ChallengePayment).where(ChallengePayment.razorpay_order_id == order)
                                     .execution_options(populate_existing=True))).scalar_one()


@pytest.mark.asyncio
async def test_razorpay_refusing_to_make_an_order_gives_the_friendly_503_not_a_500(async_client, db_session, monkeypatch):
    ch, _ = await _team_challenge(async_client, db_session)
    monkeypatch.setattr(settings, "ENABLE_SANDBOX_MOCK_PAYMENTS", False)  # a real key: no made-up order
    user = await _player(db_session)
    for path in ("team/pay",):
        res = await async_client.post(f"/api/v1/challenges/{ch['slug']}/{path}", json=_entry(), headers=auth_headers(user))
        assert res.status_code == 503, res.text
        assert res.json()["error"]["code"] == "PAYMENT_UNAVAILABLE"
        assert "Payments aren't working right now" in res.json()["error"]["message"]


@pytest.mark.asyncio
async def test_offer_payment_order_failure_is_also_a_clean_503(async_client, db_session, monkeypatch):
    ch, _ = await _team_challenge(async_client, db_session)
    user = await _player(db_session)
    monkeypatch.setattr(settings, "ENABLE_SANDBOX_MOCK_PAYMENTS", False)

    monkeypatch.setattr("app.services.challenge_teams.start_offer_payment", lambda *a, **k: (_ for _ in ()).throw(
        teams.drop_service.DropError("Payments aren't working right now. Please try again in a few minutes.", "PAYMENT_UNAVAILABLE")))
    res = await async_client.post(f"/api/v1/challenges/{ch['slug']}/team/pay-offer", headers=auth_headers(user))
    assert res.status_code == 503 and res.json()["error"]["code"] == "PAYMENT_UNAVAILABLE"


@pytest.mark.asyncio
async def test_bad_signature_message_does_not_claim_no_money_was_taken(async_client, db_session):
    ch, _ = await _team_challenge(async_client, db_session)
    user = await _player(db_session)
    order = (await _pay(async_client, ch["slug"], user, _entry())).json()["data"]["orderId"]
    res = await _verify(async_client, ch["slug"], user, order, ok=False)
    assert res.status_code == 400
    msg = res.json()["error"]["message"]
    assert "couldn't confirm your payment yet" in msg and "No money was taken" not in msg


@pytest.mark.asyncio
async def test_auto_refund_that_works_is_still_refunded_with_generic_wording(async_client, db_session, refunds, alerts):
    refunds.fail = False
    slug, _, _, a, order_a = await _late_payment(async_client, db_session)
    res = await _verify(async_client, slug, a, order_a)
    assert res.status_code == 409 and res.json()["error"]["code"] == "FULL_REFUNDED"
    assert "last team spot" not in res.json()["error"]["message"]
    pay = await _row(db_session, order_a)
    assert pay.status == "refunded" and pay.refund_id == "rfnd_mock_ok1"


@pytest.mark.asyncio
async def test_failed_auto_refund_is_parked_as_refund_due_and_admins_are_told_without_details(async_client, db_session, refunds, alerts):
    slug, cid, admin, a, order_a = await _late_payment(async_client, db_session)
    res = await _verify(async_client, slug, a, order_a)
    # The customer is not told it was refunded.
    assert res.status_code == 409 and res.json()["error"]["code"] == "REFUND_PENDING"
    msg = res.json()["error"]["message"].lower()
    assert "being refunded" not in msg and "was refunded" not in msg and "we refunded" not in msg
    pay = await _row(db_session, order_a)
    assert pay.status == "refund_due" and pay.refund_id is None and pay.entry_id is None and pay.player_id is None
    assert pay.refund_reason
    # One alert, nothing personal in it.
    due = [a_ for a_ in alerts if a_[0] == "Refund needed"]
    assert len(due) == 1
    text = " ".join(due[0]).lower()
    assert order_a.lower() not in text and "pay_" not in text and "rs " not in text and "player" not in text
    # The admin desk lists it under "Refund needed" and it is not counted as money refunded.
    desk = (await async_client.get(f"/api/v1/admin/challenges/{cid}/teams", headers=auth_headers(admin, is_admin=True))).json()["data"]
    assert [r["id"] for r in desk["refundNeeded"]] == [str(pay.id)]
    assert desk["money"]["refunded"] == 0
    # The customer's own page says it is with our team, not "refunded".
    me = (await async_client.get(f"/api/v1/challenges/{slug}/team/me", headers=auth_headers(a))).json()["data"]
    assert me["refundPending"] is True


@pytest.mark.asyncio
async def test_replays_never_refund_twice_or_alert_twice(async_client, db_session, refunds, alerts):
    slug, _, _, a, order_a = await _late_payment(async_client, db_session)
    assert (await _verify(async_client, slug, a, order_a)).status_code == 409
    assert refunds.calls == 1
    # The browser retries, and Razorpay replays the webhook: nothing new happens.
    again = await _verify(async_client, slug, a, order_a)
    assert again.status_code == 409 and again.json()["error"]["code"] == "REFUND_PENDING"
    done = await teams.confirm(db_session, order_a, "pay_mock_replay")
    assert done.outcome == "refund_due"
    done = await teams.confirm(db_session, order_a, "pay_mock_replay")
    assert done.outcome == "refund_due"
    assert refunds.calls == 1
    assert len([a_ for a_ in alerts if a_[0] == "Refund needed"]) == 1
    assert (await _row(db_session, order_a)).status == "refund_due"
    # Even once Razorpay is back up, nothing retries by itself.
    refunds.fail = False
    await teams.confirm(db_session, order_a, "pay_mock_replay")
    assert refunds.calls == 1 and (await _row(db_session, order_a)).status == "refund_due"


@pytest.mark.asyncio
async def test_admin_bulk_refund_skips_refund_due_payments(async_client, db_session, refunds, alerts):
    slug, cid, admin, a, order_a = await _late_payment(async_client, db_session)
    await _verify(async_client, slug, a, order_a)
    refunds.fail = False
    before = refunds.calls
    res = await async_client.post(f"/api/v1/admin/challenges/{cid}/teams/cancel-all",
                                  json={"reason": "test", "confirm": "CANCEL"}, headers=auth_headers(admin, is_admin=True))
    assert res.status_code == 200, res.text
    assert (await _row(db_session, order_a)).status == "refund_due"  # still waits for a person
    assert refunds.calls == before + 1  # only the team that really was registered


@pytest.mark.asyncio
async def test_admin_resolves_with_the_real_refund_id_and_it_is_audited_once(async_client, db_session, refunds, alerts):
    slug, cid, admin, a, order_a = await _late_payment(async_client, db_session)
    await _verify(async_client, slug, a, order_a)
    pay = await _row(db_session, order_a)
    url = f"/api/v1/admin/challenges/{cid}/payments/{pay.id}/resolve-refund"
    h = auth_headers(admin, is_admin=True)

    # Not confirmed, or not a Razorpay refund id: nothing changes.
    assert (await async_client.post(url, json={"refundId": "rfnd_AbC12345", "confirmed": False}, headers=h)).status_code == 400
    assert (await async_client.post(url, json={"refundId": "not-a-refund", "confirmed": True}, headers=h)).status_code == 422
    assert (await _row(db_session, order_a)).status == "refund_due"

    # A normal customer cannot do it.
    gamer = await _player(db_session, "Gamer")
    assert (await async_client.post(url, json={"refundId": "rfnd_AbC12345", "confirmed": True}, headers=auth_headers(gamer))).status_code in (401, 403)
    assert (await _row(db_session, order_a)).status == "refund_due"

    ok = await async_client.post(url, json={"refundId": "rfnd_AbC12345", "confirmed": True, "note": "done in dashboard"}, headers=h)
    assert ok.status_code == 200, ok.text
    assert ok.json()["data"]["refundNeeded"] == []
    pay = await _row(db_session, order_a)
    assert pay.status == "refunded" and pay.refund_id == "rfnd_AbC12345" and pay.refunded_at is not None
    assert refunds.calls == 1  # resolving called nothing at Razorpay

    # A second click changes nothing and does not write a second audit row.
    again = await async_client.post(url, json={"refundId": "rfnd_Other9999", "confirmed": True}, headers=h)
    assert again.status_code == 200
    assert (await _row(db_session, order_a)).refund_id == "rfnd_AbC12345"
    logs = (await db_session.execute(select(AdminAuditLog).where(AdminAuditLog.entity_id == str(pay.id)))).scalars().all()
    assert len(logs) == 1 and logs[0].action == "challenge_refund_resolved" and "rfnd_AbC12345" in (logs[0].reason or "")


@pytest.mark.asyncio
async def test_resolve_refuses_a_payment_that_is_not_waiting_for_a_refund(async_client, db_session):
    ch, admin = await _team_challenge(async_client, db_session)
    cap = await _player(db_session, "Captain")
    order = (await _pay(async_client, ch["slug"], cap, _entry())).json()["data"]["orderId"]
    assert (await _verify(async_client, ch["slug"], cap, order)).status_code == 200
    pay = await _row(db_session, order)
    res = await async_client.post(f"/api/v1/admin/challenges/{ch['id']}/payments/{pay.id}/resolve-refund",
                                  json={"refundId": "rfnd_AbC12345", "confirmed": True}, headers=auth_headers(admin, is_admin=True))
    assert res.status_code == 409 and res.json()["error"]["code"] == "NOT_REFUND_DUE"
    assert (await _row(db_session, order)).status == "paid"
    missing = await async_client.post(f"/api/v1/admin/challenges/{ch['id']}/payments/{uuid.uuid4()}/resolve-refund",
                                      json={"refundId": "rfnd_AbC12345", "confirmed": True}, headers=auth_headers(admin, is_admin=True))
    assert missing.status_code == 404


@pytest.mark.asyncio
async def test_funnel_reconciles_a_refund_due_payment_but_does_not_call_it_refunded(async_client, db_session, refunds, alerts):
    slug, cid, admin, a, order_a = await _late_payment(async_client, db_session)
    await _verify(async_client, slug, a, order_a)
    f = (await async_client.get(f"/api/v1/admin/challenges/{cid}/funnel", headers=auth_headers(admin, is_admin=True))).json()["data"]
    assert f["outcomes"]["refunded"] == 0 and f["outcomes"]["refundDue"] == 1
    assert f["reconciliation"]["databasePaid"] == 2  # B paid, A paid and is waiting for a refund
