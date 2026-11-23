"""DEV ONLY: XQZ Hyderabad café + the Valorant 3v3 Challenge (team, paid).

Creates (once; a second run only refreshes the challenge settings):
- an owner account for Shashank with NO password (it can't be logged into;
  the real onboarding on prod gives the owner their own login),
- the café "XQZ Hyderabad" (Gachibowli), verified and bookable, with its PCs,
  PS5s and racing sims from the owner's onboarding form,
- the challenge `valorant-3v3-xqz`, open, Sat 5 Dec 2026, 8 team slots.

The page text lives in the frontend config (frontend/src/challenges/
valorant-3v3-xqz.ts). This row holds what the server must enforce: prices,
slots, hold time, sign-up close time.

Refuses to run on production.

Usage (dev): bash scripts/ops/dev_python.sh backend/scripts/seed_valorant_xqz.py
"""
import asyncio
import sys
import uuid
from datetime import datetime, time, timedelta, timezone
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import select  # noqa: E402

from app.config import settings  # noqa: E402
from app.database import AsyncSessionLocal  # noqa: E402
from app.models.cafe import Cafe, VerificationStatus  # noqa: E402
from app.models.challenge import Challenge  # noqa: E402
from app.models.hardware_tier import HardwareTier, PlatformType  # noqa: E402
from app.models.user import User, UserRole  # noqa: E402
from app.models.user_role import UserRoleMapping  # noqa: E402

IST = timezone(timedelta(hours=5, minutes=30))
OWNER_EMAIL = "xqz.hyd@gmail.com"
SLUG = "valorant-3v3-xqz"

RULES_MD = """**Teams**
1. Each team has 3 players. You can add 1 substitute when you sign up.
2. The players who play must be the ones who signed up. We check names at check-in.
3. A team can change players only by using its registered substitute.

**Accounts**
4. Use your own Riot account. All ranks are allowed.
5. Keep your phone with you. Riot may send a login code to your email.
6. Log in before your match time. Login problems do not stop the clock.

**Match format**
7. Mode: Swift Play, 5v5. First team to win 5 rounds wins the game.
8. Round of 16 and quarterfinals: 1 game.
9. Semifinals and final: best of 3 games. First to win 2 games wins.
10. 1-game matches: coin toss. The team that wins the toss picks the map.
11. Best of 3: the team that wins the coin toss picks the first map. The team that lost game 1 picks the second map. The last map is game 3.

**Time**
12. Report at XQZ by 11:00 AM. Check-in closes at 11:45 AM.
13. Your match starts at the time in the bracket. If your team is not seated 5 minutes after that time, you lose the match.
14. If only 2 players are there, you can play 2 vs 3 or use your substitute. You cannot wait.

**During the game**
15. Each team gets 1 pause per game, up to 5 minutes, only for a PC or internet problem.
16. If a player disconnects in the first 2 rounds, the game restarts. After that, the game continues. If they cannot come back in 5 minutes, the team plays 2 vs 3.
17. If the power or internet goes off for everyone, the game is played again from 0-0.
18. No cheats, scripts, macros or changing cafe PC settings. You will be removed with no refund.
19. No abuse of players or staff. You will be removed with no refund.
20. The admin's decision is final.

**Rewards**
21. Before rewards are given, we check the players match the sign-up names.
22. Rewards go to the team captain on the same day. The team shares them.
"""

TEAM = {
    "size": 5,
    "maxSubs": 1,
    "priceTeam": 1250,
    "priceSolo": 250,
    "holdMinutes": 10,
    "maxTeams": 8,
    "minTeams": 4,
    "slotMinutes": 20,
    "bo3Minutes": 50,
    "bo3RoundsLeft": 2,
    "gameTo": 5,
    "lobbies": 1,
    "registrationClosesAt": "2026-12-03T21:00:00+05:30",
    "teammatesBy": "2026-12-03T21:00:00+05:30",
}


async def main() -> None:
    if settings.ENVIRONMENT == "production":
        print("REFUSED: this script is for the dev server only.")
        return
    async with AsyncSessionLocal() as db:
        owner = (await db.execute(select(User).where(User.email == OWNER_EMAIL))).scalar_one_or_none()
        if owner is None:
            owner = User(id=uuid.uuid4(), email=OWNER_EMAIL, phone_number="+918179717676", password_hash=None,
                         full_name="Shashank", role=UserRole.CAFE_OWNER, is_active=True)
            db.add(owner)
            db.add(UserRoleMapping(id=uuid.uuid4(), user_id=owner.id, role=UserRole.GAMER, cafe_id=None))
            db.add(UserRoleMapping(id=uuid.uuid4(), user_id=owner.id, role=UserRole.CAFE_OWNER, cafe_id=None))
            await db.flush()
            print("created owner account (no password)")

        cafe = (await db.execute(select(Cafe).where(Cafe.owner_id == owner.id))).scalars().first()
        if cafe is None:
            cafe = Cafe(
                id=uuid.uuid4(), owner_id=owner.id, name="XQZ Hyderabad", slug="xqz-hyderabad",
                description=("20 gaming PCs, 4 PS5s, 3 VR setups and 4 racing simulators in Gachibowli. "
                             "PC games: Valorant, CS2, Dota 2, Apex Legends, League of Legends, Marvel Rivals, PUBG. "
                             "PC packages of 3, 5, 25 and 100 hours. Walk-ins welcome."),
                address_line1="Third Floor, Sri Thirumala Platinum, Janardana Hills",
                address_line2="Lumbini Avenue, Gachibowli",
                city="Hyderabad", state="Telangana", pincode="500032",
                google_maps_url="https://www.google.com/maps/search/?api=1&query=XQZ+Hyderabad+Sri+Thirumala+Platinum+Gachibowli",
                phone_number="+918179717676", email=OWNER_EMAIL,
                opening_time=time(10, 0), closing_time=time(22, 0),
                verification_status=VerificationStatus.VERIFIED, is_active=True, is_lead_listing=False,
                total_seats=31, app_bookable_seats=28, bookable_stations=28,
                amenities=["Air Conditioning", "High-Speed Wi-Fi", "Ergonomic Chairs", "Snacks & Beverages"],
                photos=[], supported_games={"titles": ["Valorant", "CS2", "Dota 2", "Apex Legends", "League of Legends", "Marvel Rivals", "PUBG"]},
                menu_photos=[], house_rules=[], social_links={},
            )
            db.add(cafe)
            await db.flush()
            for t in (
                dict(name="Gaming PC", platform=PlatformType.PC, price_per_hour=200, total_seats=20, app_bookable_seats=20,
                     description="Rs 200/hr. Packages: 3, 5, 25 and 100 hours."),
                dict(name="PS5 Premium Zone", platform=PlatformType.PLAYSTATION, price_per_hour=300, total_seats=2, app_bookable_seats=2,
                     description="Rs 150 per controller, Rs 300/hr."),
                dict(name="PS5 Bean Bag Zone", platform=PlatformType.PLAYSTATION, price_per_hour=200, total_seats=2, app_bookable_seats=2,
                     description="Rs 100 per controller, Rs 200/hr."),
                dict(name="Racing Simulator", tier_type="activity", activity_kind="Racing Simulator", price_per_hour=1000,
                     price_15m=350, price_30m=600, min_booking_minutes=15, total_seats=4, app_bookable_seats=4,
                     description="15 min Rs 350, 30 min Rs 600, 1 hr Rs 1000. Happy hours Mon-Thu: 30 min Rs 400."),
            ):
                db.add(HardwareTier(id=uuid.uuid4(), cafe_id=cafe.id, **t))
            print("created cafe XQZ Hyderabad")

        start = datetime(2026, 12, 5, 12, 0, tzinfo=IST)
        ch = (await db.execute(select(Challenge).where(Challenge.slug == SLUG))).scalar_one_or_none()
        fields = dict(
            title="KHELO Valorant 5v5 Challenge", cafe_id=cafe.id, game="Valorant",
            setup_line="Swift Play 5v5 on XQZ's PCs", format="Swift Play 5v5, knockout",
            best_of=1, final_best_of=3, starts_at=start, ends_at=datetime(2026, 12, 5, 15, 45, tzinfo=IST),
            checkin_opens_at=datetime(2026, 12, 5, 11, 0, tzinfo=IST),
            checkin_closes_at=datetime(2026, 12, 5, 11, 45, tzinfo=IST),
            capacity=16, min_age=0, rules_md=RULES_MD,
            prizes_md="- Exciting rewards worth Rs 5,000 for the top teams\n- Semi-finalists get Khelo coupons",
            community_url="https://chat.whatsapp.com/FWVq1Iv7EgaDlyspNkS3ps", instagram_handle="khelo.journey",
        )
        if ch is None:
            ch = Challenge(slug=SLUG, status="open", plan_config={"team": TEAM}, **fields)
            db.add(ch)
            print("created challenge", SLUG)
        else:
            for k, v in fields.items():
                setattr(ch, k, v)
            cfg = dict(ch.plan_config or {})
            cfg["team"] = {**TEAM, **{k: v for k, v in (cfg.get("team") or {}).items() if k == "drawSeed"}}
            ch.plan_config = cfg
            print("refreshed challenge", SLUG)
        await db.commit()
        print("cafe", cafe.id, "challenge", ch.id)


if __name__ == "__main__":
    asyncio.run(main())
