"""Team challenges (Valorant 3v3): paid team/solo entry, slot holds, invites,
waitlist, refunds, check-in by player, and the draw with match times."""
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select, update

from app.config import settings
from app.models.challenge import Challenge, ChallengeMatch, ChallengePayment
from app.services import challenge_teams as teams
from tests.conftest import auth_headers
from tests.test_challenges import _challenge, _player

IST = timezone(timedelta(hours=5, minutes=30))


@pytest.fixture(autouse=True)
def _mock_payments(monkeypatch):
    monkeypatch.setattr(settings, "ENABLE_SANDBOX_MOCK_PAYMENTS", True)
    # No network: every order is a mock order.
    monkeypatch.setattr("app.services.drop_service._rzp_post", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("offline")))
    monkeypatch.setattr("app.services.notification_service.NotificationService._send_resend_email",
                        lambda *a, **k: _async_true())


async def _async_true():
    return True


async def _team_challenge(async_client, db_session, max_teams=2, **team):
    ch, admin = await _challenge(async_client, db_session, capacity=16, title="KHELO Valorant 3v3 Challenge", game="Valorant")
    row = (await db_session.execute(select(Challenge).where(Challenge.id == uuid.UUID(ch["id"])))).scalar_one()
    row.plan_config = {"team": {"maxTeams": max_teams, "minTeams": 1, "priceTeam": 750, "priceSolo": 300, **team}}
    await db_session.commit()
    return ch, admin


_n = 0


def _person(**over):
    global _n
    _n += 1
    body = {"fullName": f"Player {_n}", "phone": f"98765{_n:05d}", "riotId": f"Gamer{_n}#KH{_n % 10}1",
            "rank": "Gold", "instagram": f"gamer_{_n}", "college": "JNTU"}
    body.update(over)
    return body


def _entry(kind="team", **over):
    body = {"kind": kind, "teamName": f"Squad {uuid.uuid4().hex[:4]}" if kind == "team" else None,
            "player": _person(), "taps": {"community": True, "instaKhelo": True, "instaVenue": True}, "agreed": True}
    body.update(over)
    return body


async def _pay(async_client, slug, user, body):
    res = await async_client.post(f"/api/v1/challenges/{slug}/team/pay", json=body, headers=auth_headers(user))
    return res


async def _verify(async_client, slug, user, order_id, ok=True):
    return await async_client.post(f"/api/v1/challenges/{slug}/team/verify", json={
        "razorpayOrderId": order_id, "razorpayPaymentId": f"pay_mock_{uuid.uuid4().hex[:8]}",
        "razorpaySignature": "mock_signature_valid" if ok else "mock_signature_INVALID",
    }, headers=auth_headers(user))


async def _paid_team(async_client, db_session, slug, **over):
    cap = await _player(db_session, "Captain")
    res = await _pay(async_client, slug, cap, _entry(**over))
    assert res.status_code == 200, res.text
    res = await _verify(async_client, slug, cap, res.json()["data"]["orderId"])
    assert res.status_code == 200, res.text
    return cap, res.json()["data"]


@pytest.mark.asyncio
async def test_team_pays_and_gets_invite_qr_and_counts(async_client, db_session):
    ch, _ = await _team_challenge(async_client, db_session)
    pub = (await async_client.get(f"/api/v1/challenges/{ch['slug']}")).json()["data"]
    assert pub["team"]["spotsLeft"] == 2 and pub["team"]["priceTeam"] == 750

    cap, me = await _paid_team(async_client, db_session, ch["slug"])
    assert me["team"]["status"] == "confirmed" and me["team"]["players"] == 1
    assert me["team"]["inviteUrl"].endswith(f"/invite/{me['team']['inviteUrl'].rsplit('/', 1)[1]}")
    assert me["player"]["qr"].startswith("data:image/png")
    assert me["player"]["tappedCommunity"] is True
    assert me["payment"]["amount"] == 750

    pub = (await async_client.get(f"/api/v1/challenges/{ch['slug']}")).json()["data"]
    assert (pub["team"]["teams"], pub["team"]["spotsLeft"]) == (1, 1)


@pytest.mark.asyncio
async def test_bad_signature_takes_nothing(async_client, db_session):
    ch, _ = await _team_challenge(async_client, db_session)
    cap = await _player(db_session)
    order = (await _pay(async_client, ch["slug"], cap, _entry())).json()["data"]["orderId"]
    res = await _verify(async_client, ch["slug"], cap, order, ok=False)
    assert res.status_code == 400
    me = (await async_client.get(f"/api/v1/challenges/{ch['slug']}/team/me", headers=auth_headers(cap))).json()["data"]
    assert me["player"] is None


@pytest.mark.asyncio
async def test_last_slot_is_held_for_whoever_started_paying(async_client, db_session):
    ch, _ = await _team_challenge(async_client, db_session, max_teams=1)
    a, b = await _player(db_session, "A"), await _player(db_session, "B")
    res_a = await _pay(async_client, ch["slug"], a, _entry())
    assert res_a.status_code == 200
    # B can't take the held slot.
    res_b = await _pay(async_client, ch["slug"], b, _entry())
    assert res_b.status_code == 409 and res_b.json()["error"]["code"] == "FULL"
    # A taps Pay again: same order back, not a second hold.
    again = await _pay(async_client, ch["slug"], a, _entry())
    assert again.json()["data"]["orderId"] == res_a.json()["data"]["orderId"]


@pytest.mark.asyncio
async def test_late_payment_after_hold_ran_out_and_slot_gone_is_refunded(async_client, db_session):
    ch, _ = await _team_challenge(async_client, db_session, max_teams=1)
    a, b = await _player(db_session, "A"), await _player(db_session, "B")
    order_a = (await _pay(async_client, ch["slug"], a, _entry())).json()["data"]["orderId"]
    # A's hold runs out; B takes and pays for the only slot.
    await db_session.execute(update(ChallengePayment).where(ChallengePayment.razorpay_order_id == order_a)
                             .values(expires_at=datetime.now(timezone.utc) - timedelta(minutes=1)))
    await db_session.commit()
    order_b = (await _pay(async_client, ch["slug"], b, _entry())).json()["data"]["orderId"]
    assert (await _verify(async_client, ch["slug"], b, order_b)).status_code == 200
    # A's money still arrives: refunded, not a 2nd team in a 1-team challenge.
    res = await _verify(async_client, ch["slug"], a, order_a)
    assert res.status_code == 409 and res.json()["error"]["code"] == "FULL_REFUNDED"
    pay = (await db_session.execute(select(ChallengePayment).where(ChallengePayment.razorpay_order_id == order_a)
                                    .execution_options(populate_existing=True))).scalar_one()
    assert pay.status == "refunded" and pay.refund_id.startswith("rfnd_mock_")


@pytest.mark.asyncio
async def test_teammates_join_with_the_link_without_paying(async_client, db_session):
    ch, _ = await _team_challenge(async_client, db_session)
    cap, me = await _paid_team(async_client, db_session, ch["slug"])
    code = me["team"]["inviteUrl"].rsplit("/", 1)[1]
    for i in range(2):
        mate = await _player(db_session, f"Mate {i}")
        info = (await async_client.get(f"/api/v1/challenges/{ch['slug']}/team/invite/{code}", headers=auth_headers(mate))).json()["data"]
        assert info["players"] == 1 + i and not info["mainFull"]
        res = await async_client.post(f"/api/v1/challenges/{ch['slug']}/team/invite/{code}", json={
            "player": _person(), "agreed": True, "taps": {"community": True}}, headers=auth_headers(mate))
        assert res.status_code == 200, res.text
    late = await _player(db_session, "Fourth")
    res = await async_client.post(f"/api/v1/challenges/{ch['slug']}/team/invite/{code}", json={
        "player": _person(), "agreed": True}, headers=auth_headers(late))
    assert res.status_code == 409 and res.json()["error"]["code"] == "TEAM_FULL"
    # ...but the one substitute spot is still open.
    res = await async_client.post(f"/api/v1/challenges/{ch['slug']}/team/invite/{code}", json={
        "player": _person(), "agreed": True, "asSub": True}, headers=auth_headers(late))
    assert res.status_code == 200
    me = (await async_client.get(f"/api/v1/challenges/{ch['slug']}/team/me", headers=auth_headers(cap))).json()["data"]
    assert (me["team"]["players"], me["team"]["subs"]) == (3, 1)


@pytest.mark.asyncio
async def test_captain_types_teammates_in_only_after_signups_close(async_client, db_session):
    ch, _ = await _team_challenge(async_client, db_session, teammatesBy="2099-01-01T00:00:00+00:00")
    cap, _ = await _paid_team(async_client, db_session, ch["slug"])
    url = f"/api/v1/challenges/{ch['slug']}/team/me/teammates"
    friend = {"fullName": "Friend One", "phone": "9123456780", "riotId": "Friend#ONE"}
    res = await async_client.post(url, json={"player": friend}, headers=auth_headers(cap))
    assert res.status_code == 409 and res.json()["error"]["code"] == "TOO_EARLY"
    from app.models.challenge import Challenge
    from sqlalchemy import select
    row = (await db_session.execute(select(Challenge).where(Challenge.slug == ch["slug"]))).scalar_one()
    row.plan_config = {**row.plan_config, "team": {**row.plan_config["team"], "teammatesBy": "2000-01-01T00:00:00+00:00"}}
    await db_session.commit()
    # No rank or Instagram needed when the captain types it.
    res = await async_client.post(url, json={"player": friend}, headers=auth_headers(cap))
    assert res.status_code == 200, res.text
    assert res.json()["data"]["team"]["players"] == 2


@pytest.mark.asyncio
async def test_same_riot_id_cant_be_in_two_teams(async_client, db_session):
    ch, _ = await _team_challenge(async_client, db_session)
    await _paid_team(async_client, db_session, ch["slug"], player=_person(riotId="Same#ID1"))
    other = await _player(db_session)
    res = await _pay(async_client, ch["slug"], other, _entry(player=_person(riotId="same#id1")))
    assert res.status_code == 409 and res.json()["error"]["code"] == "RIOT_ID_TAKEN"


@pytest.mark.asyncio
async def test_full_challenge_takes_waitlist_for_free(async_client, db_session):
    ch, _ = await _team_challenge(async_client, db_session, max_teams=1)
    await _paid_team(async_client, db_session, ch["slug"])
    late = await _player(db_session)
    assert (await _pay(async_client, ch["slug"], late, _entry())).status_code == 409
    res = await async_client.post(f"/api/v1/challenges/{ch['slug']}/team/waitlist", json=_entry(), headers=auth_headers(late))
    assert res.status_code == 200, res.text
    assert res.json()["data"]["team"]["status"] == "waitlist"
    pub = (await async_client.get(f"/api/v1/challenges/{ch['slug']}")).json()["data"]
    assert pub["team"]["waitlistTeams"] == 1 and pub["team"]["spotsLeft"] == 0


@pytest.mark.asyncio
async def test_solo_pays_and_admin_groups_three_into_a_team_then_refunds_one(async_client, db_session):
    ch, admin = await _team_challenge(async_client, db_session)
    solos = []
    for i in range(4):
        u = await _player(db_session, f"Solo {i}")
        res = await _pay(async_client, ch["slug"], u, _entry("solo", player=_person(playStyle="support")))
        assert res.status_code == 200
        assert (await _verify(async_client, ch["slug"], u, res.json()["data"]["orderId"])).status_code == 200
        solos.append(u)
    h = auth_headers(admin, is_admin=True)
    desk = (await async_client.get(f"/api/v1/admin/challenges/{ch['id']}/teams", headers=h)).json()["data"]
    assert len(desk["solos"]) == 4 and desk["stats"]["solosWaiting"] == 4
    ids = [s["id"] for s in desk["solos"][:3]]
    res = await async_client.post(f"/api/v1/admin/challenges/{ch['id']}/teams/solo-team", json={"playerIds": ids}, headers=h)
    assert res.status_code == 200, res.text
    desk = res.json()["data"]
    assert desk["teams"][0]["name"] == "Solo Squad 1" and desk["teams"][0]["players"] == 3
    left = desk["solos"][0]["id"]
    res = await async_client.post(f"/api/v1/admin/challenges/{ch['id']}/teams/players/{left}/refund", json={"reason": "No team"}, headers=h)
    assert res.status_code == 200, res.text
    assert res.json()["data"]["solos"][0]["refunded"] is True


@pytest.mark.asyncio
async def test_draw_sets_times_and_lobbies_from_the_schedule(async_client, db_session):
    ch, admin = await _team_challenge(async_client, db_session, max_teams=16)
    for _ in range(11):
        await _paid_team(async_client, db_session, ch["slug"])
    h = auth_headers(admin, is_admin=True)
    res = await async_client.post(f"/api/v1/admin/challenges/{ch['id']}/teams/draw", json={}, headers=h)
    assert res.status_code == 200, res.text
    rows = (await db_session.execute(select(ChallengeMatch).where(ChallengeMatch.challenge_id == uuid.UUID(ch["id"]))
                                     .execution_options(populate_existing=True))).scalars().all()
    row = (await db_session.execute(select(Challenge).where(Challenge.id == uuid.UUID(ch["id"]))
                                    .execution_options(populate_existing=True))).scalar_one()
    start = teams._aware(row.starts_at)  # same reading of the stored time as the schedule

    def at(r, p):
        m = next(x for x in rows if x.round == r and x.position == p)
        return None if m.starts_at is None else (teams._aware(m.starts_at) - start, m.lobby)

    # 11 teams in 16 slots: 5 byes; round 1 runs 12:00–13:00 in pairs, QF 13:20/13:40, SF 14:00, final 14:50.
    assert sum(1 for m in rows if m.bye) == 5
    assert at(1, 0) == (timedelta(minutes=80), "A") and at(1, 3) == (timedelta(minutes=100), "B")
    assert at(2, 0) == (timedelta(minutes=120), "A") and at(2, 1) == (timedelta(minutes=120), "B")
    assert at(3, 0) == (timedelta(minutes=170), "A")
    bk = (await async_client.get(f"/api/v1/challenges/{ch['slug']}/bracket")).json()["data"]
    semi = bk["rounds"][2]["matches"][0]
    assert semi["bestOf"] == 3 and semi["lobby"] == "A"
    assert bk["rounds"][0]["matches"][0]["bestOf"] == 1


@pytest.mark.asyncio
async def test_results_move_winners_on_with_round_scores(async_client, db_session):
    ch, admin = await _team_challenge(async_client, db_session, max_teams=4)
    for _ in range(4):
        await _paid_team(async_client, db_session, ch["slug"])
    h = auth_headers(admin, is_admin=True)
    assert (await async_client.post(f"/api/v1/admin/challenges/{ch['id']}/teams/draw", json={}, headers=h)).status_code == 200
    bk = (await async_client.get(f"/api/v1/challenges/{ch['slug']}/bracket")).json()["data"]
    # 4 teams: both rounds are best of 3 (semis + final).
    sf = bk["rounds"][0]["matches"][0]
    bad = await async_client.post(f"/api/v1/admin/challenges/{ch['id']}/teams/matches/{sf['id']}/result",
                                  json={"winner": "a", "games": [{"a": 10, "b": 7}]}, headers=h)
    assert bad.status_code == 400
    ok = await async_client.post(f"/api/v1/admin/challenges/{ch['id']}/teams/matches/{sf['id']}/result",
                                 json={"winner": "a", "games": [{"a": 10, "b": 7}, {"a": 8, "b": 10}, {"a": 10, "b": 9}]}, headers=h)
    assert ok.status_code == 200, ok.text
    bk = (await async_client.get(f"/api/v1/challenges/{ch['slug']}/bracket")).json()["data"]
    final = bk["rounds"][1]["matches"][0]
    assert final["a"]["name"] == sf["a"]["name"]
    assert bk["rounds"][0]["matches"][0]["games"][2] == {"a": 10, "b": 9}


def test_input_checks():
    assert teams.clean_riot(" Uzair # KHL1 ") == ("Uzair#KHL1", "uzair#khl1")
    for bad in ("Uz#KHL1", "Uzair#K1", "UzairKHL1", "Uzair#KHL1234"):
        with pytest.raises(teams.TeamError):
            teams.clean_riot(bad)
    assert teams.clean_insta("@khelo.journey") == "khelo.journey"
    assert teams.clean_insta("https://www.instagram.com/xqz_hyd/") == "xqz_hyd"
    assert teams.clean_phone("98765 43210") == "+919876543210"
    with pytest.raises(teams.TeamError):
        teams.clean_team_name("ab")
    with pytest.raises(teams.TeamError):
        teams.clean_team_name("Team Chutiya")
    assert teams.clean_team_name("  Night   Owls ") == "Night Owls"
