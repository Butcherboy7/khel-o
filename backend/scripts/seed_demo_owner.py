"""Seed the tutorial / demo owner account with a fully populated café.

Idempotent: wipes any previous demo data (café slug ``khelo-demo-*``, users
``khelo.demo.*``) and rebuilds it. Touches nothing else. Run inside the
backend container:

    DEMO_PASSWORD='...' python scripts/seed_demo_owner.py

The demo café is excluded from every public and platform-wide view (see
app/core/demo.py) and cannot be booked by real customers.
"""
import asyncio
import os
import random
import string
import sys
from datetime import datetime, time, timedelta, timezone
from uuid import uuid4

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import delete, select  # noqa: E402

from app.core.demo import DEMO_EMAIL_PREFIX, DEMO_SLUG_PREFIX  # noqa: E402
from app.core.security import get_password_hash  # noqa: E402
from app.database import AsyncSessionLocal  # noqa: E402
import app.models  # noqa: E402,F401
from app.models.booking import Booking, BookingStatus  # noqa: E402
from app.models.cafe import Cafe, VerificationStatus  # noqa: E402
from app.models.payment import Payment, PaymentStatus  # noqa: E402
from app.models.platform_fee import PlatformFee  # noqa: E402
from app.models.hardware_tier import HardwareTier, PlatformType  # noqa: E402
from app.models.promotion import Promotion, PromotionType  # noqa: E402
from app.models.review import Review  # noqa: E402
from app.models.user import User, UserRole  # noqa: E402
from app.models.user_role import UserRoleMapping  # noqa: E402

IST = timezone(timedelta(hours=5, minutes=30))
OWNER_EMAIL = DEMO_EMAIL_PREFIX + "owner@example.com"
SLUG = DEMO_SLUG_PREFIX + "level-up-arena-hyderabad"
rng = random.Random(2610)

NAMES = [
    "Aarav Reddy", "Vihaan Sharma", "Sai Teja", "Ananya Rao", "Karthik Naidu", "Ishita Verma", "Rohit Kumar",
    "Sneha Pillai", "Arjun Mehta", "Meghana Goud", "Harsha Vardhan", "Priya Nair", "Aditya Singh", "Tanvi Joshi",
    "Pranav Chowdary", "Nikhil Yadav", "Divya Menon", "Rahul Bansal", "Sanjana Iyer", "Manoj Kumar", "Varun Tej",
    "Aisha Khan", "Faizan Ali", "Zoya Siddiqui", "Mohammed Irfan", "Kavya Reddy", "Abhishek Gupta", "Lakshmi Prasad",
    "Chaitanya Raju", "Bhavana Rao", "Siddharth Jain", "Neha Kapoor", "Yash Patel", "Ritika Das", "Tarun Kumar",
    "Pooja Hegde", "Dheeraj Varma", "Anjali Sinha", "Krishna Murthy", "Shreya Bhat", "Imran Shaikh", "Vamsi Krishna",
    "Naveen Babu", "Swathi Reddy",
]

PC = dict(tier_type="gaming", platform=PlatformType.PC)
# name, taxonomy key, seats, price/hr, popularity weight w, durations (hours), grp = typical group size
TIERS = [
    dict(name="Standard Gaming PC", key="pc-gaming", seats=6, price=100, w=26, durs=[1, 1, 2, 2, 3, 4], grp=3,
         specs={"gpu": "RTX 3060", "ram": "16GB", "monitor": "144Hz", "cpu": "Ryzen 5 5600"},
         attrs={"gpu": "RTX 3060", "monitor_hz": "144", "ram_gb": 16},
         games=["Valorant", "CS2", "Fortnite", "Apex Legends", "League of Legends"], **PC),
    dict(name="Pro Gaming PC", key="pc-gaming", seats=4, price=150, w=16, durs=[1, 2, 2, 3, 4], grp=3,
         specs={"gpu": "RTX 4070", "ram": "32GB", "monitor": "240Hz", "cpu": "Intel i7 13700"},
         attrs={"gpu": "RTX 4070", "monitor_hz": "240", "ram_gb": 32},
         games=["GTA V", "Cyberpunk 2077", "Elden Ring", "Call of Duty: Warzone", "Valorant"], **PC),
    dict(name="Streamer Suite (Private Room)", key="pc-gaming", seats=1, price=300, w=3, durs=[2, 3, 4], grp=1,
         specs={"gpu": "RTX 4090", "ram": "64GB", "monitor": "360Hz", "cpu": "Intel i9 13900K"},
         attrs={"gpu": "RTX 4090", "monitor_hz": "360", "ram_gb": 64, "private_room": True},
         games=["Cyberpunk 2077", "Fortnite", "Valorant"], **PC),
    dict(name="PS5 Lounge", key="console.playstation", seats=3, price=150, w=20, durs=[1, 1, 2, 2, 3], grp=2,
         coop=(4, 50), specs={}, attrs={"model": "ps5", "controllers": 2, "screen": "tv", "screen_size_in": 55},
         games=["EA FC 25", "GTA V", "Tekken 8", "God of War Ragnarok", "Spider-Man 2", "Mortal Kombat 1"],
         tier_type="gaming", platform=PlatformType.PLAYSTATION, model="PS5"),
    dict(name="PS5 Pro Projector Room", key="console.playstation", seats=1, price=220, w=7, durs=[1, 2, 2, 3], grp=3,
         coop=(5, 60), specs={}, attrs={"model": "ps5-pro", "controllers": 4, "screen": "projector", "screen_size_in": 100},
         games=["EA FC 25", "Call of Duty", "Tekken 8"],
         tier_type="gaming", platform=PlatformType.PLAYSTATION, model="PS5 Pro"),
    dict(name="Xbox Series X Corner", key="console.xbox", seats=2, price=130, w=6, durs=[1, 1, 2, 3], grp=2,
         coop=(4, 40), specs={}, attrs={"model": "xbox-series-x", "controllers": 2, "screen": "tv", "screen_size_in": 50},
         games=["Forza Horizon 5", "Halo Infinite", "Mortal Kombat 1"],
         tier_type="gaming", platform=PlatformType.XBOX, model="Xbox Series X"),
    dict(name="Nintendo Switch Party Zone", key="console.nintendo", seats=1, price=120, w=4, durs=[1, 1, 2], grp=4,
         coop=(4, 30), specs={}, attrs={"model": "switch", "controllers": 4, "screen": "tv", "screen_size_in": 50},
         games=["Mario Kart 8 Deluxe", "Super Smash Bros. Ultimate", "Mario Party"],
         tier_type="gaming", platform=PlatformType.NINTENDO, model="Switch"),
    dict(name="VR Arena (Meta Quest 3)", key="vr.station", act="VR", seats=2, price=500, w=7, durs=[0.5, 0.5, 1], grp=1,
         minm=30, p30=280, attrs={"headset": "Meta Quest 3", "players_max": 1, "min_age": 10},
         games=["Beat Saber", "Half-Life: Alyx", "Superhot VR"]),
    dict(name="F1 Racing Simulator (Motion)", key="racing-simulator.motion", act="Racing Simulator", seats=1, price=450,
         w=8, durs=[0.5, 1, 1], grp=1, minm=30, p30=250, attrs={"screens": "triple", "wheel": "direct-drive"},
         games=["F1 24", "Assetto Corsa", "iRacing"]),
    dict(name="Sim Racing Rig (Static)", key="racing-simulator.static", act="Racing Simulator", seats=2, price=300, w=7,
         durs=[0.5, 1, 1, 2], grp=1, minm=30, p30=170, attrs={"screens": "single", "wheel": "entry"},
         games=["Forza Motorsport", "Gran Turismo 7", "Assetto Corsa"]),
    dict(name="Cricket Simulator", key="cricket-simulator", act="Cricket Simulator", seats=1, price=600, w=3,
         durs=[1, 1, 2], grp=4, attrs={"format": "screen", "players_max": 4}, games=[]),
    dict(name="Snooker Table (12ft)", key="snooker", act="Snooker", seats=2, price=250, w=14, durs=[1, 1, 1.5, 2], grp=4,
         attrs={"table_size": "12ft"}, games=[]),
    dict(name="American Pool Table", key="pool.american", act="Pool", seats=2, price=200, w=11, durs=[1, 1, 1.5, 2], grp=4,
         attrs={"table_size": "9ft", "games_offered": ["8-ball", "9-ball"]}, games=[]),
    dict(name="English Pool Table", key="pool.english", act="Pool", seats=1, price=180, w=4, durs=[1, 1, 2], grp=4,
         attrs={"table_size": "7ft", "games_offered": ["blackball"]}, games=[]),
    dict(name="Billiards Table", key="billiards", act="Billiards", seats=1, price=220, w=2, durs=[1, 2], grp=4,
         attrs={}, games=[]),
    dict(name="Carom Board Table", key="carom", act="Carom Billiards", seats=1, price=150, w=1, durs=[1, 2], grp=4,
         attrs={}, games=[]),
    dict(name="Air Hockey", key="air-hockey", act="Air Hockey", seats=1, price=100, w=4, durs=[0.5, 1], grp=2, minm=30,
         attrs={}, games=[]),
    dict(name="Foosball", key="foosball", act="Foosball", seats=1, price=100, w=4, durs=[0.5, 1], grp=4, minm=30,
         attrs={"players": "4"}, games=[]),
    dict(name="Table Tennis", key="table-tennis", act="Table Tennis", seats=1, price=150, w=4, durs=[1, 1, 2], grp=2,
         attrs={}, games=[]),
    dict(name="Carrom", key="carrom", act="Carrom", seats=1, price=80, w=2, durs=[1, 1, 2], grp=4, attrs={}, games=[]),
    dict(name="Darts", key="darts", act="Darts", seats=1, price=120, w=3, durs=[1, 1], grp=4,
         attrs={"board": "electronic"}, games=[]),
    dict(name="Bowling Lane (10-pin)", key="bowling", act="Bowling", seats=2, price=600, w=9, durs=[1, 1, 2], grp=6,
         attrs={"players_per_lane": 6, "shoes_included": True}, games=[]),
    dict(name="Karaoke Room", key="karaoke", act="Karaoke", seats=1, price=500, w=4, durs=[1, 2, 2, 3], grp=8,
         attrs={"room_capacity": 10, "languages": ["english", "hindi", "telugu"]}, games=[]),
    dict(name="Arcade Play Pass", key="arcade", act="Arcade", seats=2, price=200, w=5, durs=[1, 1, 2], grp=2,
         attrs={}, games=[]),
]
GAMING_KEYS = ("pc-gaming", "console.playstation", "console.xbox", "console.nintendo")
GROUP_KEYS = ("bowling", "karaoke", "snooker", "pool.american", "pool.english", "darts", "air-hockey", "foosball",
              "table-tennis", "carrom")

COMMENTS = {
    5: ["Brilliant setup, zero lag and the staff sorted everything quickly. Coming back this weekend.",
        "Best gaming cafe in the area. Clean seats, fast machines, great vibe.",
        "Booked on KHEL-O in two minutes and the slot was ready when we reached. Loved it.",
        "Came for the {tier} and ended up staying an extra hour. Totally worth it.",
        "Great place to hang out with friends. Snacks counter is a bonus.",
        "Super clean and well maintained. The {tier} felt brand new.",
        "Friendly staff, no waiting, proper pricing. Five stars from our whole group."],
    4: ["Really good experience, only wish there were more snacks options.",
        "Machines are great. It got a little crowded at peak time but staff managed well.",
        "Nice ambience and good {tier}. Would book again.",
        "Smooth booking and check in. AC could be a bit cooler.",
        "Good value for money. Loved the {tier}."],
    3: ["Decent place but we had to wait about ten minutes at the start.",
        "{tier} was fine, music was a bit loud for us."],
    2: ["Slot started late and one controller was not working."],
    1: ["Had to wait long even with a booking. Hoping it improves."],
}
REPLIES = {
    5: ["Thank you so much! See you again soon.", "Glad you enjoyed it! Your next round of snacks is on us.",
        "Thanks for the love, the whole Level Up team appreciates it!"],
    4: ["Thanks for the feedback, we are adding more snack options soon.",
        "Appreciate it! We are fixing the AC balance this week."],
    3: ["Sorry about the wait, we have added one more staff member at the desk for evenings."],
    2: ["Sorry about that. We have replaced the controller and will make sure slots start on time."],
    1: ["We are sorry about the delay. Please message us and we will make it right on your next visit."],
}
CANCEL_REASONS = ["Change of plans", "Friends could not make it", "Booked the wrong slot", "Got stuck at work",
                  "Rescheduling to the weekend"]


def ref():
    return f"GC-{datetime.now(timezone.utc).year}-" + "".join(rng.choices(string.ascii_uppercase + string.digits, k=6))


def pick_hour(weekday):
    hours = list(range(11, 23))
    wk = [1, 1, 1.5, 2, 2.5, 3, 4, 5, 5, 4, 3, 1.5]
    we = [2, 3, 4, 4, 4, 4, 5, 5, 5, 4, 3, 2]
    return rng.choices(hours, weights=we if weekday >= 5 else wk)[0] + rng.choice([0, 0, 0.5])


def tt(h):
    return time(int(h), int(round((h % 1) * 60)))


async def wipe(db):
    cafe_ids = list((await db.execute(select(Cafe.id).where(Cafe.slug.like(DEMO_SLUG_PREFIX + "%")))).scalars())
    user_ids = list((await db.execute(select(User.id).where(User.email.like(DEMO_EMAIL_PREFIX + "%")))).scalars())
    if cafe_ids:
        await db.execute(delete(Review).where(Review.cafe_id.in_(cafe_ids)))
        demo_bookings = select(Booking.id).where(Booking.cafe_id.in_(cafe_ids))
        await db.execute(delete(Payment).where(Payment.booking_id.in_(demo_bookings)))
        await db.execute(delete(PlatformFee).where(PlatformFee.booking_id.in_(demo_bookings)))
        await db.execute(delete(Booking).where(Booking.cafe_id.in_(cafe_ids)))
        await db.execute(delete(Promotion).where(Promotion.cafe_id.in_(cafe_ids)))
        await db.execute(delete(HardwareTier).where(HardwareTier.cafe_id.in_(cafe_ids)))
        await db.execute(delete(Cafe).where(Cafe.id.in_(cafe_ids)))
    if user_ids:
        await db.execute(delete(UserRoleMapping).where(UserRoleMapping.user_id.in_(user_ids)))
        await db.execute(delete(User).where(User.id.in_(user_ids)))
    await db.flush()


async def main():
    password = os.environ.get("DEMO_PASSWORD")
    if not password:
        sys.exit("Set DEMO_PASSWORD")
    now = datetime.now(timezone.utc)
    now_ist = now.astimezone(IST)
    today = now_ist.date()

    async with AsyncSessionLocal() as db:
        await wipe(db)

        def mk_user(email, name, role, phone=None):
            kw = dict(id=uuid4(), email=email,
                      password_hash=get_password_hash(password) if role != UserRole.GAMER else None,
                      full_name=name, role=role, is_active=True, city="Hyderabad", phone_number=phone,
                      created_at=now - timedelta(days=rng.randint(30, 120)))
            if hasattr(User, "email_verified"):
                kw["email_verified"] = True
            u = User(**kw)
            maps = [UserRoleMapping(id=uuid4(), user_id=u.id, role=UserRole.GAMER)]
            if role != UserRole.GAMER:
                maps.append(UserRoleMapping(id=uuid4(), user_id=u.id, role=role, cafe_id=None))
            return u, maps

        owner, om = mk_user(OWNER_EMAIL, "Rohan Mehta", UserRole.CAFE_OWNER, "+919876501234")
        owner.created_at = now - timedelta(days=95)
        gamers = []
        db.add_all([owner, *om])
        for i, n in enumerate(NAMES, 1):
            g, gm = mk_user(f"{DEMO_EMAIL_PREFIX}gamer{i:02d}@example.com", n, UserRole.GAMER)
            gamers.append(g)
            db.add_all([g, *gm])
        await db.flush()

        total_seats = sum(t["seats"] for t in TIERS)
        cafe = Cafe(
            id=uuid4(), owner_id=owner.id, name="Level Up Arena", slug=SLUG,
            description="Hyderabad's biggest gaming and entertainment zone: 20+ setups across PC, console, VR, "
                        "racing simulators, snooker, pool, bowling, karaoke and an arcade. Air-conditioned, "
                        "private rooms, snacks counter, open late.",
            address_line1="Plot 118, Road No. 12, Banjara Hills", city="Hyderabad", state="Telangana",
            pincode="500034", phone_number="+919876501234", email="hello@levelup-arena.example",
            google_maps_url="https://maps.google.com/?q=Banjara+Hills+Hyderabad",
            opening_time=time(10, 0), closing_time=time(23, 30),
            verification_status=VerificationStatus.VERIFIED, is_active=True, total_seats=total_seats,
            app_bookable_seats=total_seats, bookable_stations=total_seats,
            amenities=["Air conditioning", "Snacks & beverages", "Private rooms", "Free Wi-Fi", "Parking", "Lockers",
                       "Rest area"],
            supported_games={"PC": ["Valorant", "CS2", "GTA V", "Fortnite", "Apex Legends"],
                             "PlayStation": ["EA FC 25", "Tekken 8", "God of War Ragnarok"],
                             "VR": ["Beat Saber", "Half-Life: Alyx"]},
            house_rules=["Carry a valid ID for VR", "No outside food in gaming zones",
                         "Be on time; slots are held for 15 minutes"],
            cancellation_policy="Free cancellation up to 2 hours before your slot.",
            social_links={"instagram": "https://instagram.com/levelup.arena"},
            created_at=now - timedelta(days=90),
        )
        db.add(cafe)
        await db.flush()

        tiers = []
        for t in TIERS:
            minm = t.get("minm", 60)
            tier = HardwareTier(
                id=uuid4(), cafe_id=cafe.id, name=t["name"], specs=t.get("specs", {}), total_seats=t["seats"],
                app_bookable_seats=t["seats"], active_seats_count=t["seats"], price_per_hour=t["price"],
                price_30m=t.get("p30"), taxonomy_key=t["key"], attributes=t.get("attrs", {}),
                tier_type=t.get("tier_type", "activity"), activity_kind=t.get("act"),
                platform=t.get("platform"), model=t.get("model"),
                min_booking_minutes=minm, default_booking_minutes=60 if minm >= 60 else minm, is_active=True,
                created_at=now - timedelta(days=89),
            )
            if t.get("coop"):
                tier.coop_enabled = True
                tier.coop_max_players, tier.coop_extra_player_price = t["coop"]
            tiers.append((t, tier))
            db.add(tier)
        await db.flush()

        def promo(title, desc, **kw):
            p = Promotion(id=uuid4(), cafe_id=cafe.id, title=title, description=desc, is_active=True,
                          valid_from=now - timedelta(days=80), valid_until=now + timedelta(days=60), current_uses=0,
                          days_of_week=kw.pop("days"), start_hour=kw.pop("sh"), end_hour=kw.pop("eh"), **kw)
            db.add(p)
            return p

        pc_std = next(tr for t, tr in tiers if t["name"] == "Standard Gaming PC")
        sim = next(tr for t, tr in tiers if t["name"].startswith("F1"))
        squad = promo("Squad Pass: 4 hours for ₹360",
                      "Four hours on a Standard Gaming PC at a flat price. Bring the squad.",
                      days=[0, 1, 2, 3, 4, 5, 6], sh=10, eh=23, promotion_type=PromotionType.FIXED_PRICE,
                      fixed_price_amount=360, min_duration_hours=4, applicable_tier_id=pc_std.id, max_uses=200,
                      khelo_code="LEVELUP4")
        happy = promo("Weekday afternoon: 20% off",
                      "Slow afternoons, cheaper games. 12 pm to 5 pm, Monday to Friday.",
                      days=[0, 1, 2, 3, 4], sh=12, eh=17, promotion_type=PromotionType.PERCENTAGE,
                      discount_percentage=20)
        promo("Sim racing: ₹100 off", "Take ₹100 off any 1 hour session on the F1 Racing Simulator.",
              days=[0, 1, 2, 3], sh=11, eh=22, promotion_type=PromotionType.FIXED_AMOUNT,
              fixed_discount_amount=100, min_booking_minutes=60, applicable_tier_id=sim.id)
        await db.flush()

        occ = {}

        def fits(tid, d, start, dur, seats, total):
            slots = [round(start + k * 0.5, 1) for k in range(int(dur * 2))]
            if any(occ.get((tid, d, s), 0) + seats > total for s in slots):
                return False
            for s in slots:
                occ[(tid, d, s)] = occ.get((tid, d, s), 0) + seats
            return True

        bookings, completed = [], []
        used_refs = set()
        weights = [t["w"] for t, _ in tiers]
        span = 75
        for off in range(-span, 11):
            d = today + timedelta(days=off)
            wd = d.weekday()
            dayf = [0.65, 0.7, 0.8, 0.9, 1.15, 1.6, 1.5][wd]
            if off <= 0:
                n = 52 * dayf * (0.65 + 0.55 * (off + span) / span)
            else:
                n = 52 * dayf * max(0.15, 0.75 - off * 0.06)
            n = max(2, int(round(n * rng.uniform(0.85, 1.15))))
            if off == 0:
                n += 8  # a lively "today" with plenty still to come
            for _ in range(n):
                t, tier = rng.choices(tiers, weights=weights)[0]
                dur = rng.choice(t["durs"])
                start = pick_hour(wd)
                if t["key"] in ("karaoke", "bowling"):
                    start = max(start, 14)
                if start + dur > 23.5:
                    continue
                seats = 1
                if t["key"] in GAMING_KEYS:
                    seats = min(rng.choice([1, 1, 1, 2, 2, 3]), t["seats"])
                players = None
                if tier.coop_enabled and rng.random() < 0.35:
                    seats, players = 1, rng.randint(2, min(4, t["coop"][0]))
                elif t["key"] in GROUP_KEYS:
                    players = rng.randint(2, max(2, min(6, t["grp"] + 1)))
                if not fits(tier.id, d, start, dur, seats, t["seats"]):
                    continue
                base = round(t["price"] * dur * seats, 2)
                if players and players > seats and tier.coop_enabled:
                    base = round(base + t["coop"][1] * (players - 1) * dur, 2)
                disc, pid = 0.0, None
                if t["name"] == "Standard Gaming PC" and dur >= 4 and rng.random() < 0.7:
                    pid, disc = squad.id, round(base - 360 * seats, 2)
                    squad.current_uses += 1
                elif (wd < 5 and 12 <= start < 17 and t["key"] in ("pc-gaming", "console.playstation")
                      and rng.random() < 0.6):
                    pid, disc = happy.id, round(base * 0.2, 2)
                    happy.current_uses += 1
                fee = round((base - disc) * 0.04, 2)
                s_dt = datetime.combine(d, tt(start), tzinfo=IST)
                e_dt = s_dt + timedelta(hours=dur)
                created = min(s_dt - timedelta(hours=rng.uniform(1, 96)), now - timedelta(minutes=rng.randint(5, 600))).astimezone(timezone.utc)
                if off == 0 and e_dt <= now_ist:
                    status = BookingStatus.NO_SHOW if rng.random() < 0.05 else BookingStatus.COMPLETED
                elif off == 0 and s_dt <= now_ist:
                    status = BookingStatus.CHECKED_IN
                elif off < 0:
                    r = rng.random()
                    status = (BookingStatus.COMPLETED if r < 0.88
                              else BookingStatus.CANCELLED if r < 0.95 else BookingStatus.NO_SHOW)
                else:
                    status = BookingStatus.CONFIRMED
                r = ref()
                while r in used_refs:
                    r = ref()
                used_refs.add(r)
                b = Booking(
                    id=uuid4(), booking_reference=r, gamer_id=rng.choice(gamers).id, cafe_id=cafe.id,
                    hardware_tier_id=tier.id, seats_count=seats, players_count=players, session_date=d,
                    start_time=tt(start), end_time=tt(start + dur), duration_hours=dur, base_amount=base,
                    discount_amount=disc, gateway_fee=fee, convenience_fee=0, total_amount=round(base - disc + fee, 2),
                    status=status, promotion_id=pid, game=rng.choice(t["games"]) if t["games"] else None,
                    created_at=created, updated_at=created,
                )
                if status == BookingStatus.CANCELLED:
                    b.cancelled_at = min(s_dt - timedelta(hours=rng.uniform(2, 24)), now).astimezone(timezone.utc)
                    b.cancellation_reason = rng.choice(CANCEL_REASONS)
                    b.updated_at = b.cancelled_at
                if status in (BookingStatus.COMPLETED, BookingStatus.CHECKED_IN):
                    b.checked_in_at = (s_dt + timedelta(minutes=rng.randint(-5, 8))).astimezone(timezone.utc)
                    b.checkin_method = rng.choice(["qr", "qr", "manual"])
                    b.actual_start_time = b.checked_in_at
                    if status == BookingStatus.COMPLETED:
                        b.actual_end_time = e_dt.astimezone(timezone.utc)
                        completed.append((b, t, e_dt))
                bookings.append(b)
        db.add_all(bookings)
        await db.flush()

        # Money rows: the owner's analytics and earnings read Payment + PlatformFee. They are flagged so the
        # payout and settlement jobs never pick them up (settled + excluded_reason).
        for b in bookings:
            sub = round(float(b.base_amount) - float(b.discount_amount), 2)
            refunded = b.status == BookingStatus.CANCELLED
            db.add(Payment(id=uuid4(), booking_id=b.id, razorpay_order_id="demo_order_" + uuid4().hex[:14],
                           razorpay_payment_id="demo_pay_" + uuid4().hex[:14], amount=b.total_amount,
                           status=PaymentStatus.REFUNDED if refunded else PaymentStatus.CAPTURED,
                           refund_id=("demo_rfnd_" + uuid4().hex[:10]) if refunded else None,
                           refunded_at=b.cancelled_at if refunded else None,
                           created_at=b.created_at, updated_at=b.created_at))
            db.add(PlatformFee(id=uuid4(), booking_id=b.id, convenience_fee=0, gateway_fee=b.gateway_fee,
                               fee_percentage_applied=4.0, tds_amount=0, owner_settlement_amount=sub,
                               transfer_status="skipped_route_disabled", settlement_status="settled",
                               settled_at=b.created_at, excluded_reason="Demo data - never payable",
                               created_at=b.created_at))
        await db.flush()

        n_rev = 0
        for b, t, e_dt in completed:
            if rng.random() > 0.32:
                continue
            rating = rng.choices([5, 4, 3, 2, 1], weights=[55, 28, 10, 5, 2])[0]
            created = (e_dt + timedelta(hours=rng.uniform(1, 30))).astimezone(timezone.utc)
            if created > now:
                continue
            rv = Review(id=uuid4(), cafe_id=cafe.id, gamer_id=b.gamer_id, booking_id=b.id, rating=rating,
                        comment=rng.choice(COMMENTS[rating]).format(tier=t["name"]), is_visible=True,
                        created_at=created, updated_at=created)
            if rating <= 2 or rng.random() < 0.5:
                rv.owner_reply = rng.choice(REPLIES[rating])
                rv.owner_replied_at = min(created + timedelta(hours=rng.uniform(2, 20)), now)
            db.add(rv)
            n_rev += 1
        await db.commit()
        paid = [b for b in bookings if b.status in (BookingStatus.COMPLETED, BookingStatus.CONFIRMED,
                                                    BookingStatus.CHECKED_IN)]
        print(f"demo owner {OWNER_EMAIL}; café {cafe.name}; tiers {len(tiers)}; bookings {len(bookings)}; "
              f"revenue Rs{sum(float(b.total_amount) for b in paid):,.0f}; reviews {n_rev}; gamers {len(gamers)}")


asyncio.run(main())
