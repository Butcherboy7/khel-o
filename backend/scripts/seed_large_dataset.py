import asyncio
import uuid
from datetime import time, datetime, timezone
from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models.user import User, UserRole
from app.models.cafe import Cafe, VerificationStatus
from app.models.hardware_tier import HardwareTier
from app.core.security import get_password_hash

CAFES_DATA = [
    # Bengaluru
    ("LXG Esports Arena", "Bengaluru", "Indiranagar 100ft Road", "Karnataka", "560038", 12.9716, 77.6412, "pro_gamer", "RTX 4090 Superstation", 250.0, ["wifi", "ac", "food", "streamer_booth"]),
    ("HyperX Gaming Den", "Bengaluru", "Koramangala 5th Block", "Karnataka", "560095", 12.9352, 77.6245, "pro_gamer", "360Hz RTX 4080 Rig", 200.0, ["wifi", "ac", "snacks", "parking"]),
    ("GameOn Lounge", "Bengaluru", "HSR Layout Sector 1", "Karnataka", "560102", 12.9121, 77.6446, "casual", "RTX 3070 Gaming PC", 120.0, ["wifi", "ac", "food"]),
    ("Playstation Zone Indiranagar", "Bengaluru", "12th Main Road", "Karnataka", "560038", 12.9784, 77.6401, "ps5", "PS5 4K OLED Station", 150.0, ["wifi", "ac", "snacks", "recliners"]),
    ("Zero Ping Esports", "Bengaluru", "Whitefield Main Road", "Karnataka", "560066", 12.9698, 77.7499, "pro_gamer", "i9 + RTX 4090 Monster", 280.0, ["wifi", "ac", "streamer_booth", "food"]),
    ("Vortex Gaming Hub", "Bengaluru", "Jayanagar 4th Block", "Karnataka", "560041", 12.9250, 77.5840, "casual", "GTX 1660 Super Station", 80.0, ["wifi", "ac"]),
    ("Razer Edge Arena", "Bengaluru", "Malleshwaram 15th Cross", "Karnataka", "560003", 13.0031, 77.5700, "pro_gamer", "RTX 4070 Ti Competitive", 180.0, ["wifi", "ac", "food", "headsets"]),

    # Hyderabad
    ("Gamers Guild Arena", "Hyderabad", "Gachibowli DLF Road", "Telangana", "500032", 17.4401, 78.3489, "pro_gamer", "RTX 4080 Tournament Rig", 220.0, ["wifi", "ac", "food", "streamer_booth"]),
    ("Matrix Gaming Zone", "Hyderabad", "Madhapur Near Metro", "Telangana", "500081", 17.4483, 78.3915, "casual", "RTX 3060 Gaming PC", 110.0, ["wifi", "ac", "snacks"]),
    ("CyberBunk Hub", "Hyderabad", "Jubilee Hills Checkpost", "Telangana", "500033", 17.4319, 78.4073, "pro_gamer", "RTX 4090 VIP Booth", 300.0, ["wifi", "ac", "food", "recliners"]),
    ("PS5 Arena Kondapur", "Hyderabad", "Kondapur Main Rd", "Telangana", "500084", 17.4622, 78.3568, "ps5", "PS5 DualSense 4K", 140.0, ["wifi", "ac", "snacks"]),
    ("Level Up Game Station", "Hyderabad", "Kukatpally Housing Board", "Telangana", "500072", 17.4849, 78.4010, "casual", "GTX 1650 Budget Station", 70.0, ["wifi", "ac"]),

    # Mumbai
    ("CyberStorm Arena", "Mumbai", "Andheri West Veera Desai", "Maharashtra", "400053", 19.1363, 72.8335, "pro_gamer", "i9 + RTX 4080 Rig", 210.0, ["wifi", "ac", "food", "streamer_booth"]),
    ("Respawn Lounge Bandra", "Mumbai", "Hill Road Bandra", "Maharashtra", "400050", 19.0596, 72.8295, "pro_gamer", "RTX 4070 Super Rig", 180.0, ["wifi", "ac", "snacks"]),
    ("Apex Gaming Den", "Mumbai", "Powai Hiranandani", "Maharashtra", "400076", 19.1197, 72.9051, "casual", "RTX 3060 Ti Gaming PC", 130.0, ["wifi", "ac", "food"]),
    ("SimRacer Pro Studio", "Mumbai", "Lower Parel Palladium", "Maharashtra", "400013", 18.9953, 72.8242, "pro_gamer", "F1 Motion Sim Rig", 350.0, ["wifi", "ac", "food", "vr"]),
    ("Gamerz Den Dadar", "Mumbai", "Dadar West Station Rd", "Maharashtra", "400028", 19.0178, 72.8478, "casual", "RTX 2060 Gaming PC", 90.0, ["wifi", "ac"]),

    # Pune
    ("Respawn Gaming Lounge", "Pune", "Viman Nagar Datta Mandir", "Maharashtra", "411014", 18.5679, 73.9143, "pro_gamer", "360Hz Esports Station", 200.0, ["wifi", "ac", "food"]),
    ("Overclock Arena Kothrud", "Pune", "Kothrud Ideal Colony", "Maharashtra", "411038", 18.5074, 73.8077, "casual", "RTX 3070 Rig", 130.0, ["wifi", "ac", "snacks"]),
    ("Pixel Vault Baner", "Pune", "Baner High Street", "Maharashtra", "411045", 18.5590, 73.7868, "pro_gamer", "RTX 4080 Beast PC", 220.0, ["wifi", "ac", "food", "streamer_booth"]),

    # Delhi NCR
    ("Velocity Gaming Hub", "Delhi", "Connaught Place Block M", "Delhi", "110001", 28.6315, 77.2167, "pro_gamer", "RTX 4090 Ultimate", 260.0, ["wifi", "ac", "food", "streamer_booth"]),
    ("Glitch Arena Hauz Khas", "Delhi", "Hauz Khas Village", "Delhi", "110016", 28.5494, 77.2001, "casual", "RTX 3070 Station", 140.0, ["wifi", "ac", "snacks"]),
    ("Insomnia Gaming Gurgaon", "Delhi", "Cyber Hub DLF Phase 2", "Haryana", "122002", 28.4950, 77.0895, "pro_gamer", "240Hz RTX 4080 Monster", 240.0, ["wifi", "ac", "food", "parking"]),
    ("Noida Game Zone", "Delhi", "Sector 18 Market", "Uttar Pradesh", "201301", 28.5708, 77.3261, "casual", "RTX 3060 Gaming PC", 110.0, ["wifi", "ac"]),

    # Chennai
    ("Titan Esports Arena", "Chennai", "Nungambakkam High Rd", "Tamil Nadu", "600034", 13.0604, 80.2496, "pro_gamer", "RTX 4080 Competition PC", 190.0, ["wifi", "ac", "food"]),
    ("Chennai Gamerz Hub", "Chennai", "Velachery Main Rd", "Tamil Nadu", "600042", 12.9815, 80.2180, "casual", "RTX 3060 Station", 100.0, ["wifi", "ac", "snacks"]),
    ("PS5 Lounge Anna Nagar", "Chennai", "Anna Nagar 2nd Avenue", "Tamil Nadu", "600040", 13.0850, 80.2101, "ps5", "PS5 OLED Lounge", 140.0, ["wifi", "ac"]),

    # Kolkata
    ("Redline Gaming Hub", "Kolkata", "Park Street", "West Bengal", "700016", 22.5539, 88.3524, "pro_gamer", "RTX 4080 Arena PC", 180.0, ["wifi", "ac", "food"]),
    ("Salt Lake Gaming Zone", "Kolkata", "Sector 5 Electronic Complex", "West Bengal", "700091", 22.5726, 88.4339, "casual", "RTX 3070 Rig", 120.0, ["wifi", "ac", "snacks"]),

    # Ahmedabad
    ("Amdavad Gaming Den", "Ahmedabad", "CG Road Navrangpura", "Gujarat", "380009", 23.0333, 72.5631, "pro_gamer", "RTX 4070 Ti Station", 170.0, ["wifi", "ac", "food"]),
    ("Vastrapur Game World", "Ahmedabad", "Vastrapur Lake Rd", "Gujarat", "380015", 23.0350, 72.5293, "casual", "GTX 1660 Super PC", 85.0, ["wifi", "ac"]),
]

async def seed():
    async with AsyncSessionLocal() as session:
        # Check or create demo owner
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
            "https://images.unsplash.com/photo-1538481199705-c710c4e965fc?q=80&w=800&auto=format&fit=crop"
        ]

        count = 0
        for name, city, addr, state, pin, lat, lng, cat, tier_name, price, amens in CAFES_DATA:
            existing = await session.execute(select(Cafe).where(Cafe.name == name))
            if existing.scalar_one_or_none():
                continue

            cafe_id = uuid.uuid4()
            cafe = Cafe(
                id=cafe_id,
                owner_id=owner.id,
                name=name,
                description=f"Premier gaming arena in {city} with high refresh rate displays, mechanical keyboards, and high-speed fiber internet.",
                address_line1=addr,
                city=city,
                state=state,
                pincode=pin,
                latitude=lat,
                longitude=lng,
                phone_number="+91 9988776655",
                email=f"{name.lower().replace(' ', '')}@khelo.in",
                opening_time=time(9, 0),
                closing_time=time(23, 0),
                verification_status=VerificationStatus.VERIFIED,
                is_active=True,
                total_seats=30,
                amenities=amens,
                photos=photos,
            )
            session.add(cafe)
            await session.flush()

            tier = HardwareTier(
                id=uuid.uuid4(),
                cafe_id=cafe_id,
                name=tier_name,
                description=f"Top tier specs for competitive gaming in {city}.",
                specs={"gpu": tier_name.split()[0], "cpu": "Intel i7/i9", "ram": "32GB", "monitor": "240Hz OLED"},
                total_seats=15,
                app_bookable_seats=12,
                preset_category=cat,
                price_per_hour=price,
                is_active=True,
            )
            session.add(tier)
            count += 1

        await session.commit()
        print(f"Seeded {count} new cafes cleanly!")

if __name__ == "__main__":
    asyncio.run(seed())
