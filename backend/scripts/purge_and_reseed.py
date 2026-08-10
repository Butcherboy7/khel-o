"""
Full purge script to wipe all fake/test cafes from database and re-seed only clean, high-quality real Indian gaming cafes across Hyderabad, Bengaluru, Mumbai, Pune, Delhi, and Chennai.
"""
import asyncio
import sys
import os
from datetime import time
from uuid import uuid4

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import delete, select
from app.database import AsyncSessionLocal
from app.models.cafe import Cafe, VerificationStatus
from app.models.hardware_tier import HardwareTier
from app.models.user import User

REALISTIC_CAFES = [
    {
        "name": "Velocity Esports Lounge",
        "description": "Hyderabad's premier gaming hub featuring RTX 4080 stations, 240Hz OLED screens, PS5 & Nintendo Switch lounges.",
        "address_line1": "Road No. 12, Banjara Hills",
        "city": "Hyderabad",
        "state": "Telangana",
        "pincode": "500034",
        "latitude": 17.4126,
        "longitude": 78.4385,
        "phone_number": "+91 9876543210",
        "email": "velocity.hyd@khelo.in",
        "opening_time": time(10, 0),
        "closing_time": time(2, 0),
        "verification_status": VerificationStatus.VERIFIED,
        "is_active": True,
        "total_seats": 30,
        "amenities": ["wifi", "ac", "ps5", "nintendo_switch", "food", "parking", "rtx_4080"],
        "photos": [
            "https://images.unsplash.com/photo-1538481199705-c710c4e965fc?q=80&w=800&auto=format&fit=crop",
            "https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=800&auto=format&fit=crop"
        ],
        "tiers": [
            {
                "name": "RTX 4080 Beast Station",
                "description": "NVIDIA GeForce RTX 4080, Intel i9 13900K, 240Hz OLED Monitor, Valorant & CS2 ready",
                "specs": {"gpu": "RTX 4080", "cpu": "i9-13900K", "ram": "32GB DDR5", "monitor": "240Hz OLED"},
                "total_seats": 18,
                "app_bookable_seats": 14,
                "preset_category": "vip_suite",
                "price_per_hour": 220.0,
                "is_active": True
            },
            {
                "name": "PS5 & Switch DualSense Zone",
                "description": "PlayStation 5, Nintendo Switch OLED, 4K HDR 65-inch OLED, DualSense Edge controllers",
                "specs": {"gpu": "PS5 Custom RDNA2", "cpu": "Zen 2", "ram": "16GB GDDR6", "monitor": "65-inch 4K OLED", "consoles": ["PS5", "Nintendo Switch"]},
                "total_seats": 12,
                "app_bookable_seats": 10,
                "preset_category": "console_zone",
                "price_per_hour": 150.0,
                "is_active": True
            }
        ]
    },
    {
        "name": "Gamers Guild Arena",
        "description": "Hyderabad's ultimate esports arena with RTX 4090 stations, private streaming booths, and gourmet café.",
        "address_line1": "Road No. 36, Jubilee Hills",
        "city": "Hyderabad",
        "state": "Telangana",
        "pincode": "500033",
        "latitude": 17.4325,
        "longitude": 78.4071,
        "phone_number": "+91 9988776655",
        "email": "guild.hyd@khelo.in",
        "opening_time": time(9, 0),
        "closing_time": time(3, 0),
        "verification_status": VerificationStatus.VERIFIED,
        "is_active": True,
        "total_seats": 40,
        "amenities": ["wifi", "ac", "food", "ps5", "streaming", "valet_parking"],
        "photos": [
            "https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=800&auto=format&fit=crop",
            "https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=800&auto=format&fit=crop"
        ],
        "tiers": [
            {
                "name": "RTX 4090 Ultra VIP Tier",
                "description": "Core i9-14900KS, RTX 4090, 360Hz BenQ ZOWIE Esports Monitor",
                "specs": {"gpu": "RTX 4090", "cpu": "Intel i9-14900KS", "ram": "64GB DDR5", "monitor": "25'' 360Hz"},
                "total_seats": 20,
                "app_bookable_seats": 16,
                "preset_category": "ultra_streamer",
                "price_per_hour": 250.0,
                "is_active": True
            },
            {
                "name": "Esports Standard PC",
                "description": "Core i7-13700K, RTX 4070, 240Hz Gaming Display",
                "specs": {"gpu": "RTX 4070", "cpu": "i7-13700K", "ram": "32GB", "monitor": "240Hz QHD"},
                "total_seats": 20,
                "app_bookable_seats": 16,
                "preset_category": "pro_gamer",
                "price_per_hour": 160.0,
                "is_active": True
            }
        ]
    },
    {
        "name": "LXG Esports Arena",
        "description": "Bengaluru's iconic esports facility with 360Hz BenQ monitors, RTX 4080 Super rigs, and Secretlab chairs.",
        "address_line1": "100 Feet Road, Indiranagar",
        "city": "Bengaluru",
        "state": "Karnataka",
        "pincode": "560038",
        "latitude": 12.9784,
        "longitude": 77.6408,
        "phone_number": "+91 9876541122",
        "email": "lxg.blr@khelo.in",
        "opening_time": time(9, 30),
        "closing_time": time(1, 0),
        "verification_status": VerificationStatus.VERIFIED,
        "is_active": True,
        "total_seats": 35,
        "amenities": ["wifi", "ac", "food", "headsets", "streaming"],
        "photos": [
            "https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=800&auto=format&fit=crop",
            "https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=800&auto=format&fit=crop"
        ],
        "tiers": [
            {
                "name": "Flagship RTX 4080 Super Tier",
                "description": "Intel i9-14900K, RTX 4080 Super, 240Hz 2K Display, Logitech G Pro Peripherals",
                "specs": {"gpu": "RTX 4080 Super", "cpu": "Intel i9-14900K", "ram": "32GB DDR5", "monitor": "27'' 240Hz 2K"},
                "total_seats": 20,
                "app_bookable_seats": 15,
                "preset_category": "ultra_streamer",
                "price_per_hour": 200.0,
                "is_active": True
            },
            {
                "name": "Pro Gaming Tier",
                "description": "Ryzen 7 7800X3D, RTX 4070, 180Hz 1080p Display",
                "specs": {"gpu": "RTX 4070", "cpu": "Ryzen 7 7800X3D", "ram": "16GB DDR5", "monitor": "24'' 180Hz"},
                "total_seats": 15,
                "app_bookable_seats": 12,
                "preset_category": "pro_gaming",
                "price_per_hour": 140.0,
                "is_active": True
            }
        ]
    },
    {
        "name": "Respawn Gaming Club",
        "description": "Mumbai's hot gaming lounge in Bandra with liquid-cooled rigs and 4K PS5 couch gaming setups.",
        "address_line1": "Hill Road, Bandra West",
        "city": "Mumbai",
        "state": "Maharashtra",
        "pincode": "400050",
        "latitude": 19.0596,
        "longitude": 72.8295,
        "phone_number": "+91 9822334455",
        "email": "respawn.bom@khelo.in",
        "opening_time": time(10, 0),
        "closing_time": time(2, 0),
        "verification_status": VerificationStatus.VERIFIED,
        "is_active": True,
        "total_seats": 30,
        "amenities": ["wifi", "ac", "food", "snacks", "streamer_booth", "ps5"],
        "photos": [
            "https://images.unsplash.com/photo-1538481199705-c710c4e965fc?q=80&w=800&auto=format&fit=crop"
        ],
        "tiers": [
            {
                "name": "RTX 4070 Ti Super Rig",
                "description": "i7 14700K, RTX 4070 Ti Super, 240Hz QHD Gaming Display",
                "specs": {"gpu": "RTX 4070 Ti Super", "cpu": "i7-14700K", "ram": "32GB", "monitor": "240Hz QHD"},
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
        "description": "Pune's largest gaming arena with 50+ stations, official tournament stage, and VR zone.",
        "address_line1": "Datta Mandir Chowk, Viman Nagar",
        "city": "Pune",
        "state": "Maharashtra",
        "pincode": "411014",
        "latitude": 18.5679,
        "longitude": 73.9143,
        "phone_number": "+91 9890112233",
        "email": "overclock.pne@khelo.in",
        "opening_time": time(9, 0),
        "closing_time": time(23, 30),
        "verification_status": VerificationStatus.VERIFIED,
        "is_active": True,
        "total_seats": 40,
        "amenities": ["wifi", "ac", "food", "stage", "headsets", "vr_zone"],
        "photos": [
            "https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=800&auto=format&fit=crop"
        ],
        "tiers": [
            {
                "name": "Pro Esports 360Hz Tier",
                "description": "Ryzen 7 7800X3D, RTX 4080, BenQ 360Hz DyAc+",
                "specs": {"gpu": "RTX 4080", "cpu": "Ryzen 7 7800X3D", "ram": "32GB", "monitor": "360Hz DyAc+"},
                "total_seats": 25,
                "app_bookable_seats": 20,
                "preset_category": "pro_gamer",
                "price_per_hour": 190.0,
                "is_active": True
            }
        ]
    },
    {
        "name": "CyberStorm Gaming Hub",
        "description": "Delhi's favorite esports spot in Connaught Place with high-FPS gaming PCs and live tournament screenings.",
        "address_line1": "Block C, Connaught Place",
        "city": "Delhi",
        "state": "Delhi",
        "pincode": "110001",
        "latitude": 28.6315,
        "longitude": 77.2167,
        "phone_number": "+91 9811223344",
        "email": "cyberstorm.del@khelo.in",
        "opening_time": time(10, 0),
        "closing_time": time(1, 30),
        "verification_status": VerificationStatus.VERIFIED,
        "is_active": True,
        "total_seats": 35,
        "amenities": ["wifi", "ac", "food", "headsets", "parking"],
        "photos": [
            "https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=800&auto=format&fit=crop"
        ],
        "tiers": [
            {
                "name": "Esports Beast PC",
                "description": "Core i7-13700F, RTX 4070, 240Hz Display",
                "specs": {"gpu": "RTX 4070", "cpu": "i7-13700F", "ram": "32GB", "monitor": "240Hz 1080p"},
                "total_seats": 25,
                "app_bookable_seats": 20,
                "preset_category": "pro_gamer",
                "price_per_hour": 150.0,
                "is_active": True
            }
        ]
    }
]

async def purge_and_reseed():
    async with AsyncSessionLocal() as session:
        # Find owner account
        user_res = await session.execute(select(User).where(User.email == 'owner@example.com'))
        owner = user_res.scalar_one_or_none()
        if not owner:
            print("ERROR: owner@example.com not found in database!")
            return

        print("Purging ALL existing cafes from database...")
        # Delete hardware tiers & cafes
        await session.execute(delete(HardwareTier))
        await session.execute(delete(Cafe))
        await session.commit()
        print("Database wiped clean of all old/dummy cafes.")

        print("Inserting clean realistic venues...")
        for cdata in REALISTIC_CAFES:
            tiers_info = cdata.pop("tiers")
            cdata["owner_id"] = owner.id
            if "bookable_stations" not in cdata or cdata["bookable_stations"] == 0:
                cdata["bookable_stations"] = cdata.get("total_seats", 30)
            cafe_obj = Cafe(**cdata)
            session.add(cafe_obj)
            await session.commit()
            await session.refresh(cafe_obj)

            for tinfo in tiers_info:
                tinfo["cafe_id"] = cafe_obj.id
                tier_obj = HardwareTier(**tinfo)
                session.add(tier_obj)
            await session.commit()
            print(f"  + Seeded: {cafe_obj.name} ({cafe_obj.city})")

        print("\nSUCCESS! Wiped all garbage/test cafes. Only 6 clean, realistic gaming venues remain!")

if __name__ == "__main__":
    asyncio.run(purge_and_reseed())
