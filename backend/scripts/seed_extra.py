import asyncio
from datetime import time
from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models.cafe import Cafe, VerificationStatus
from app.models.hardware_tier import HardwareTier
from app.models.user import User

async def seed_extra():
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User).where(User.email == 'owner@example.com'))
        owner = result.scalar_one_or_none()
        if not owner:
            print("Owner not found")
            return

        cafes_data = [
            {
                "name": "Velocity Esports Lounge",
                "description": "Premium PS5 Lounge and high-end RTX 4080 stations with OLED displays.",
                "address_line1": "Banjara Hills Road No. 12",
                "city": "Hyderabad",
                "state": "Telangana",
                "pincode": "500034",
                "latitude": 17.4126,
                "longitude": 78.4385,
                "phone_number": "+91 9876543210",
                "email": "velocity@khelo.in",
                "opening_time": time(9, 0),
                "closing_time": time(23, 59),
                "verification_status": VerificationStatus.VERIFIED,
                "is_active": True,
                "total_seats": 24,
                "amenities": ["wifi", "ac", "ps5", "food", "parking"],
                "photos": [
                    "https://images.unsplash.com/photo-1538481199705-c710c4e965fc?q=80&w=800&auto=format&fit=crop"
                ],
                "tiers": [
                    {
                        "name": "PS5 DualSense Lounge",
                        "description": "PlayStation 5, 4K HDR 65-inch OLED, DualSense Edge",
                        "specs": {"gpu": "PS5 Custom RDNA2", "cpu": "Zen 2", "ram": "16GB GDDR6", "monitor": "65-inch 4K OLED"},
                        "total_seats": 10,
                        "app_bookable_seats": 8,
                        "preset_category": "console_zone",
                        "price_per_hour": 150.0,
                        "is_active": True
                    }
                ]
            },
            {
                "name": "Respawn Gaming Club",
                "description": "Popular hangout spot in Bandra for college gamers & streamers.",
                "address_line1": "Bandra West, Hill Road",
                "city": "Mumbai",
                "state": "Maharashtra",
                "pincode": "400050",
                "latitude": 19.0596,
                "longitude": 72.8295,
                "phone_number": "+91 9822334455",
                "email": "respawn@khelo.in",
                "opening_time": time(10, 0),
                "closing_time": time(2, 0),
                "verification_status": VerificationStatus.VERIFIED,
                "is_active": True,
                "total_seats": 35,
                "amenities": ["wifi", "ac", "food", "snacks", "streamer_booth"],
                "photos": [
                    "https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=800&auto=format&fit=crop"
                ],
                "tiers": [
                    {
                        "name": "RTX 4070 Super Rig",
                        "description": "i7 13700K, RTX 4070, 240Hz Gaming Display",
                        "specs": {"gpu": "RTX 4070 Super", "cpu": "i7-13700K", "ram": "32GB", "monitor": "240Hz QHD"},
                        "total_seats": 20,
                        "app_bookable_seats": 16,
                        "preset_category": "pro_gamer",
                        "price_per_hour": 180.0,
                        "is_active": True
                    }
                ]
            },
            {
                "name": "Overclock Arena",
                "description": "Pune's biggest gaming arena with 50+ stations and official tournament stages.",
                "address_line1": "Viman Nagar, Datta Mandir Chowk",
                "city": "Pune",
                "state": "Maharashtra",
                "pincode": "411014",
                "latitude": 18.5679,
                "longitude": 73.9143,
                "phone_number": "+91 9890112233",
                "email": "overclock@khelo.in",
                "opening_time": time(9, 0),
                "closing_time": time(23, 0),
                "verification_status": VerificationStatus.VERIFIED,
                "is_active": True,
                "total_seats": 50,
                "amenities": ["wifi", "ac", "food", "stage", "headsets"],
                "photos": [
                    "https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=800&auto=format&fit=crop"
                ],
                "tiers": [
                    {
                        "name": "Pro Esports 360Hz Tier",
                        "description": "Ryzen 7 7800X3D, RTX 4080, BenQ 360Hz DyAc+",
                        "specs": {"gpu": "RTX 4080", "cpu": "Ryzen 7 7800X3D", "ram": "32GB", "monitor": "360Hz DyAc+"},
                        "total_seats": 30,
                        "app_bookable_seats": 24,
                        "preset_category": "pro_gamer",
                        "price_per_hour": 200.0,
                        "is_active": True
                    }
                ]
            }
        ]

        for cdata in cafes_data:
            existing = await session.execute(select(Cafe).where(Cafe.name == cdata["name"]))
            if existing.scalar_one_or_none():
                continue

            tiers_info = cdata.pop("tiers")
            cdata["owner_id"] = owner.id
            cafe_obj = Cafe(**cdata)
            session.add(cafe_obj)
            await session.commit()
            await session.refresh(cafe_obj)

            for tinfo in tiers_info:
                tinfo["cafe_id"] = cafe_obj.id
                tier_obj = HardwareTier(**tinfo)
                session.add(tier_obj)
            await session.commit()

        print("Seeded extra multi-city cafes successfully!")

if __name__ == "__main__":
    asyncio.run(seed_extra())
