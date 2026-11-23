"""Practice TEAMS for a Valorant rehearsal on dev: whole made-up teams (captain + teammates with
Riot IDs, ranks, colleges), one short team and a couple of solo players, so the admin can try the
team desk, check-in, draw, results and rewards before the real day. Dev only: the API refuses it
on production. Everything made here is marked is_test and tied to practice-NN@example.com users."""
import uuid

from sqlalchemy import delete, select, update

from app.models.challenge import Challenge, ChallengeEntry, ChallengeMatch, ChallengePlayer
from app.models.promotion import OfferCampaign
from app.models.user import User
from app.services import challenge_practice as base
from app.services import challenge_service as svc
from app.services import challenge_teams as teams

TEAM_NAMES = ["Night Owls", "Spike Rush", "Clutch Mode", "Sage Mains", "Ace Hunters", "Jett Lag",
              "Flash Point", "Omen Squad", "Sova Scouts", "Neon Rush", "Reyna Fans", "Phoenix Rising",
              "Brim Stone", "Cypher Crew", "Raze Bros", "Viper Pit"]
TAGS = ["KHL", "XQZ", "VLR", "GG1", "ACE", "CLT", "RSH", "PLY"]
RANK_POOL = ["Iron", "Bronze", "Silver", "Gold", "Platinum", "Diamond", "Unrated"]
COLLEGES = ["IIIT Hyderabad", "CBIT", "VNR VJIET", "Osmania University", "JNTU", "BITS Hyderabad"]
STYLES = list(teams.PLAY_STYLES)[:4] or [None]


def _player_row(ch_id, entry_id, user_id, role, i, k, added_by):
    name = f"{base.NAMES[(i + k) % len(base.NAMES)]} Practice"
    riot, key = teams.clean_riot(f"{base.NAMES[(i + k) % len(base.NAMES)]}{i}{k}#{TAGS[(i + k) % len(TAGS)]}")
    return ChallengePlayer(
        challenge_id=ch_id, entry_id=entry_id, user_id=user_id, role=role, status="active", full_name=name,
        phone=f"+9190000{i:02d}{k}{(i * 7 + k) % 100:02d}", riot_id=riot, riot_key=key,
        rank=RANK_POOL[(i + k) % len(RANK_POOL)], college=COLLEGES[(i + k) % len(COLLEGES)],
        play_style=STYLES[(i + k) % len(STYLES)], added_by=added_by, is_test=True, agreed_at=svc.now(),
        tapped_community_at=svc.now() if (i + k) % 2 == 0 else None,
    )


async def fill(db, ch: Challenge) -> dict:
    """Up to 8 full teams (never more than the team cap), 1 team of 2, and 2 solo players."""
    cfg = teams.config(ch)
    have = len(await teams.team_entries(db, ch.id))
    full_teams = max(min(8, cfg["maxTeams"] - have - 1), 0)
    made = {"teams": 0, "short": 0, "solos": 0}
    uid = 0
    for t in range(full_teams + 1):
        uid += 1
        user = await base._user(db, uid)
        await db.commit()
        if (await db.execute(select(ChallengeEntry.id).where(ChallengeEntry.challenge_id == ch.id,
                                                             ChallengeEntry.user_id == user.id))).first():
            continue  # already made by an earlier fill
        short = t == full_teams
        entry = ChallengeEntry(
            challenge_id=ch.id, user_id=user.id, name=TEAM_NAMES[t % len(TEAM_NAMES)], display_name=TEAM_NAMES[t % len(TEAM_NAMES)],
            phone=f"+91900001{t:02d}00", position=await teams._next_position(db, ch.id), status="confirmed",
            consent_rules=True, consent_age=True, consent_filming=True, consent_updates=True, consent_version="team-1",
            kind="team", invite_code=await teams._new_invite_code(db), is_test=True,
        )
        db.add(entry)
        await db.flush()
        for k in range(2 if short else cfg["size"]):
            db.add(_player_row(ch.id, entry.id, user.id if k == 0 else None, "captain" if k == 0 else "player", t + 1, k, "self" if k == 0 else "captain"))
        made["short" if short else "teams"] += 1
        await db.commit()
    for s in range(2):
        uid += 1
        user = await base._user(db, uid)
        await db.commit()
        if (await db.execute(select(ChallengePlayer.id).where(ChallengePlayer.challenge_id == ch.id,
                                                              ChallengePlayer.user_id == user.id))).first():
            continue
        db.add(_player_row(ch.id, None, user.id, "solo", 20 + s, 0, "self"))
        made["solos"] += 1
    await db.commit()
    return made


async def count(db, challenge_id) -> int:
    return len((await db.execute(select(ChallengePlayer.id).where(
        ChallengePlayer.challenge_id == challenge_id, ChallengePlayer.is_test.is_(True)))).all())


async def clear(db, ch: Challenge) -> int:
    removed = await count(db, ch.id)
    await db.execute(delete(ChallengeMatch).where(ChallengeMatch.challenge_id == ch.id))
    await db.execute(delete(ChallengePlayer).where(ChallengePlayer.challenge_id == ch.id, ChallengePlayer.is_test.is_(True)))
    await db.execute(delete(ChallengeEntry).where(ChallengeEntry.challenge_id == ch.id, ChallengeEntry.is_test.is_(True)))
    await db.execute(update(OfferCampaign).where(OfferCampaign.challenge_id == ch.id, OfferCampaign.superseded_at.is_(None))
                     .values(is_active=False, superseded_at=svc.now()))
    ch.drawn_at = None
    ch.checkin_closed_at = None
    ch.champion_photo_url = None
    if ch.status in ("live", "finished"):
        ch.status = "open"
    await db.commit()
    return removed
