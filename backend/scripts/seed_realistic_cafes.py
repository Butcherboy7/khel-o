import asyncio
import uuid
from datetime import time, datetime, timezone, date, timedelta
from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models.user import User, UserRole
from app.models.cafe import Cafe, VerificationStatus
from app.models.hardware_tier import HardwareTier
from app.models.booking import Booking, BookingStatus
from app.core.security import get_password_hash

REALISTIC_CAFES = [
    {
        "name": "CyberNexus Premium",
        "city": "Bengaluru",
        "address": "Indiranagar 12th Main",
        "state": "Karnataka",
        "pincode": "560038",
        "lat": 12.9784,
        "lng": 77.6401,
        "tier_name": "RTX 4090 Elite",
        "tier_price": 300.0,
        "specs": {"gpu": "RTX 4090", "cpu": "Intel i9-14900KS", "ram": "64GB DDR5", "monitor": "27\" 360Hz OLED"},
        "total_seats": 20,
        "app_bookable_seats": 15,
        "amenities": ["wifi", "ac", "valet_parking", "high_speed_fiber", "streaming_booth", "cafe_bar", "snacks"],
    },
    {
        "name": "PixelForge Arena",
        "city": "Hyderabad",
        "address": "Gachibowli Financial District",
        "state": "Telangana",
        "pincode": "500032",
        "lat": 17.4401,
        "lng": 78.3489,
        "tier_name": "RTX 4080 Super",
        "tier_price": 250.0,
        "specs": {"gpu": "RTX 4080 Super", "cpu": "AMD Ryzen 9 7950X", "ram": "32GB DDR5", "monitor": "25\" 240Hz"},
        "total_seats": 25,
        "app_bookable_seats": 20,
        "amenities": ["wifi", "ac", "parking", "fiber", "food_court", "streamer_pods"],
    },
    {
        "name": "Console Kingdom",
        "city": "Mumbai",
        "address": "Bandra Linking Road",
        "state": "Maharashtra",
        "pincode": "400050",
        "lat": 19.0596,
        "lng": 72.8295,
        "tier_name": "PS5 Ultimate Lounge",
        "tier_price": 180.0,
        "specs": {"gpu": "PS5 Custom RDNA2", "cpu": "Zen 2", "ram": "16GB GDDR6", "monitor": "55\" 4K OLED TV"},
        "total_seats": 12,
        "app_bookable_seats": 10,
        "amenities": ["wifi", "ac", "recliners", "surround_sound", "snacks", "beverages"],
    },
    {
        "name": "ZeroLatency Hub",
        "city": "Delhi",
        "address": "Cyber Hub Gurgaon",
        "state": "Haryana",
        "pincode": "122002",
        "lat": 28.4950,
        "lng": 77.0895,
        "tier_name": "RTX 4070 Ti Pro",
        "tier_price": 200.0,
        "specs": {"gpu": "RTX 4070 Ti", "cpu": "Intel i7-14700K", "ram": "32GB DDR5", "monitor": "27\" 165Hz"},
        "total_seats": 30,
        "app_bookable_seats": 25,
        "amenities": ["wifi", "ac", "valet", "fiber_1gbps", "esports_stage", "live_streaming"],
    },
    {
        "name": "Budget Bytes Gaming",
        "city": "Pune",
        "address": "Viman Nagar Main Road",
        "state": "Maharashtra",
        "pincode": "411014",
        "lat": 18.5679,
        "lng": 73.9143,
        "tier_name": "RTX 3050 Starter",
        "tier_price": 50.0,
        "specs": {"gpu": "RTX 3050", "cpu": "Intel i5-12400F", "ram": "16GB DDR4", "monitor": "24\" 144Hz"},
        "total_seats": 40,
        "app_bookable_seats": 35,
        "amenities": ["wifi", "ac", "parking"],
    },
    {
        "name": "FullyBooked Arena",
        "city": "Bengaluru",
        "address": "Koramangala 5th Block",
        "state": "Karnataka",
        "pincode": "560095",
        "lat": 12.9352,
        "lng": 77.6245,
        "tier_name": "RTX 4080 Beast",
        "tier_price": 220.0,
        "specs": {"gpu": "RTX 4080", "cpu": "Ryzen 7 7800X3D", "ram": "32GB DDR5", "monitor": "27\" 240Hz"},
        "total_seats": 10,
        "app_bookable_seats": 10,
        "amenities": ["wifi", "ac", "fiber", "snacks"],
        "fully_booked": True,
    },
    {
        "name": "Xbox Elite Lounge",
        "city": "Hyderabad",
        "address": "Jubilee Hills Checkpost",
        "state": "Telangana",
        "pincode": "500033",
        "lat": 17.4319,
        "lng": 78.4073,
        "tier_name": "Xbox Series X VIP",
        "tier_price": 150.0,
        "specs": {"gpu": "Xbox Series X RDNA2", "cpu": "Zen 2 Custom", "ram": "16GB GDDR6", "monitor": "65\" 4K 120Hz"},
        "total_seats": 8,
        "app_bookable_seats": 6,
        "amenities": ["wifi", "ac", "dolby_atmos", "recliners", "food"],
    },
    {
        "name": "LastSeats Gaming",
        "city": "Mumbai",
        "address": "Powai Hiranandani",
        "state": "Maharashtra",
        "pincode": "400076",
        "lat": 19.1197,
        "lng": 72.9051,
        "tier_name": "RTX 3060 Competitive",
        "tier_price": 120.0,
        "specs": {"gpu": "RTX 3060", "cpu": "Ryzen 5 5600X", "ram": "16GB DDR4", "monitor": "24\" 165Hz"},
        "total_seats": 20,
        "app_bookable_seats": 15,
        "amenities": ["wifi", "ac", "parking", "snacks"],
        "urgency_venue": True,
    },
    {
        "name": "Elite SimRacing Studio",
        "city": "Delhi",
        "address": "Connaught Place Outer Circle",
        "state": "Delhi",
        "pincode": "110001",
        "lat": 28.6315,
        "lng": 77.2167,
        "tier_name": "F1 Motion Simulator",
        "tier_price": 350.0,
        "specs": {"gpu": "RTX 4090", "cpu": "Intel i9", "ram": "32GB", "monitor": "Triple 32\" Curved + VR"},
        "total_seats": 6,
        "app_bookable_seats": 4,
        "amenities": ["wifi", "ac", "motion_rig", "vr_headset", "racing_cockpit", "cafe"],
    },
    {
        "name": "FullyBooked Console Zone",
        "city": "Pune",
        "address": "Kothrud Ideal Colony",
        "state": "Maharashtra",
        "pincode": "411038",
        "lat": 18.5074,
        "lng": 73.8077,
        "tier_name": "PS5 Gaming Station",
        "tier_price": 140.0,
        "specs": {"gpu": "PS5", "cpu": "Zen 2", "ram": "16GB", "monitor": "55\" 4K HDR"},
        "total_seats": 10,
        "app_bookable_seats": 10,
        "amenities": ["wifi", "ac", "snacks", "couches"],
        "fully_booked": True,
    },
]

async def seed():
    async with AsyncSessionLocal() as session:
        owner_res = await session.execute(select(User).where(User.email == "owner@example.com"))
        owner = owner_res.scalar_one_or_none()
        if not owner:
            owner = User(
                id=uuid.UUID("2083bd7d-7811-4adf-99ec-4915bbd95eec"),
                email="owner@example.com",
                phone_number="+919876543210",
                hashed_password=get_password_hash("testpass123"),
                full_name="Rajesh Sharma (Owner)",
                role=UserRole.CAFE_OWNER,
                is_active=True,
                is_verified=True,
            )
            session.add(owner)
            await session.commit()
            await session.refresh(owner)

        photos = [
            "https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=800&auto=format&fit=crop",
            "https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=800&auto=format&fit=crop",
            "https://images.unsplash.com/photo-1538481199705-c710c4e965fc?q=80&w=800&auto=format&fit=crop",
        ]

        today = date.today()
        peak_date = today + timedelta(days=2)
        
        gamer_res = await session.execute(select(User).where(User.email == "test@example.com"))
        gamer = gamer_res.scalar_one_or_none()
        if not gamer:
            gamer = User(
                id=uuid.UUID("a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"),
                email="test@example.com",
                phone_number="+919876543211",
                hashed_password=get_password_hash("testpass123"),
                full_name="Demo Gamer",
                role=UserRole.GAMER,
                is_active=True,
                is_verified=True,
            )
            session.add(gamer)

        cafe_count = 0
        booking_count = 0

        for cafe_data in REALISTIC_CAFES:
            name = cafe_data["name"]
            existing = await session.execute(select(Cafe).where(Cafe.name == name))
            if existing.scalar_one_or_none():
                continue

            cafe_id = uuid.uuid4()
            cafe = Cafe(
                id=cafe_id,
                owner_id=owner.id,
                name=name,
                description=f"Premier gaming arena in {cafe_data['city']} with {cafe_data['tier_name']}. Verified specs, high-speed fiber, and premium amenities.",
                address_line1=cafe_data["address"],
                city=cafe_data["city"],
                state=cafe_data["state"],
                pincode=cafe_data["pincode"],
                latitude=cafe_data["lat"],
                longitude=cafe_data["lng"],
                phone_number="+91 9988776655",
                email=f"{name.lower().replace(' ', '')}@khelo.in",
                opening_time=time(9, 0),
                closing_time=time(23, 0),
                verification_status=VerificationStatus.VERIFIED,
                is_active=True,
                total_seats=cafe_data["total_seats"],
                amenities=cafe_data["amenities"],
                photos=photos,
            )
            session.add(cafe)
            await session.flush()

            tier_id = uuid.uuid4()
            tier = HardwareTier(
                id=tier_id,
                cafe_id=cafe_id,
                name=cafe_data["tier_name"],
                description=f"{cafe_data['tier_name']} tier at {name}",
                specs=cafe_data["specs"],
                total_seats=cafe_data["total_seats"],
                app_bookable_seats=cafe_data["app_bookable_seats"],
                preset_category="pro_gamer",
                price_per_hour=cafe_data["tier_price"],
                is_active=True,
            )
            session.add(tier)
            cafe_count += 1

            if cafe_data.get("fully_booked"):
                num_bookings = cafe_data["app_bookable_seats"]
                for i in range(num_bookings):
                    booking = Booking(
                        id=uuid.uuid4(),
                        booking_reference=f"SEED{booking_count + i:05d}",
                        gamer_id=gamer.id if gamer else owner.id,
                        cafe_id=cafe_id,
                        hardware_tier_id=tier_id,
                        seats_count=1,
                        session_date=peak_date,
                        start_time=time(18, 0),
                        end_time=time(20, 0),
                        duration_hours=2.0,
                        base_amount=cafe_data["tier_price"] * 2,
                        total_amount=cafe_data["tier_price"] * 2,
                        status=BookingStatus.CONFIRMED,
                    )
                    session.add(booking)
                booking_count += num_bookings

            elif cafe_data.get("urgency_venue"):
                for i in range(cafe_data["app_bookable_seats"] - 2):
                    booking = Booking(
                        id=uuid.uuid4(),
                        booking_reference=f"URGE{booking_count + i:05d}",
                        gamer_id=gamer.id if gamer else owner.id,
                        cafe_id=cafe_id,
                        hardware_tier_id=tier_id,
                        seats_count=1,
                        session_date=peak_date,
                        start_time=time(19, 0),
                        end_time=time(21, 0),
                        duration_hours=2.0,
                        base_amount=cafe_data["tier_price"] * 2,
                        total_amount=cafe_data["tier_price"] * 2,
                        status=BookingStatus.CONFIRMED,
                    )
                    session.add(booking)
                booking_count += cafe_data["app_bookable_seats"] - 2

        await session.commit()
        print(f"Seeded {cafe_count} realistic cafes with {booking_count} test bookings.")

if __name__ == "__main__":
    asyncio.run(seed())
