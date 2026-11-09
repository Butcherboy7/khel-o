"""Scheduled community emails: test first, on time only, once each, voters skipped for c."""
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import delete, select

from app.database import AsyncSessionLocal
from app.models.community import (
    CommunityEmailCampaign, CommunityEmailDelivery, CommunityLead, CommunityPoll, CommunityPollVote,
)
from app.models.user import User, UserRole
from app.services import community_mailer as mailer

from tests.test_drops import _client, _h, _user

NOW = datetime(2026, 11, 10, 14, 5, tzinfo=timezone.utc)


async def _reset(variant="a", *, when=NOW - timedelta(minutes=5), tested=True, status="scheduled"):
    async with AsyncSessionLocal() as db:
        await db.execute(delete(CommunityEmailDelivery))
        await db.execute(delete(CommunityEmailCampaign))
        db.add(CommunityEmailCampaign(
            variant=variant, subject="s", scheduled_for=when, status=status,
            tested_at=NOW - timedelta(days=1) if tested else None, sent_count=0, failed_count=0,
        ))
        await db.commit()


async def _real_user(phone: str, email: str) -> uuid.UUID:
    u = await _user(UserRole.GAMER, phone=phone)
    async with AsyncSessionLocal() as db:
        row = await db.get(User, u.id)
        row.email = email
        await db.commit()
    return u.id


class Outbox:
    def __init__(self):
        self.sent: list[str] = []

    async def __call__(self, target, variant, options):
        self.sent.append(target.email)
        return True


async def _run(box):
    async with AsyncSessionLocal() as db:
        return await mailer.run_due(db, now=NOW, send=box, gap=0)


@pytest.mark.asyncio
async def test_untested_campaign_is_never_sent():
    await _real_user("9876510001", "untested1@gmail.com")
    await _reset(tested=False)
    box = Outbox()
    await _run(box)
    assert box.sent == []


@pytest.mark.asyncio
async def test_not_sent_before_its_time():
    await _real_user("9876510002", "early1@gmail.com")
    await _reset(when=NOW + timedelta(hours=1))
    box = Outbox()
    await _run(box)
    assert box.sent == []


@pytest.mark.asyncio
async def test_due_campaign_sends_once_each_and_never_twice():
    uid = await _real_user("9876510003", "once1@gmail.com")
    await _reset()
    box = Outbox()
    done = await _run(box)
    assert "once1@gmail.com" in box.sent and len(box.sent) == len(set(box.sent))
    assert done and done[0]["status"] == "sent"
    again = Outbox()
    await _run(again)
    assert again.sent == []
    # a cut-short run resumes without repeating anyone
    async with AsyncSessionLocal() as db:
        c = (await db.execute(select(CommunityEmailCampaign))).scalar_one()
        c.status = "sending"
        c.started_at = NOW - timedelta(hours=1)
        await db.commit()
    resumed = Outbox()
    await _run(resumed)
    assert resumed.sent == []


@pytest.mark.asyncio
async def test_very_late_campaign_is_marked_missed_not_sent():
    await _real_user("9876510004", "late1@gmail.com")
    await _reset(when=NOW - timedelta(hours=30))
    box = Outbox()
    done = await _run(box)
    assert box.sent == [] and done[0]["status"] == "missed"


@pytest.mark.asyncio
async def test_email_c_skips_people_who_already_voted_and_unsubscribed():
    voter = await _real_user("9876510005", "voter1@gmail.com")
    quiet = await _real_user("9876510006", "quiet1@gmail.com")
    await _real_user("9876510007", "fresh1@gmail.com")
    async with AsyncSessionLocal() as db:
        poll = CommunityPoll(question="q", options=["x", "y"], status="active")
        db.add(poll)
        await db.flush()
        db.add(CommunityPollVote(poll_id=poll.id, user_id=voter, option_index=0, device_id="d1"))
        await db.commit()
    async with AsyncSessionLocal() as db:
        await mailer.unsubscribe(db, quiet, mailer.unsubscribe_token(quiet))
    async with AsyncSessionLocal() as db:
        c = {t.email for t in await mailer.audience(db, "c")}
        a = {t.email for t in await mailer.audience(db, "a")}
    assert "fresh1@gmail.com" in c and "voter1@gmail.com" not in c and "quiet1@gmail.com" not in c
    assert "voter1@gmail.com" in a and "quiet1@gmail.com" not in a


@pytest.mark.asyncio
async def test_admin_can_preview_test_pause_and_reschedule():
    admin = await _user(UserRole.ADMIN, phone="9876510009")
    await _reset(tested=False, when=datetime.now(timezone.utc) + timedelta(days=2))
    async with _client() as c:
        lst = await c.get("/api/v1/admin/community/email-schedule", headers=_h(admin))
        assert lst.status_code == 200 and lst.json()["data"][0]["testedAt"] is None
        pv = await c.get("/api/v1/admin/community/email-schedule/a/preview", headers=_h(admin))
        assert pv.status_code == 200 and "Abdullah" in pv.json()["data"]["html"]
        assert (await c.get("/api/v1/admin/community/email-schedule/z/preview", headers=_h(admin))).status_code == 404
        t = await c.post("/api/v1/admin/community/email-schedule/a/test", headers=_h(admin))
        assert t.status_code == 200 and t.json()["data"]["sent"] is True
        p = await c.patch("/api/v1/admin/community/email-schedule/a", headers=_h(admin), json={"action": "pause"})
        assert p.json()["data"]["status"] == "paused" and p.json()["data"]["testedAt"]
        past = await c.patch("/api/v1/admin/community/email-schedule/a", headers=_h(admin), json={"scheduledFor": "2020-01-01T00:00:00Z"})
        assert past.status_code == 400
        r = await c.patch("/api/v1/admin/community/email-schedule/a", headers=_h(admin), json={"action": "resume"})
        assert r.json()["data"]["status"] == "scheduled"


@pytest.mark.asyncio
async def test_schedule_endpoints_are_admin_only():
    gamer = await _user(UserRole.GAMER, phone="9876510010")
    async with _client() as c:
        assert (await c.get("/api/v1/admin/community/email-schedule", headers=_h(gamer))).status_code in (401, 403)
