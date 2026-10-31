"""The worst-case day, on dev: a guided rehearsal moves the clock to "check-in
just opened" and then makes things happen on cue (people arrive, a crowd of
walk-ins turns up, someone runs in late, rounds get played) so the host can
practise every answer before the real day. Never on production: the API
refuses it there, like the practice players it is built on."""

import random
from datetime import timedelta

from sqlalchemy import select

from app.models.challenge import Challenge, ChallengeEntry
from app.models.user import User
from app.services import challenge_day as day
from app.services import challenge_practice as practice
from app.services import challenge_results as results
from app.services import challenge_service as svc

NAMES = practice.NAMES
MAX_PLAYERS = len(NAMES)


async def _practice_entries(db, challenge_id) -> list[ChallengeEntry]:
    return list((await db.execute(
        select(ChallengeEntry).join(User, User.id == ChallengeEntry.user_id).where(
            ChallengeEntry.challenge_id == challenge_id, User.email.like("practice-%@example.com"),
        ).order_by(ChallengeEntry.position)
    )).scalars().all())


async def _add(db, ch: Challenge, n: int, door: bool) -> list[str]:
    """n more made-up players. At the door they are checked in at once, like a
    real walk-in scanning the counter QR."""
    used = {e.phone for e in await _practice_entries(db, ch.id)}
    added: list[str] = []
    for i in range(1, MAX_PLAYERS + 1):
        if len(added) >= n:
            break
        phone = f"+9190000003{i:02d}"
        if phone in used:
            continue
        u = await practice._user(db, i)
        await db.commit()
        entry, created = await svc.join(db, ch.id, u.id, {
            "name": f"{NAMES[i - 1]} Practice",
            "display_name": NAMES[i - 1],
            "phone": phone,
            "main_character": practice.CHARACTERS[(i - 1) % len(practice.CHARACTERS)],
            "consent_rules": True,
            "consent_age": True,
        }, door=door)
        if created:
            entry.is_test = True
            added.append(NAMES[i - 1])
        await db.commit()
    return added


async def start(db, ch: Challenge, signed_up: int) -> dict:
    """Wipe the last rehearsal and set the clock: check-in opened a minute ago
    and closes in 45 minutes. `signed_up` people are on the list, nobody here yet."""
    await practice.clear(db, ch)
    now = svc.now()
    ch.checkin_opens_at = now - timedelta(minutes=1)
    ch.checkin_closes_at = now + timedelta(minutes=45)
    ch.starts_at = ch.checkin_closes_at
    ch.ends_at = ch.starts_at + timedelta(hours=3)
    ch.status = "open"
    await db.commit()
    added = await _add(db, ch, signed_up, door=False)
    return {"signedUp": len(added)}


async def arrive(db, ch: Challenge, n: int) -> dict:
    """n people from the list walk in and get ticked."""
    waiting = [e for e in await _practice_entries(db, ch.id) if e.status in ("confirmed", "waitlist") and not e.present]
    came = waiting[:n]
    for e in came:
        e.present, e.checked_in_at = True, svc.now()
    await db.commit()
    return {"arrived": [e.display_name for e in came]}


async def walk_in(db, ch: Challenge, n: int) -> dict:
    """n people who never signed up scan the door QR."""
    added = await _add(db, ch, n, door=True)
    return {"walkedIn": added}


def _score(best_of: int, goals: bool) -> tuple[int, int]:
    if goals:
        w = random.randint(1, 4)
        return w, random.randint(0, w - 1)
    need = best_of // 2 + 1
    return need, random.randint(0, need - 1)


async def play(db, ch: Challenge, leave: int = 0, until_final: bool = False) -> dict:
    """Enter results for the matches that are ready, like the games being played.
    `leave` matches are left for the host to enter. `until_final` keeps going
    until only the final and the 3rd-place match are left."""
    played = 0
    for _ in range(64):
        rows = await day.matches(db, ch.id)
        rounds = day.rounds_of(rows)
        ready = [m for m in day.ready_matches(rows) if m.postponed_at is None]
        if until_final:
            ready = [m for m in ready if not m.is_third_place and m.round < rounds - 1]
        elif ready:
            # One round at a time, like the day: the earliest round still being played.
            low = min(m.round for m in ready)
            ready = [m for m in ready if m.round == low]
        todo = ready[: max(0, len(ready) - leave)] if not until_final else ready
        if not todo:
            break
        for m in todo:
            a, b = _score(results.match_best_of(ch, rounds, m), results.result_type(ch) == "goals")
            winner = random.choice(["a", "b"])
            sa, sb = (a, b) if winner == "a" else (b, a)
            await day.record_result(db, ch.id, m.id, winner, sa, sb)
            played += 1
        if not until_final:
            break
    return {"played": played}


async def state(db, ch: Challenge) -> dict:
    rows = await day.matches(db, ch.id)
    inside = day.in_bracket(rows)
    entries = await svc.entries(db, ch.id)
    return {
        "practicePlayers": len(await _practice_entries(db, ch.id)),
        "hereNotInBracket": sum(1 for e in entries if e.status == "confirmed" and e.present and rows and e.id not in inside),
        "freeBye": day._free_bye(rows) is not None if rows else False,
    }

