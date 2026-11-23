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
        import os, re as _re
        if os.environ.get("DUMP_MAIL_DIR"):  # to look at the emails: DUMP_MAIL_DIR=some/dir pytest ...
            name = _re.sub(r"[^a-z0-9]+", "-", subject.lower())[:50]
            open(os.path.join(os.environ["DUMP_MAIL_DIR"], f"{len(sent):02d}-{name}.html"), "w", encoding="utf-8").write(body)
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


@pytest.mark.asyncio
async def test_same_phone_is_refused_before_paying_and_a_late_clash_is_refunded(async_client, db_session):
    """Two captains on one WhatsApp number: the second can't start paying; and if it only
    shows up after the money is in, the payment is refunded instead of being left stuck."""
    from app.models.challenge import ChallengePayment
    from tests.conftest import auth_headers as ah
    from tests.test_challenge_teams import _entry, _pay, _verify
    ch, _ = await _team_challenge(async_client, db_session)
    cap, _me = await _paid_team(async_client, db_session, ch["slug"], player=_person(phone="9876500001"))

    other = await _player(db_session, "Other")
    res = await _pay(async_client, ch["slug"], other, _entry(player=_person(phone="9876500001")))
    assert res.status_code == 409 and res.json()["error"]["code"] == "PHONE_TAKEN"

    # The late clash: start with a free number, then the form's number becomes taken before payment lands.
    res = await _pay(async_client, ch["slug"], other, _entry(player=_person(phone="9876500002")))
    assert res.status_code == 200, res.text
    order = res.json()["data"]["orderId"]
    pay = (await db_session.execute(select(ChallengePayment).where(ChallengePayment.razorpay_order_id == order))).scalar_one()
    form = dict(pay.form)
    form["player"] = {**form["player"], "phone": "+919876500001"}
    pay.form = form
    await db_session.commit()
    refunds = []
    import app.services.drop_service as drops
    from pytest import MonkeyPatch
    mp = MonkeyPatch()
    mp.setattr(drops, "refund_payment", lambda pid, amount, reason: refunds.append(pid) or "rfnd_test")
    try:
        res = await _verify(async_client, ch["slug"], other, order)
    finally:
        mp.undo()
    assert res.status_code == 409 and res.json()["error"]["code"] == "FULL_REFUNDED", res.text
    await db_session.refresh(pay)
    assert pay.status == "refunded" and len(refunds) == 1


@pytest.mark.asyncio
async def test_changes_to_an_entry_always_email_the_people_in_it(async_client, db_session, _outbox):
    """Refund, cancel, solo placed, slot offered, match time: nobody is left guessing."""
    from tests.test_challenge_teams import _entry, _pay, _verify
    ch, admin = await _team_challenge(async_client, db_session, maxTeams=4)
    cid, slug = ch["id"], ch["slug"]
    cap, me = await _paid_team(async_client, db_session, slug)
    code = me["team"]["inviteUrl"].rsplit("/", 1)[1]
    mate = await _player(db_session, "Mate")
    res = await async_client.post(f"/api/v1/challenges/{slug}/team/invite/{code}", json={
        "player": _person(), "agreed": True, "taps": {"community": True}}, headers=auth_headers(mate))
    assert res.status_code == 200, res.text
    # a solo player pays and is placed into the short team
    solo = await _player(db_session, "Solo")
    r = await _pay(async_client, slug, solo, _entry(kind="solo"))
    assert r.status_code == 200, r.text
    assert (await _verify(async_client, slug, solo, r.json()["data"]["orderId"])).status_code == 200
    desk = (await async_client.get(f"/api/v1/admin/challenges/{cid}/teams", headers=auth_headers(admin))).json()["data"]
    team_id, solo_id = desk["teams"][0]["id"], desk["solos"][0]["id"]
    _outbox.clear()
    res = await async_client.post(f"/api/v1/admin/challenges/{cid}/teams/place-solo",
                                  json={"playerId": solo_id, "entryId": team_id}, headers=auth_headers(admin))
    assert res.status_code == 200, res.text
    assert [s for _, s in _outbox if s.startswith("You have a team")]  # the solo hears they have a team

    # cancel: every player gets told, including ones already marked refunded/removed
    import app.services.drop_service as drops
    from pytest import MonkeyPatch
    mp = MonkeyPatch()
    mp.setattr(drops, "refund_payment", lambda pid, amount, reason: "rfnd_test")
    try:
        _outbox.clear()
        res = await async_client.post(f"/api/v1/admin/challenges/{cid}/teams/cancel-all",
                                      json={"reason": "XQZ closed that day", "confirm": "CANCEL"}, headers=auth_headers(admin))
    finally:
        mp.undo()
    assert res.status_code == 200, res.text
    cancelled = [s for _, s in _outbox if s.startswith("Cancelled:")]
    assert len(cancelled) == 3  # captain, teammate, solo
    assert all("tournament" not in s.lower() for _, s in _outbox)


@pytest.mark.asyncio
async def test_home_card_also_shows_for_teammates_and_solo_players(async_client, db_session):
    from tests.test_challenge_teams import _entry, _pay, _verify
    ch, _ = await _team_challenge(async_client, db_session)
    slug = ch["slug"]
    cap, me = await _paid_team(async_client, db_session, slug)
    code = me["team"]["inviteUrl"].rsplit("/", 1)[1]
    mate = await _player(db_session, "Mate")
    await async_client.post(f"/api/v1/challenges/{slug}/team/invite/{code}", json={
        "player": _person(), "agreed": True, "taps": {"community": True}}, headers=auth_headers(mate))
    solo = await _player(db_session, "Solo")
    r = await _pay(async_client, slug, solo, _entry(kind="solo"))
    await _verify(async_client, slug, solo, r.json()["data"]["orderId"])

    def card(res):
        return next(c for c in res.json()["data"] if c["slug"] == slug)

    mine = await async_client.get("/api/v1/challenges/mine/active", headers=auth_headers(mate))
    assert card(mine)["teamName"] and card(mine)["rank"] is None
    mine = await async_client.get("/api/v1/challenges/mine/active", headers=auth_headers(solo))
    assert card(mine)["soloWaiting"] is True
    mine = await async_client.get("/api/v1/challenges/mine/active", headers=auth_headers(cap))
    assert card(mine)["teamNeeds"]["players"] == 2 and card(mine)["teamNeeds"]["size"] == 3


@pytest.mark.asyncio
async def test_invite_peek_works_logged_out_and_gives_no_personal_details(async_client, db_session):
    ch, _ = await _team_challenge(async_client, db_session)
    cap, me = await _paid_team(async_client, db_session, ch["slug"])
    code = me["team"]["inviteUrl"].rsplit("/", 1)[1]
    res = await async_client.get(f"/api/v1/challenges/{ch['slug']}/team/invite/{code}/peek")  # no login
    assert res.status_code == 200, res.text
    data = res.json()["data"]
    assert data["teamName"] and data["players"] == 1 and data["size"] == 3 and data["full"] is False
    assert not ({"phonePrefill", "namePrefill", "phone"} & set(data))
    bad = await async_client.get(f"/api/v1/challenges/{ch['slug']}/team/invite/NOPE1234/peek")
    assert bad.status_code in (404, 409, 400), bad.text


@pytest.mark.asyncio
async def test_practice_fills_whole_teams_and_clears_again(async_client, db_session):
    ch, admin = await _team_challenge(async_client, db_session, maxTeams=16)
    url = f"/api/v1/admin/challenges/{ch['id']}/teams/practice"
    res = await async_client.post(url, headers=auth_headers(admin))
    assert res.status_code == 200, res.text
    d = res.json()["data"]
    assert d["made"] == {"teams": 8, "short": 1, "solos": 2}
    full = [t for t in d["teams"] if len(t["members"]) == 3]
    assert len(full) == 8 and all(m["riotId"] and m["college"] is not None for t in full for m in t["members"])
    assert len(d["solos"]) == 2 and d["practicePlayers"] == 8 * 3 + 2 + 2
    again = await async_client.post(url, headers=auth_headers(admin))  # twice adds nothing new
    assert again.json()["data"]["made"] == {"teams": 0, "short": 0, "solos": 0}
    gone = await async_client.delete(url, headers=auth_headers(admin))
    assert gone.json()["data"]["teams"] == [] and gone.json()["data"]["practicePlayers"] == 0


@pytest.mark.asyncio
async def test_team_made_from_practice_solos_is_cleared_and_draw_refuses_empty_teams(async_client, db_session):
    ch, admin = await _team_challenge(async_client, db_session, maxTeams=16)
    cid = ch["id"]
    base = f"/api/v1/admin/challenges/{cid}/teams"
    d = (await async_client.post(f"{base}/practice", headers=auth_headers(admin))).json()["data"]
    solo_ids = [s["id"] for s in d["solos"]]
    res = await async_client.post(f"{base}/solo-team", json={"playerIds": solo_ids, "name": "Grouped"}, headers=auth_headers(admin))
    assert res.status_code == 200, res.text
    # Clearing practice removes the team built from practice solos too: nothing empty is left behind.
    d = (await async_client.delete(f"{base}/practice", headers=auth_headers(admin))).json()["data"]
    assert d["teams"] == []

    # A confirmed team with nobody in it (old data) blocks the draw with its name.
    from sqlalchemy import select
    from app.models.challenge import ChallengeEntry, ChallengePlayer
    await async_client.post(f"{base}/practice", headers=auth_headers(admin))
    entry = (await db_session.execute(select(ChallengeEntry).where(ChallengeEntry.challenge_id == __import__("uuid").UUID(cid), ChallengeEntry.name == "Night Owls"))).scalar_one()
    for p in (await db_session.execute(select(ChallengePlayer).where(ChallengePlayer.entry_id == entry.id))).scalars():
        p.status = "refunded"
    await db_session.commit()
    res = await async_client.post(f"{base}/draw", json={"redo": False}, headers=auth_headers(admin))
    assert res.status_code == 409 and "Night Owls" in res.json()["error"]["message"], res.text


@pytest.mark.asyncio
async def test_walkover_result_with_no_scores_moves_the_team_on(async_client, db_session):
    ch, admin = await _team_challenge(async_client, db_session, maxTeams=16)
    base = f"/api/v1/admin/challenges/{ch['id']}/teams"
    await async_client.post(f"{base}/practice", headers=auth_headers(admin))
    assert (await async_client.post(f"{base}/draw", json={"redo": False}, headers=auth_headers(admin))).status_code == 200
    b = (await async_client.get(f"/api/v1/challenges/{ch['slug']}/bracket")).json()["data"]
    m = b["ready"][0]
    res = await async_client.post(f"{base}/matches/{m['id']}/result", json={"winner": "b", "games": []}, headers=auth_headers(admin))
    assert res.status_code == 200, res.text
    b = (await async_client.get(f"/api/v1/challenges/{ch['slug']}/bracket")).json()["data"]
    done = next(x for r in b["rounds"] for x in r["matches"] if x["id"] == m["id"])
    assert done["winner"] == "b"
