"""Team challenge emails: captain nudges, "a teammate joined", match-day mail,
the admin Remind button, and that each email goes out only once."""
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.models.challenge import Challenge, ChallengeMail
from app.services import challenge_team_mail as mail
from app.services import challenge_teams as teams
from tests.conftest import auth_headers
from tests.test_challenge_teams import _paid_team, _person, _team_challenge
from tests.test_challenges import _player


@pytest.fixture(autouse=True)
def _outbox(monkeypatch):
    sent: list[tuple[str, str]] = []

    async def fake(self, to, subject, body, ref):
        sent.append((to, subject))
        assert "tournament" not in body.lower() and "ticket" not in body.lower() and "prize" not in body.lower()
        return True

    monkeypatch.setattr("app.services.notification_service.NotificationService._send_resend_email", fake)
    monkeypatch.setattr(mail, "_can_email", lambda email: bool(email))
    from app.config import settings
    monkeypatch.setattr(settings, "ENABLE_SANDBOX_MOCK_PAYMENTS", True)
    monkeypatch.setattr("app.services.drop_service._rzp_post", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("offline")))
    return sent


async def _load(db_session, ch):
    return (await db_session.execute(select(Challenge).where(Challenge.id == uuid.UUID(ch["id"])))).scalar_one()


@pytest.mark.asyncio
async def test_captain_is_nudged_at_24h_and_72h_once_each(async_client, db_session, _outbox):
    ch, _ = await _team_challenge(async_client, db_session)
    await _paid_team(async_client, db_session, ch["slug"])
    _outbox.clear()  # the sign-up confirmation isn't what's tested here
    row = await _load(db_session, ch)
    now = teams.now()
    assert await mail.run_nudges(db_session, row, at=now + timedelta(hours=2)) == 0
    assert await mail.run_nudges(db_session, row, at=now + timedelta(hours=25), dry_run=True) == 1
    assert _outbox == []  # a dry run sends nothing
    assert await mail.run_nudges(db_session, row, at=now + timedelta(hours=25)) == 1
    assert await mail.run_nudges(db_session, row, at=now + timedelta(hours=26)) == 0  # once only
    assert await mail.run_nudges(db_session, row, at=now + timedelta(hours=73)) == 1
    assert [s for _, s in _outbox] and all("more player" in s for _, s in _outbox)
    assert len(_outbox) == 2


@pytest.mark.asyncio
async def test_last_day_nudge_and_nothing_after_signups_close(async_client, db_session, _outbox):
    close = datetime.now(timezone.utc) + timedelta(days=10)
    ch, _ = await _team_challenge(async_client, db_session, registrationClosesAt=close.isoformat())
    await _paid_team(async_client, db_session, ch["slug"])
    row = await _load(db_session, ch)
    assert await mail.run_nudges(db_session, row, at=close - timedelta(hours=5)) == 1
    assert await mail.run_nudges(db_session, row, at=close + timedelta(minutes=1)) == 0


@pytest.mark.asyncio
async def test_full_team_is_never_nudged_and_captain_hears_about_joiners(async_client, db_session, _outbox):
    ch, _ = await _team_challenge(async_client, db_session)
    cap, me = await _paid_team(async_client, db_session, ch["slug"])
    _outbox.clear()
    code = me["team"]["inviteUrl"].rsplit("/", 1)[1]
    for i in range(2):
        mate = await _player(db_session, f"Mate {i}")
        res = await async_client.post(f"/api/v1/challenges/{ch['slug']}/team/invite/{code}", json={
            "player": _person(instagram=""), "agreed": True, "taps": {"community": True}}, headers=auth_headers(mate))
        assert res.status_code == 200, res.text  # Instagram is optional
    subjects = [s for _, s in _outbox]
    assert any("joined" in s for s in subjects)            # captain told about the first joiner
    assert any("is complete" in s for s in subjects)        # and when the team is full
    assert sum(1 for s in subjects if s.startswith("You are in team")) == 2  # each teammate welcomed
    row = await _load(db_session, ch)
    assert await mail.run_nudges(db_session, row, at=teams.now() + timedelta(days=3)) == 0


@pytest.mark.asyncio
async def test_admin_remind_captains_has_a_six_hour_gap(async_client, db_session, _outbox):
    from tests.test_challenges import _admin
    ch, admin = await _team_challenge(async_client, db_session)
    await _paid_team(async_client, db_session, ch["slug"])
    _outbox.clear()
    url = f"/api/v1/admin/challenges/{ch['id']}/teams/remind-captains"
    res = await async_client.post(url, headers=auth_headers(admin))
    assert res.status_code == 200, res.text
    assert res.json()["data"]["remindResult"] == {"sent": 1, "skipped": 0}
    again = await async_client.post(url, headers=auth_headers(admin))
    assert again.json()["data"]["remindResult"] == {"sent": 0, "skipped": 1}
    desk = again.json()["data"]["teams"][0]
    assert desk["captain"]["name"] and desk["lastRemindedAt"]
    assert len(_outbox) == 1


@pytest.mark.asyncio
async def test_match_day_mail_goes_to_everyone_once(async_client, db_session, _outbox):
    ch, _ = await _team_challenge(async_client, db_session)
    await _paid_team(async_client, db_session, ch["slug"])
    _outbox.clear()
    row = await _load(db_session, ch)
    first = row.starts_at if row.starts_at.tzinfo else row.starts_at.replace(tzinfo=timezone.utc)
    ist = timezone(timedelta(hours=5, minutes=30))
    eve = datetime.combine(first.astimezone(ist).date() - timedelta(days=1), datetime.min.time(), ist).replace(hour=19)
    assert await mail.run_day_mail(db_session, row, at=eve - timedelta(days=2)) == 0
    assert await mail.run_day_mail(db_session, row, at=eve) == 1
    assert await mail.run_day_mail(db_session, row, at=eve + timedelta(hours=1)) == 0
    morning = datetime.combine(first.astimezone(ist).date(), datetime.min.time(), ist).replace(hour=9)
    assert await mail.run_day_mail(db_session, row, at=morning) == 1
    logged = (await db_session.execute(select(ChallengeMail.kind).where(ChallengeMail.challenge_id == row.id))).scalars().all()
    assert sorted(logged) == ["eve", "matchday"]
