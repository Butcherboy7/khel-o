"""Team challenges (Valorant 3v3 first): paid team and solo entry, invites,
"My entry", check-in by player, and the admin desk.

Public (no account): the QR image a confirmation email links to.
Signed in: start a payment, confirm it, join the waitlist, join a team with
the captain's link, tap the community/Instagram buttons, see "My entry".
Admin: teams, solos, waitlist, refunds, cancel, check-in, draw, times, results.

Public wording: "challenge", "entry", "slot", "sign up". Never "tournament" or
"ticket" (a payment partner reads the site).
"""
import csv
import io
from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_active_user, require_admin
from app.config import settings
from app.core.exceptions import BaseAppException as AppException
from app.core.logging import logger
from app.database import get_db
from app.models.cafe import Cafe
from app.models.challenge import Challenge, ChallengeEntry, ChallengeMail, ChallengeMatch, ChallengePayment, ChallengePlayer
from app.models.user import User
from app.services import challenge_bracket as bracket
from app.services import challenge_day as day
from app.services import challenge_service as svc
from app.services import challenge_team_mail as team_mail
from app.services import challenge_teams as teams
from app.services import drop_service

public_router = APIRouter(prefix="/challenges", tags=["Team Challenges"])
admin_router = APIRouter(prefix="/admin/challenges", tags=["Admin Team Challenges"])


class _Camel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


def _err(e: teams.TeamError) -> AppException:
    return AppException(message=e.message, error_code=e.code, status_code=e.status)


def _iso(dt: Optional[datetime]) -> Optional[str]:
    return teams._aware(dt).isoformat() if dt else None


async def _team_challenge(db: AsyncSession, slug: str) -> Challenge:
    ch = (await db.execute(select(Challenge).where(Challenge.slug == slug))).scalar_one_or_none()
    if ch is None or not teams.is_team(ch):
        raise AppException(message="No team challenge here", error_code="CHALLENGE_NOT_FOUND", status_code=404)
    return ch


async def _admin_challenge(db: AsyncSession, challenge_id: UUID) -> Challenge:
    ch = await db.get(Challenge, challenge_id)
    if ch is None or not teams.is_team(ch):
        raise AppException(message="No team challenge here", error_code="CHALLENGE_NOT_FOUND", status_code=404)
    return ch


def _player_out(p: ChallengePlayer, *, private: bool) -> dict:
    out = {
        "id": str(p.id),
        "role": p.role,
        "status": p.status,
        "fullName": p.full_name,
        "riotId": p.riot_id,
        "rank": p.rank,
        "joined": p.user_id is not None or p.added_by in ("captain", "admin"),
        "checkedIn": p.checked_in_at is not None,
    }
    if private:
        out.update({
            "phone": p.phone,
            "instagram": p.instagram,
            "college": p.college,
            "playStyle": p.play_style,
            "addedBy": p.added_by,
            "tappedCommunity": p.tapped_community_at is not None,
            "tappedInstaKhelo": p.tapped_insta_khelo_at is not None,
            "tappedInstaVenue": p.tapped_insta_venue_at is not None,
            "isTest": p.is_test,
        })
    return out


# ── No account yet: make one (no password) ────────────────────────────────


class AccountIn(_Camel):
    name: str = Field(..., min_length=2, max_length=60)
    email: str = Field(..., min_length=5, max_length=255)
    phone: str = Field(..., min_length=10, max_length=20)
    utm_source: Optional[str] = Field(None, max_length=80)
    utm_campaign: Optional[str] = Field(None, max_length=80)
    form_ticket: Optional[str] = None
    website: Optional[str] = None


@public_router.post("/{slug}/team/account")
async def quick_account(slug: str, body: AccountIn, request: Request, db: AsyncSession = Depends(get_db)):
    """Step 1 for someone without Google: name, email and WhatsApp number make a
    KHEL-O account with no password (like the Tekken quick sign-up). An email
    that already has an account is refused, never merged: they sign in."""
    import re as _re

    from app.core import bot_guard
    from app.models.user import UserRole
    from app.repositories.user_repository import UserRepository
    from app.services.auth_service import AuthService

    await _team_challenge(db, slug)
    email = body.email.strip().lower()
    if not _re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]{2,}", email):
        raise AppException(message="Enter a valid email.", error_code="BAD_EMAIL", status_code=400)
    try:
        phone = teams.clean_phone(body.phone)
    except teams.TeamError as e:
        raise _err(e)
    try:
        await bot_guard.check(db, request, "challenge", phone, body.form_ticket, body.website)
    except bot_guard.Blocked as blocked:
        raise bot_guard.refusal(blocked.reason)
    users = UserRepository(db)
    if await users.get_by_email(email):
        raise AppException(message="You already have a KHEL-O account with this email. Log in instead.",
                           error_code="EMAIL_ALREADY_EXISTS", status_code=409)
    user = await users.create({
        "email": email, "password_hash": None, "google_id": None, "full_name": " ".join(body.name.split()),
        "phone_number": phone, "role": UserRole.GAMER, "is_active": True,
        "acquisition_source": body.utm_source, "acquisition_campaign": body.utm_campaign,
    })
    auth = AuthService(users)
    await auth._claim_pending_staff_invitations(user)
    access_token, refresh_token = auth.create_tokens(user)
    logger.info("challenge_team_account_made", challenge=slug)
    return {"success": True, "data": {
        "accessToken": access_token, "refreshToken": refresh_token, "user": await auth._user_response_with_roles(user),
    }}


# ── Signed in: pay, waitlist, invite ──────────────────────────────────────


class PlayerIn(_Camel):
    full_name: str = Field("", max_length=60)
    phone: str = Field("", max_length=20)
    riot_id: str = Field("", max_length=40)
    rank: Optional[str] = Field(None, max_length=20)
    instagram: Optional[str] = Field(None, max_length=80)
    college: Optional[str] = Field(None, max_length=100)
    play_style: Optional[str] = Field(None, max_length=20)


class TapsIn(_Camel):
    community: bool = False
    insta_khelo: bool = False
    insta_venue: bool = False


class EntryIn(_Camel):
    kind: Literal["team", "solo"]
    team_name: Optional[str] = Field(None, max_length=40)
    player: PlayerIn
    sub: Optional[PlayerIn] = None
    taps: TapsIn = TapsIn()
    agreed: bool = False


def _payload(body: _Camel) -> dict:
    return body.model_dump(by_alias=True)


@public_router.post("/{slug}/team/pay")
async def start_payment(slug: str, body: EntryIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_active_user)):
    """Hold a slot (team) and make the Razorpay order."""
    ch = await _team_challenge(db, slug)
    try:
        started = await teams.start_payment(db, ch, user, _payload(body))
    except teams.TeamError as e:
        raise _err(e)
    except drop_service.DropError as e:
        raise AppException(message=e.message, error_code=e.code, status_code=503)
    p = started.payment
    logger.info("challenge_team_pay_started", challenge=slug, kind=p.kind)
    return {"success": True, "data": {
        "orderId": p.razorpay_order_id, "amount": float(p.amount), "currency": "INR", "keyId": started.key_id,
        "holdUntil": _iso(p.expires_at), "kind": p.kind,
    }}


@public_router.post("/{slug}/team/pay-offer")
async def start_offer_payment(slug: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_active_user)):
    ch = await _team_challenge(db, slug)
    try:
        started = await teams.start_offer_payment(db, ch, user)
    except teams.TeamError as e:
        raise _err(e)
    except drop_service.DropError as e:
        raise AppException(message=e.message, error_code=e.code, status_code=503)
    p = started.payment
    return {"success": True, "data": {
        "orderId": p.razorpay_order_id, "amount": float(p.amount), "currency": "INR", "keyId": started.key_id,
        "holdUntil": _iso(p.expires_at), "kind": "team",
    }}


class VerifyIn(_Camel):
    razorpay_order_id: str = Field(..., max_length=80)
    razorpay_payment_id: str = Field(..., max_length=80)
    razorpay_signature: str = Field(..., max_length=200)


@public_router.post("/{slug}/team/verify")
async def verify_payment(slug: str, body: VerifyIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_active_user)):
    ch = await _team_challenge(db, slug)
    pay = (await db.execute(select(ChallengePayment).where(
        ChallengePayment.razorpay_order_id == body.razorpay_order_id))).scalar_one_or_none()
    if pay is None or pay.challenge_id != ch.id or pay.user_id != user.id:
        raise AppException(message="We couldn't find this payment.", error_code="PAYMENT_NOT_FOUND", status_code=404)
    if not drop_service.signature_ok(body.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature):
        pay.status = "failed" if pay.status == "created" else pay.status
        await db.commit()
        raise AppException(message="The payment didn't go through. No money was taken. Try again.", error_code="PAYMENT_FAILED", status_code=400)
    try:
        done = await teams.confirm(db, body.razorpay_order_id, body.razorpay_payment_id)
    except teams.TeamError as e:
        raise _err(e)
    if done and done.outcome == "refunded":
        raise AppException(
            message="Sorry, the last team spot was taken while you were paying. Your money is being refunded.",
            error_code="FULL_REFUNDED", status_code=409)
    logger.info("challenge_team_paid", challenge=slug, kind=pay.kind)
    return {"success": True, "data": await _me(db, ch, user)}


@public_router.post("/{slug}/team/waitlist")
async def join_waitlist(slug: str, body: EntryIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_active_user)):
    ch = await _team_challenge(db, slug)
    try:
        await teams.join_waitlist(db, ch, user, _payload(body))
    except teams.TeamError as e:
        raise _err(e)
    return {"success": True, "data": await _me(db, ch, user)}


@public_router.get("/{slug}/team/invite/{code}/peek")
async def invite_peek(slug: str, code: str, db: AsyncSession = Depends(get_db)):
    """What a teammate sees BEFORE logging in: the team, the captain's first name, how many are in.
    No personal details. A bad or dead link says so here instead of after the login."""
    ch = await _team_challenge(db, slug)
    try:
        entry = await teams.entry_by_code(db, ch, code)
    except teams.TeamError as e:
        raise _err(e)
    cfg = teams.config(ch)
    team = [p for p in await teams.players(db, ch.id) if p.entry_id == entry.id and p.status in ("active", "waitlist")]
    main, subs = teams._team_counts(cfg, team)
    captain = next((p for p in team if p.role == "captain"), None)
    return {"success": True, "data": {
        "teamName": entry.name,
        "captain": captain.full_name.split()[0] if captain else None,
        "players": main,
        "size": cfg["size"],
        "full": main >= cfg["size"] and subs >= cfg["maxSubs"],
        "mainFull": main >= cfg["size"],
    }}


@public_router.get("/{slug}/team/invite/{code}")
async def invite_info(slug: str, code: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_active_user)):
    """Who invited them: the team name, the captain, and how many are in."""
    ch = await _team_challenge(db, slug)
    try:
        entry = await teams.entry_by_code(db, ch, code)
    except teams.TeamError as e:
        raise _err(e)
    cfg = teams.config(ch)
    team = [p for p in await teams.players(db, ch.id) if p.entry_id == entry.id and p.status in ("active", "waitlist")]
    main, subs = teams._team_counts(cfg, team)
    captain = next((p for p in team if p.role == "captain"), None)
    mine = await teams.player_for(db, ch.id, user.id)
    return {"success": True, "data": {
        "teamName": entry.name,
        "captain": captain.full_name.split()[0] if captain else None,
        "players": main,
        "size": cfg["size"],
        "subs": subs,
        "maxSubs": cfg["maxSubs"],
        "full": main >= cfg["size"] and subs >= cfg["maxSubs"],
        "mainFull": main >= cfg["size"],
        "alreadyIn": mine is not None and mine.status in ("active", "waitlist"),
        "alreadyInThisTeam": mine is not None and mine.entry_id == entry.id,
        "phonePrefill": (user.phone_number or "")[-10:] if user.phone_number else "",
        "namePrefill": user.full_name or "",
    }}


class JoinTeamIn(_Camel):
    player: PlayerIn
    as_sub: bool = False
    taps: TapsIn = TapsIn()
    agreed: bool = False


async def _safe(coro) -> None:
    """Run a notification; a mail problem never undoes what the admin just did."""
    try:
        await coro
    except Exception as exc:
        logger.warning("challenge_team_mail_failed", error=str(exc)[:200])


async def _tell_team(db: AsyncSession, ch: Challenge, joined: ChallengePlayer) -> None:
    """Welcome + 'a teammate joined' emails. A mail problem never undoes the join."""
    try:
        await team_mail.notify_teammate_joined(db, ch, joined)
    except Exception as exc:
        logger.warning("challenge_team_mail_failed", error=str(exc)[:200])


@public_router.post("/{slug}/team/invite/{code}")
async def join_with_invite(slug: str, code: str, body: JoinTeamIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_active_user)):
    ch = await _team_challenge(db, slug)
    try:
        joined = await teams.join_team(db, ch, user, code, _payload(body))
    except teams.TeamError as e:
        raise _err(e)
    await _tell_team(db, ch, joined)
    logger.info("challenge_team_member_joined", challenge=slug)
    return {"success": True, "data": await _me(db, ch, user)}


@public_router.post("/{slug}/team/me/teammates")
async def captain_adds_teammate(slug: str, body: JoinTeamIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_active_user)):
    """The captain types in a teammate who hasn't joined with the link."""
    ch = await _team_challenge(db, slug)
    me = await teams.player_for(db, ch.id, user.id)
    if me is None or me.role != "captain" or me.entry_id is None:
        raise AppException(message="Only the team captain can add teammates.", error_code="NOT_CAPTAIN", status_code=403)
    try:
        joined = await teams.join_team(db, ch, None, None, _payload(body), entry_id=me.entry_id, by="captain")
    except teams.TeamError as e:
        raise _err(e)
    await _tell_team(db, ch, joined)
    return {"success": True, "data": await _me(db, ch, user)}


class TapIn(_Camel):
    which: Literal["community", "instaKhelo", "instaVenue"]


@public_router.post("/{slug}/team/me/tap")
async def tap(slug: str, body: TapIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_active_user)):
    ch = await _team_challenge(db, slug)
    await teams.tap(db, ch, user, body.which)
    return {"success": True}


@public_router.get("/{slug}/team/me")
async def my_entry(slug: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_active_user)):
    ch = await _team_challenge(db, slug)
    return {"success": True, "data": await _me(db, ch, user)}


async def _me(db: AsyncSession, ch: Challenge, user: User) -> dict:
    """Everything "My entry" shows: their team, teammates, QR, match times."""
    cfg = teams.config(ch)
    me = await teams.player_for(db, ch.id, user.id)
    pending = (await db.execute(select(ChallengePayment).where(
        ChallengePayment.challenge_id == ch.id, ChallengePayment.user_id == user.id,
        ChallengePayment.status == "created", ChallengePayment.expires_at > teams.now(),
    ).order_by(ChallengePayment.created_at.desc()))).scalars().first()
    out: dict = {"player": None, "team": None, "matches": [], "pending": None}
    if pending is not None:
        out["pending"] = {"kind": pending.kind, "holdUntil": _iso(pending.expires_at)}
    if me is None:
        return out
    out["player"] = {**_player_out(me, private=True), "qr": None, "checkinUrl": None}
    if me.status == "active":
        url = teams.checkin_url(ch, me)
        out["player"]["checkinUrl"] = url
        out["player"]["qr"] = day.qr_data_url(url)
    pay = (await db.execute(select(ChallengePayment).where(
        ChallengePayment.challenge_id == ch.id, ChallengePayment.user_id == user.id,
        ChallengePayment.status.in_(("paid", "refunded"))).order_by(ChallengePayment.created_at.desc()))).scalars().first()
    if pay is not None:
        out["payment"] = {"amount": float(pay.amount), "status": pay.status, "paymentId": pay.razorpay_payment_id,
                          "paidAt": _iso(pay.paid_at), "refundedAt": _iso(pay.refunded_at)}
    if me.entry_id:
        entry = await svc.entry_for(db, ch.id, entry_id=me.entry_id)
        mates = [p for p in await teams.players(db, ch.id) if p.entry_id == entry.id and p.status in ("active", "waitlist")]
        main, subs = teams._team_counts(cfg, mates)
        base = settings.FRONTEND_URL.rstrip("/")
        out["team"] = {
            "id": str(entry.id),
            "name": entry.name,
            "kind": entry.kind,
            "status": entry.status,
            "number": entry.position,
            "offered": entry.offered_at is not None,
            "players": main,
            "size": cfg["size"],
            "subs": subs,
            "maxSubs": cfg["maxSubs"],
            "inviteUrl": f"{base}/challenge/{ch.slug}/invite/{entry.invite_code}" if me.role == "captain" and entry.invite_code else None,
            "members": [_player_out(p, private=(me.role == "captain" or p.user_id == user.id)) for p in mates],
            "present": entry.present,
        }
        rows = await day.matches(db, ch.id)
        total = teams.rounds_of(rows)
        names = {e.id: e.name for e in await svc.entries(db, ch.id)}
        for m in sorted((m for m in rows if entry.id in (m.entry_a_id, m.entry_b_id) and not m.bye),
                        key=lambda m: (m.round, m.position)):
            other = m.entry_b_id if m.entry_a_id == entry.id else m.entry_a_id
            out["matches"].append({
                "round": bracket.round_name(m.round, total),
                "startsAt": _iso(m.starts_at), "lobby": m.lobby, "bestOf": teams.best_of(ch, total, m),
                "against": names.get(other) if other else None,
                "won": None if m.winner_entry_id is None else m.winner_entry_id == entry.id,
            })
    return out


@public_router.get("/{slug}/players/{token}/qr.png")
async def player_qr(slug: str, token: str, db: AsyncSession = Depends(get_db)):
    """The check-in QR as an image (for the email). The token is signed per player."""
    ch = await _team_challenge(db, slug)
    pid = teams.player_id_from_token(token)
    p = await db.get(ChallengePlayer, pid) if pid else None
    if p is None or p.challenge_id != ch.id:
        raise AppException(message="No QR here", error_code="BAD_TOKEN", status_code=404)
    import base64
    data = day.qr_data_url(teams.checkin_url(ch, p)).split(",", 1)[1]
    return Response(content=base64.b64decode(data), media_type="image/png", headers={"Cache-Control": "private, max-age=86400"})


# ── The desk: scan a player's QR ──────────────────────────────────────────


class CheckinIn(_Camel):
    present: bool = True


@public_router.post("/{slug}/players/{token}/checkin")
async def desk_checkin(slug: str, token: str, body: CheckinIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_active_user)):
    from app.api.v1.challenges import _can_run_door

    ch = await _team_challenge(db, slug)
    if not await _can_run_door(db, user, ch):
        raise AppException(message="Only KHEL-O staff or the café can check players in", error_code="NOT_DOOR_STAFF", status_code=403)
    pid = teams.player_id_from_token(token)
    p = await db.get(ChallengePlayer, pid) if pid else None
    if p is None or p.challenge_id != ch.id:
        raise AppException(message="This QR isn't for this challenge", error_code="BAD_CHECKIN_CODE", status_code=404)
    already = p.checked_in_at is not None
    if already != body.present:
        await teams.set_checked_in(db, ch, p, body.present)
    entry = await svc.entry_for(db, ch.id, entry_id=p.entry_id) if p.entry_id else None
    return {"success": True, "data": {
        **_player_out(p, private=True), "already": already, "teamName": entry.name if entry else None,
    }}


# ── Admin ─────────────────────────────────────────────────────────────────


async def _desk(db: AsyncSession, ch: Challenge) -> dict:
    cafe = await db.get(Cafe, ch.cafe_id)
    ppl = await teams.players(db, ch.id)
    entries = await teams.team_entries(db, ch.id)
    pays = (await db.execute(select(ChallengePayment).where(ChallengePayment.challenge_id == ch.id)
                             .order_by(ChallengePayment.created_at))).scalars().all()
    pay_by_entry = {p.entry_id: p for p in pays if p.entry_id and p.status in ("paid", "refunded")}
    pay_by_player = {p.player_id: p for p in pays if p.player_id}
    cfg = teams.config(ch)
    nudges = (await db.execute(select(ChallengeMail).where(
        ChallengeMail.challenge_id == ch.id, ChallengeMail.kind.like("nudge%")).order_by(ChallengeMail.sent_at))).scalars().all()
    last_nudge = {m.player_id: m.sent_at for m in nudges}

    numbers = teams.team_numbers(ch, entries)
    uids = {p.user_id for p in ppl if p.user_id}
    emails = {u.id: u.email for u in (await db.execute(select(User).where(User.id.in_(uids)))).scalars().all()} if uids else {}

    def pl(p: ChallengePlayer) -> dict:
        return {**_player_out(p, private=True), "email": emails.get(p.user_id)}

    def team_out(e: ChallengeEntry) -> dict:
        mates = [p for p in ppl if p.entry_id == e.id]
        live = [p for p in mates if p.status in ("active", "waitlist")]
        main, subs = teams._team_counts(cfg, live)
        pay = pay_by_entry.get(e.id)
        cap = next((p for p in live if p.role == "captain"), None)
        return {
            "id": str(e.id), "name": e.name, "kind": e.kind, "status": e.status, "number": numbers.get(str(e.id)),
            "size": cfg["size"], "players": main, "subs": subs, "present": e.present, "offered": e.offered_at is not None,
            "inviteCode": e.invite_code, "isTest": e.is_test,
            "paid": pay is not None and pay.status == "paid", "refunded": pay is not None and pay.status == "refunded",
            "amount": float(pay.amount) if pay else None, "paidAt": _iso(pay.paid_at) if pay else None,
            "paymentId": pay.razorpay_payment_id if pay else None,
            "members": [pl(p) for p in mates],
            "checkedIn": sum(1 for p in live if p.checked_in_at),
            "captain": ({"name": cap.full_name, "phone": cap.phone, "email": emails.get(cap.user_id)} if cap else None),
            "lastRemindedAt": _iso(last_nudge.get(cap.id)) if cap else None,
        }

    solos = [p for p in ppl if p.role == "solo" and p.entry_id is None]
    return {
        "challenge": {"id": str(ch.id), "slug": ch.slug, "title": ch.title, "status": ch.status,
                      "drawnAt": _iso(ch.drawn_at), "startsAt": _iso(ch.starts_at), "cafe": cafe.name,
                      "drawSeed": (teams.config(ch) or {}).get("drawSeed")},
        "stats": await teams.stats(db, ch),
        "practiceAllowed": _practice_ok(),
        "practicePlayers": sum(1 for p in ppl if p.is_test),
        "rewards": await _rewards(db, ch, entries),
        "config": {k: cfg[k] for k in ("size", "maxSubs", "priceTeam", "priceSolo", "maxTeams", "minTeams")},
        "teams": [team_out(e) for e in entries if e.status == "confirmed"],
        "waitlist": [team_out(e) for e in entries if e.status == "waitlist"],
        "removed": [team_out(e) for e in entries if e.status not in ("confirmed", "waitlist")],
        "solos": [{**pl(p),
                   "paid": (pay_by_player.get(p.id) is not None and pay_by_player[p.id].status == "paid"),
                   "refunded": (pay_by_player.get(p.id) is not None and pay_by_player[p.id].status == "refunded")}
                  for p in solos],
        "money": {
            "paid": float(sum(p.amount for p in pays if p.status == "paid")),
            "refunded": float(sum(p.amount for p in pays if p.status == "refunded")),
            "payments": sum(1 for p in pays if p.status == "paid"),
        },
    }


def _practice_ok() -> bool:
    from app.api.v1.challenges import _practice_allowed
    return _practice_allowed()


async def _rewards(db: AsyncSession, ch: Challenge, entries: list[ChallengeEntry]) -> dict:
    """Who earned what, read from the bracket: the final decides Top and Second team, the other
    two semi-finalists (the teams that lost in the semi-finals) are the coupon teams. Empty until
    the final has a result."""
    rows = (await db.execute(select(ChallengeMatch).where(ChallengeMatch.challenge_id == ch.id))).scalars().all()
    real = [m for m in rows if not m.bye and not m.is_third_place]
    if not real:
        return {"ready": False}
    last = max(m.round for m in real)
    final = next((m for m in real if m.round == last), None)
    by_id = {e.id: e for e in entries}

    def team(eid):
        e = by_id.get(eid)
        return {"id": str(e.id), "name": e.name} if e else None

    if final is None or final.winner_entry_id is None:
        return {"ready": False}
    second_id = final.entry_b_id if final.winner_entry_id == final.entry_a_id else final.entry_a_id
    semis = []
    for m in real:
        if m.round == last - 1 and m.winner_entry_id:
            loser = m.entry_b_id if m.winner_entry_id == m.entry_a_id else m.entry_a_id
            if loser:
                semis.append(team(loser))
    return {"ready": True, "top": team(final.winner_entry_id), "second": team(second_id), "semis": [t for t in semis if t]}


@admin_router.get("/{challenge_id}/teams")
async def admin_desk(challenge_id: UUID, db: AsyncSession = Depends(get_db), _admin=Depends(require_admin)):
    ch = await _admin_challenge(db, challenge_id)
    return {"success": True, "data": await _desk(db, ch)}


@admin_router.get("/{challenge_id}/links")
async def admin_links(challenge_id: UUID, db: AsyncSession = Depends(get_db), _admin=Depends(require_admin)):
    """Per posted link: people who opened this challenge page, who tapped Sign up,
    and who paid. A visit is tagged with the link it came from (utm), so this
    groups by campaign (or source, or 'direct'). Our own devices are left out."""
    from app.models.analytics_event import AnalyticsEvent
    from app.models.challenge import ChallengePlayer

    ch = await _admin_challenge(db, challenge_id)
    rows = (await db.execute(
        select(AnalyticsEvent.session_id, AnalyticsEvent.user_id, AnalyticsEvent.event_metadata)
        .where(
            AnalyticsEvent.event_type == "ui_action",
            AnalyticsEvent.event_metadata["challenge"].as_string() == ch.slug,
            AnalyticsEvent.created_at >= ch.created_at,
        ).order_by(AnalyticsEvent.created_at)
    )).all()
    internal = {sid for sid, _u, m in rows if isinstance(m, dict) and m.get("internal")}
    label_of: dict[str, str] = {}
    sessions: dict[str, dict] = {}
    user_label: dict = {}
    for sid, uid, m in rows:
        if sid in internal or not isinstance(m, dict):
            continue
        u = m.get("utm") if isinstance(m.get("utm"), dict) else {}
        label = u.get("c") or u.get("s") or "direct"
        label_of.setdefault(sid, label)  # first tag seen wins
        st = sessions.setdefault(sid, {"opened": False, "tapped": False})
        action = m.get("action")
        if action == "challenge_page_view":
            st["opened"] = True
        if action == "challenge_signup_started":
            st["tapped"] = True
        if uid:
            user_label.setdefault(uid, label_of[sid])

    pays = (await db.execute(select(ChallengePayment).where(
        ChallengePayment.challenge_id == ch.id, ChallengePayment.status == "paid"))).scalars().all()
    paid_entries = {p.entry_id for p in pays if p.entry_id}
    paid_players = {p.player_id for p in pays if p.player_id}
    ppl = (await db.execute(select(ChallengePlayer).where(
        ChallengePlayer.challenge_id == ch.id, ChallengePlayer.status.in_(("active", "waitlist")),
        ChallengePlayer.role.in_(("captain", "solo"))))).scalars().all()

    out: dict[str, dict] = {}

    def row(label: str) -> dict:
        return out.setdefault(label, {"link": label, "opened": 0, "tapped": 0, "paid": 0})

    for sid, st in sessions.items():
        r = row(label_of[sid])
        r["opened"] += 1 if st["opened"] else 0
        r["tapped"] += 1 if st["tapped"] else 0
    for pl in ppl:
        if pl.user_id is None or not (pl.entry_id in paid_entries or pl.id in paid_players):
            continue
        row(user_label.get(pl.user_id, "not tracked"))["paid"] += 1
    links = sorted(out.values(), key=lambda r: (-r["opened"], -r["paid"]))
    return {"success": True, "data": {"links": links}}


@admin_router.post("/{challenge_id}/teams/practice")
async def admin_fill_practice_teams(challenge_id: UUID, db: AsyncSession = Depends(get_db), _admin=Depends(require_admin)):
    """Dev only: whole made-up teams (3 players with Riot IDs), one short team and two solos."""
    from app.api.v1.challenges import _refuse_practice_on_prod
    from app.services import challenge_team_practice as practice
    _refuse_practice_on_prod()
    ch = await _admin_challenge(db, challenge_id)
    if ch.drawn_at is not None:
        raise AppException(message="The draw is done. Clear the practice teams first to start again.", error_code="ALREADY_DRAWN", status_code=400)
    made = await practice.fill(db, ch)
    logger.info("challenge_team_practice_fill", challenge=str(challenge_id), **made)
    return {"success": True, "data": {**await _desk(db, ch), "made": made}}


@admin_router.delete("/{challenge_id}/teams/practice")
async def admin_clear_practice_teams(challenge_id: UUID, db: AsyncSession = Depends(get_db), _admin=Depends(require_admin)):
    from app.api.v1.challenges import _refuse_practice_on_prod
    from app.services import challenge_team_practice as practice
    _refuse_practice_on_prod()
    ch = await _admin_challenge(db, challenge_id)
    removed = await practice.clear(db, ch)
    return {"success": True, "data": {**await _desk(db, ch), "removed": removed}}


@admin_router.get("/{challenge_id}/teams.csv")
async def admin_csv(challenge_id: UUID, db: AsyncSession = Depends(get_db), _admin=Depends(require_admin)):
    ch = await _admin_challenge(db, challenge_id)
    entries = {e.id: e for e in await teams.team_entries(db, ch.id)}
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["team #", "team", "team status", "role", "status", "name", "phone", "email", "riot id", "rank", "instagram",
                "college", "play style", "community tapped", "insta khelo tapped", "insta venue tapped", "checked in",
                "team paid (Rs)", "paid at", "payment id"])
    numbers = teams.team_numbers(ch, list(entries.values()))
    pays = (await db.execute(select(ChallengePayment).where(ChallengePayment.challenge_id == ch.id,
                                                            ChallengePayment.status == "paid"))).scalars().all()
    pay_by_entry = {p.entry_id: p for p in pays if p.entry_id}
    pay_by_player = {p.player_id: p for p in pays if p.player_id}
    plist = await teams.players(db, ch.id)
    uids = {p.user_id for p in plist if p.user_id}
    emails = {u.id: u.email for u in (await db.execute(select(User).where(User.id.in_(uids)))).scalars().all()} if uids else {}
    for p in plist:
        e = entries.get(p.entry_id)
        pay = pay_by_entry.get(p.entry_id) if (e and p.role == "captain") else pay_by_player.get(p.id)
        w.writerow([numbers.get(str(e.id), "") if e else "", e.name if e else "(solo, no team)", e.status if e else "", p.role, p.status,
                    p.full_name, p.phone, emails.get(p.user_id, ""), p.riot_id, p.rank or "", p.instagram or "", p.college or "",
                    teams.PLAY_STYLES.get(p.play_style or "", ""),
                    "yes" if p.tapped_community_at else "", "yes" if p.tapped_insta_khelo_at else "",
                    "yes" if p.tapped_insta_venue_at else "", "yes" if p.checked_in_at else "",
                    int(pay.amount) if pay else "", pay.paid_at.isoformat() if pay and pay.paid_at else "",
                    pay.razorpay_payment_id if pay else ""])
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": f'attachment; filename="{ch.slug}-players.csv"'})


class MakeTeamIn(_Camel):
    player_ids: list[UUID] = Field(..., min_length=1, max_length=3)
    name: Optional[str] = Field(None, max_length=40)


@admin_router.post("/{challenge_id}/teams/solo-team")
async def admin_make_team(challenge_id: UUID, body: MakeTeamIn, db: AsyncSession = Depends(get_db), _admin=Depends(require_admin)):
    ch = await _admin_challenge(db, challenge_id)
    try:
        await teams.make_solo_team(db, ch, body.player_ids, body.name)
    except teams.TeamError as e:
        raise _err(e)
    await _safe(team_mail.notify_placed(db, ch, body.player_ids))
    return {"success": True, "data": await _desk(db, ch)}


class PlaceIn(_Camel):
    player_id: UUID
    entry_id: UUID


@admin_router.post("/{challenge_id}/teams/place-solo")
async def admin_place_solo(challenge_id: UUID, body: PlaceIn, db: AsyncSession = Depends(get_db), _admin=Depends(require_admin)):
    ch = await _admin_challenge(db, challenge_id)
    try:
        await teams.place_solo(db, ch, body.player_id, body.entry_id)
    except teams.TeamError as e:
        raise _err(e)
    await _safe(team_mail.notify_placed(db, ch, [body.player_id]))
    return {"success": True, "data": await _desk(db, ch)}


class OfferIn(_Camel):
    on: bool = True


@admin_router.post("/{challenge_id}/teams/{entry_id}/offer")
async def admin_offer(challenge_id: UUID, entry_id: UUID, body: OfferIn, db: AsyncSession = Depends(get_db), _admin=Depends(require_admin)):
    ch = await _admin_challenge(db, challenge_id)
    try:
        await teams.offer_slot(db, ch, entry_id, body.on)
    except teams.TeamError as e:
        raise _err(e)
    if body.on:
        await _safe(team_mail.notify_offer(db, ch, entry_id))
    return {"success": True, "data": await _desk(db, ch)}


@admin_router.post("/{challenge_id}/teams/remind-captains")
async def admin_remind_captains(challenge_id: UUID, db: AsyncSession = Depends(get_db), _admin=Depends(require_admin)):
    """Email the captain of every team that is still short of players."""
    ch = await _admin_challenge(db, challenge_id)
    result = await team_mail.remind_captains(db, ch)
    return {"success": True, "data": {**await _desk(db, ch), "remindResult": result}}


@admin_router.post("/{challenge_id}/teams/{entry_id}/remind")
async def admin_remind_one(challenge_id: UUID, entry_id: UUID, db: AsyncSession = Depends(get_db), _admin=Depends(require_admin)):
    ch = await _admin_challenge(db, challenge_id)
    result = await team_mail.remind_captains(db, ch, entry_id)
    return {"success": True, "data": {**await _desk(db, ch), "remindResult": result}}


class ReasonIn(_Camel):
    reason: str = Field("Refund by KHEL-O", max_length=120)


@admin_router.post("/{challenge_id}/teams/players/{player_id}/refund")
async def admin_refund_solo(challenge_id: UUID, player_id: UUID, body: ReasonIn, db: AsyncSession = Depends(get_db), _admin=Depends(require_admin)):
    ch = await _admin_challenge(db, challenge_id)
    try:
        await teams.refund_player(db, ch, player_id, body.reason)
    except teams.TeamError as e:
        raise _err(e)
    gone = await db.get(ChallengePlayer, player_id)
    if gone is not None:
        await _safe(team_mail.notify_refunded_player(db, ch, gone, body.reason))
    return {"success": True, "data": await _desk(db, ch)}


@admin_router.post("/{challenge_id}/teams/{entry_id}/refund")
async def admin_refund_team(challenge_id: UUID, entry_id: UUID, body: ReasonIn, db: AsyncSession = Depends(get_db), _admin=Depends(require_admin)):
    ch = await _admin_challenge(db, challenge_id)
    try:
        await teams.refund_team(db, ch, entry_id, body.reason)
    except teams.TeamError as e:
        raise _err(e)
    await _safe(team_mail.notify_refunded_entry(db, ch, entry_id, body.reason))
    return {"success": True, "data": await _desk(db, ch)}


class CancelIn(_Camel):
    reason: str = Field(..., min_length=3, max_length=120)
    confirm: Literal["CANCEL"]


@admin_router.post("/{challenge_id}/teams/cancel-all")
async def admin_cancel_all(challenge_id: UUID, body: CancelIn, db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    ch = await _admin_challenge(db, challenge_id)
    result = await teams.cancel_and_refund_all(db, ch, body.reason)
    logger.warning("challenge_team_cancelled", challenge=str(challenge_id), **result)
    ch = await _admin_challenge(db, challenge_id)
    await _safe(team_mail.notify_cancelled(db, ch, body.reason))
    return {"success": True, "data": {**await _desk(db, ch), "cancelResult": result}}


class AdminCheckinIn(_Camel):
    present: bool = True


@admin_router.post("/{challenge_id}/teams/players/{player_id}/checkin")
async def admin_checkin(challenge_id: UUID, player_id: UUID, body: AdminCheckinIn, db: AsyncSession = Depends(get_db), _admin=Depends(require_admin)):
    ch = await _admin_challenge(db, challenge_id)
    p = await db.get(ChallengePlayer, player_id)
    if p is None or p.challenge_id != ch.id:
        raise AppException(message="No such player", error_code="BAD_PLAYER", status_code=404)
    await teams.set_checked_in(db, ch, p, body.present)
    return {"success": True, "data": await _desk(db, ch)}


class DrawIn(_Camel):
    redo: bool = False
    early_ok: bool = False  # "Draw anyway" while sign-ups are still open


@admin_router.post("/{challenge_id}/teams/draw")
async def admin_draw(challenge_id: UUID, body: DrawIn, db: AsyncSession = Depends(get_db), _admin=Depends(require_admin)):
    ch = await _admin_challenge(db, challenge_id)
    try:
        n = await teams.draw(db, ch, redo=body.redo, early_ok=body.early_ok)
    except teams.TeamError as e:
        await db.rollback()
        raise _err(e)
    logger.info("challenge_team_draw", challenge=str(challenge_id), teams=n)
    await _safe(team_mail.notify_draw(db, ch))
    return {"success": True, "data": {"teams": n}}


@admin_router.post("/{challenge_id}/teams/matches/{match_id}/clear")
async def admin_clear_result(challenge_id: UUID, match_id: UUID, db: AsyncSession = Depends(get_db), _admin=Depends(require_admin)):
    """Undo a result typed by mistake. Only when the next match has no result yet."""
    ch = await _admin_challenge(db, challenge_id)
    try:
        await day.clear_result(db, ch.id, match_id)
    except day.DayError as e:
        raise AppException(message=e.message, error_code=e.code, status_code=409)
    m = await db.get(ChallengeMatch, match_id)
    if m is not None:
        m.games = None
        await db.commit()
    return {"success": True, "data": None}


class TimeIn(_Camel):
    starts_at: Optional[datetime] = None
    lobby: Optional[Literal["A", "B", "C", "D"]] = None


@admin_router.post("/{challenge_id}/teams/matches/{match_id}/time")
async def admin_match_time(challenge_id: UUID, match_id: UUID, body: TimeIn, db: AsyncSession = Depends(get_db), _admin=Depends(require_admin)):
    ch = await _admin_challenge(db, challenge_id)
    try:
        await teams.set_match_time(db, ch, match_id, body.starts_at, body.lobby)
    except teams.TeamError as e:
        raise _err(e)
    changed = await db.get(ChallengeMatch, match_id)
    if changed is not None:
        await _safe(team_mail.notify_match(db, ch, changed))
    return {"success": True}


class GameIn(BaseModel):
    a: Optional[int] = Field(None, ge=0, le=10)
    b: Optional[int] = Field(None, ge=0, le=10)


class TeamResultIn(_Camel):
    winner: Literal["a", "b"]
    games: list[GameIn] = Field(default_factory=list, max_length=3)


@admin_router.post("/{challenge_id}/teams/matches/{match_id}/result")
async def admin_team_result(challenge_id: UUID, match_id: UUID, body: TeamResultIn, db: AsyncSession = Depends(get_db), _admin=Depends(require_admin)):
    ch = await _admin_challenge(db, challenge_id)
    try:
        await teams.record_result(db, ch, match_id, body.winner, [g.model_dump() for g in body.games])
    except teams.TeamError as e:
        await db.rollback()
        raise _err(e)
    return {"success": True}
