import asyncio
import os
import sys
from pathlib import Path
import uuid
from datetime import time, datetime, timezone, date, timedelta

# Anchor script import path to backend directory
BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import select, delete, text
from app.database import AsyncSessionLocal
from app.models.user import User, UserRole
from app.models.user_role import UserRoleMapping
from app.models.cafe import Cafe, VerificationStatus
from app.models.hardware_tier import HardwareTier
from app.models.booking import Booking, BookingStatus
from app.models.payment import Payment
from app.models.review import Review
from app.models.promotion import Promotion
from app.models.staff_invitation import StaffInvitation
from app.core.security import get_password_hash

REALISTIC_CAFES = [
    {
        "name": "LXG Gaming Lounge",
        "city": "Bengaluru",
        "address": "100 Feet Road, Indiranagar",
        "state": "Karnataka",
        "pincode": "560038",
        "lat": 12.9784,
        "lng": 77.6408,
        "phone": "+91 98765 43210",
        "email": "lxg.blr@khelo.in",
        "description": "Bengaluru's legendary premier esports arena featuring tournament-grade RTX 4080 Super rigs, 240Hz OLEDs, and private PS5 VIP pods with dedicated gigabit fiber.",
        "opening_time": time(9, 0),
        "closing_time": time(1, 0),
        "amenities": ["wifi", "ac", "fiber_1gbps", "mechanical_keyboards", "snack_bar", "ps5_pods", "streaming_booth", "valet_parking"],
        "supported_games": ["Valorant", "CS2", "Dota 2", "EA FC 24", "Apex Legends", "Tekken 8", "Cyberpunk 2077"],
        "photos": [
            "https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=1200&auto=format&fit=crop",
            "https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1200&auto=format&fit=crop",
            "https://images.unsplash.com/photo-1538481199705-c710c4e965fc?q=80&w=1200&auto=format&fit=crop"
        ],
        "cancellation_policy": "Full refund up to 2 hours before session start. 50% refund within 2 hours.",
        "house_rules": ["Valid ID required at check-in", "Outside food not allowed inside gaming zones", "Clean desk policy"],
        "tiers": [
            {
                "name": "Flagship RTX 4080 Super",
                "description": "Intel i9-14900K, RTX 4080 Super, 240Hz 2K Display, Logitech G Pro Peripherals",
                "specs": {"gpu": "RTX 4080 Super", "cpu": "Intel i9-14900K", "ram": "32GB DDR5", "monitor": "27\" 240Hz 2K", "peripherals": "Logitech G Pro X Superlight"},
                "total_seats": 20,
                "app_bookable_seats": 16,
                "preset_category": "ultra_streamer",
                "price_per_hour": 220.0,
            },
            {
                "name": "Pro Esports Tier RTX 4070",
                "description": "Ryzen 7 7800X3D, RTX 4070, 180Hz Fast IPS, ZOWIE EC2 Mouse",
                "specs": {"gpu": "RTX 4070", "cpu": "Ryzen 7 7800X3D", "ram": "32GB DDR5", "monitor": "24.5\" 180Hz IPS", "peripherals": "HyperX Alloy Origins"},
                "total_seats": 20,
                "app_bookable_seats": 16,
                "preset_category": "pro_gaming",
                "price_per_hour": 150.0,
            },
            {
                "name": "PS5 VIP Pods",
                "description": "PlayStation 5 Console, 55\" 4K 120Hz OLED TV, DualSense Edge & Recliners",
                "specs": {"gpu": "PS5 Custom RDNA2", "cpu": "Zen 2", "ram": "16GB GDDR6", "monitor": "55\" 4K 120Hz OLED", "audio": "Pulse 3D Wireless"},
                "total_seats": 8,
                "app_bookable_seats": 6,
                "preset_category": "console_lounge",
                "price_per_hour": 120.0,
            }
        ]
    },
    {
        "name": "Respawn Esports Arena",
        "city": "Bengaluru",
        "address": "80 Feet Road, Koramangala 4th Block",
        "state": "Karnataka",
        "pincode": "560034",
        "lat": 12.9352,
        "lng": 77.6245,
        "phone": "+91 98765 43211",
        "email": "respawn.blr@khelo.in",
        "description": "Elite tournament venue in Koramangala boasting an RTX 4090 Tournament Zone, Fanatec Sim Racing rigs, and a live broadcast stage.",
        "opening_time": time(10, 0),
        "closing_time": time(2, 0),
        "amenities": ["wifi", "ac", "fiber_1gbps", "sim_racing", "tournament_stage", "food_beverages", "broadcast_studio"],
        "supported_games": ["Valorant", "CS2", "Assetto Corsa", "F1 24", "Rocket League", "Rainbow Six Siege"],
        "photos": [
            "https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1200&auto=format&fit=crop",
            "https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=1200&auto=format&fit=crop",
            "https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=1200&auto=format&fit=crop"
        ],
        "cancellation_policy": "Full refund up to 2 hours before session start.",
        "house_rules": ["Strictly no account sharing", "Wear socks in sim racing cockpits"],
        "tiers": [
            {
                "name": "RTX 4090 Tournament Zone",
                "description": "Intel i9-14900KS, RTX 4090 24GB, 360Hz BenQ ZOWIE DyAc 2 Display",
                "specs": {"gpu": "RTX 4090 24GB", "cpu": "Intel i9-14900KS", "ram": "64GB DDR5", "monitor": "24.5\" 360Hz DyAc 2", "peripherals": "Wooting 60HE + Razer Viper V3 Pro"},
                "total_seats": 16,
                "app_bookable_seats": 12,
                "preset_category": "ultra_streamer",
                "price_per_hour": 280.0,
            },
            {
                "name": "Sim Racing Motion Rig",
                "description": "Fanatec Direct Drive Pro Wheel, Load Cell Pedals, Triple Curved 32\" 165Hz",
                "specs": {"gpu": "RTX 4080", "cpu": "Ryzen 7 7800X3D", "ram": "32GB", "monitor": "Triple 32\" 165Hz Curved", "wheel": "Fanatec DD 8Nm"},
                "total_seats": 4,
                "app_bookable_seats": 3,
                "preset_category": "sim_racing",
                "price_per_hour": 250.0,
            },
            {
                "name": "RTX 4070 Ti Competitive Tier",
                "description": "Ryzen 7 7800X3D, RTX 4070 Ti Super, 240Hz Fast IPS Display",
                "specs": {"gpu": "RTX 4070 Ti Super", "cpu": "Ryzen 7 7800X3D", "ram": "32GB DDR5", "monitor": "27\" 240Hz IPS", "peripherals": "SteelSeries Apex Pro"},
                "total_seats": 24,
                "app_bookable_seats": 20,
                "preset_category": "pro_gaming",
                "price_per_hour": 150.0,
            }
        ]
    },
    {
        "name": "Immortal Gaming Hub",
        "city": "Mumbai",
        "address": "Off Link Road, Andheri West",
        "state": "Maharashtra",
        "pincode": "400053",
        "lat": 19.1363,
        "lng": 72.8277,
        "phone": "+91 98200 11223",
        "email": "immortal.mum@khelo.in",
        "description": "Mumbai's favorite esports hub equipped with RTX 4070 Ti competitive battle stations, ultra-fast fiber, and a luxury console lounge.",
        "opening_time": time(10, 0),
        "closing_time": time(3, 0),
        "amenities": ["wifi", "ac", "snacks", "cafe_bar", "surround_sound", "high_refresh_monitors", "console_lounge"],
        "supported_games": ["Valorant", "CS2", "GTA V", "EA FC 24", "Mortal Kombat 1", "Overwatch 2"],
        "photos": [
            "https://images.unsplash.com/photo-1538481199705-c710c4e965fc?q=80&w=1200&auto=format&fit=crop",
            "https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=1200&auto=format&fit=crop"
        ],
        "cancellation_policy": "Full refund up to 1 hour before session start.",
        "house_rules": ["Respect hardware and equipment", "No loud profanity during tournament hours"],
        "tiers": [
            {
                "name": "RTX 4070 Ti Esports Rig",
                "description": "Intel i7-14700K, RTX 4070 Ti, 240Hz 2K Display, Logitech G Peripherals",
                "specs": {"gpu": "RTX 4070 Ti", "cpu": "Intel i7-14700K", "ram": "32GB DDR5", "monitor": "27\" 240Hz 2K", "peripherals": "Logitech G Pro Keyboard"},
                "total_seats": 20,
                "app_bookable_seats": 16,
                "preset_category": "pro_gaming",
                "price_per_hour": 200.0,
            },
            {
                "name": "RTX 4060 Mainstage",
                "description": "Ryzen 5 7600X, RTX 4060 8GB, 165Hz IPS Display",
                "specs": {"gpu": "RTX 4060", "cpu": "Ryzen 5 7600X", "ram": "16GB DDR5", "monitor": "24\" 165Hz IPS", "peripherals": "Razer BlackWidow"},
                "total_seats": 20,
                "app_bookable_seats": 16,
                "preset_category": "esports_starter",
                "price_per_hour": 130.0,
            },
            {
                "name": "Console & Chill Lounge",
                "description": "PS5 & Xbox Series X, 65\" 4K HDR TV, 4-Player Couch Co-op",
                "specs": {"gpu": "PS5 / Xbox Series X", "cpu": "Custom AMD", "ram": "16GB", "monitor": "65\" 4K HDR", "controllers": "4x Wireless"},
                "total_seats": 10,
                "app_bookable_seats": 8,
                "preset_category": "console_lounge",
                "price_per_hour": 100.0,
            }
        ]
    },
    {
        "name": "Havoc Gaming Lounge",
        "city": "Delhi",
        "address": "Hauz Khas Village Main Road",
        "state": "Delhi",
        "pincode": "110016",
        "lat": 28.5535,
        "lng": 77.1947,
        "phone": "+91 98112 23344",
        "email": "havoc.del@khelo.in",
        "description": "Delhi's high-octane competitive arena with 360Hz displays, soundproof creator streaming pods, and 24/7 air conditioning.",
        "opening_time": time(9, 30),
        "closing_time": time(2, 0),
        "amenities": ["wifi", "ac", "streamer_pods", "broadcast_studio", "fiber_1gbps", "cafe", "high_speed_fiber"],
        "supported_games": ["Valorant", "CS2", "Apex Legends", "Fortnite", "Call of Duty: Warzone", "PUBG PC"],
        "photos": [
            "https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=1200&auto=format&fit=crop",
            "https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=1200&auto=format&fit=crop"
        ],
        "cancellation_policy": "Cancellation allowed up to 2 hours before booking.",
        "house_rules": ["Food and beverages allowed only at dining bar", "ID verification required"],
        "tiers": [
            {
                "name": "360Hz Apex Arena",
                "description": "Intel i9-14900K, RTX 4080 Super, 360Hz BenQ Zowie Display",
                "specs": {"gpu": "RTX 4080 Super", "cpu": "Intel i9-14900K", "ram": "32GB DDR5", "monitor": "24.5\" 360Hz", "peripherals": "Razer Huntsman V3"},
                "total_seats": 18,
                "app_bookable_seats": 14,
                "preset_category": "ultra_streamer",
                "price_per_hour": 250.0,
            },
            {
                "name": "Creator & Streamer Pods",
                "description": "Dual PC Setup, Shure SM7B Mic, Sony A6400 DSLR Cam, Elgato Stream Deck",
                "specs": {"gpu": "RTX 4080 + RTX 3060 Encoding", "cpu": "Ryzen 9 7900X", "ram": "64GB", "monitor": "Dual 27\" 240Hz", "mic": "Shure SM7B"},
                "total_seats": 6,
                "app_bookable_seats": 4,
                "preset_category": "streamer_pod",
                "price_per_hour": 220.0,
            },
            {
                "name": "Competitive Tier",
                "description": "Intel i5-13600K, RTX 4060 Ti, 180Hz IPS Display",
                "specs": {"gpu": "RTX 4060 Ti", "cpu": "Intel i5-13600K", "ram": "16GB DDR5", "monitor": "24\" 180Hz IPS"},
                "total_seats": 24,
                "app_bookable_seats": 20,
                "preset_category": "pro_gaming",
                "price_per_hour": 120.0,
            }
        ]
    },
    {
        "name": "Matrix Cyber Lounge",
        "city": "Bengaluru",
        "address": "27th Main, Sector 1, HSR Layout",
        "state": "Karnataka",
        "pincode": "560102",
        "lat": 12.9121,
        "lng": 77.6446,
        "phone": "+91 98450 67890",
        "email": "matrix.blr@khelo.in",
        "description": "24/7 all-night gaming sanctuary in HSR Layout with midnight hot kitchen, overnight passes, and high-performance RTX rigs.",
        "opening_time": time(0, 0),
        "closing_time": time(23, 59),
        "amenities": ["wifi", "ac", "24_7_open", "overnight_passes", "midnight_kitchen", "ergonomic_chairs", "power_backup"],
        "supported_games": ["Valorant", "League of Legends", "Dota 2", "CS2", "Elden Ring", "Helldivers 2"],
        "photos": [
            "https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=1200&auto=format&fit=crop",
            "https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1200&auto=format&fit=crop"
        ],
        "cancellation_policy": "Full refund up to 1 hour before scheduled time.",
        "house_rules": ["24/7 Security on site", "Government ID mandatory for overnight passes"],
        "tiers": [
            {
                "name": "RTX 4070 Night Owl Zone",
                "description": "Intel i7-13700K, RTX 4070 12GB, 240Hz 2K Display, Secretlab TITAN Chairs",
                "specs": {"gpu": "RTX 4070 12GB", "cpu": "Intel i7-13700K", "ram": "32GB DDR5", "monitor": "27\" 240Hz 2K", "chair": "Secretlab TITAN Evo"},
                "total_seats": 25,
                "app_bookable_seats": 20,
                "preset_category": "pro_gaming",
                "price_per_hour": 160.0,
            },
            {
                "name": "RTX 4060 Esports Squads",
                "description": "Ryzen 5 5600X, RTX 4060, 165Hz 1080p Display",
                "specs": {"gpu": "RTX 4060", "cpu": "Ryzen 5 5600X", "ram": "16GB DDR4", "monitor": "24\" 165Hz", "peripherals": "Cosmic Byte Mechanical"},
                "total_seats": 30,
                "app_bookable_seats": 25,
                "preset_category": "esports_starter",
                "price_per_hour": 90.0,
            }
        ]
    },
    {
        "name": "PlayMax Esports Zone",
        "city": "Hyderabad",
        "address": "Hitech City Main Road, Madhapur",
        "state": "Telangana",
        "pincode": "500081",
        "lat": 17.4483,
        "lng": 78.3915,
        "phone": "+91 99887 76655",
        "email": "playmax.hyd@khelo.in",
        "description": "Hyderabad tech corridor's flagship esports center with dedicated 1Gbps fiber line, RTX 4080 rigs, and private bootcamp rooms.",
        "opening_time": time(9, 0),
        "closing_time": time(2, 0),
        "amenities": ["wifi", "ac", "fiber_1gbps", "dedicated_gigabit", "snack_bar", "high_speed_wifi", "bootcamp_rooms"],
        "supported_games": ["Valorant", "CS2", "PUBG", "Rainbow Six Siege", "EA FC 24", "Overwatch 2"],
        "photos": [
            "https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1200&auto=format&fit=crop",
            "https://images.unsplash.com/photo-1538481199705-c710c4e965fc?q=80&w=1200&auto=format&fit=crop"
        ],
        "cancellation_policy": "Full refund up to 2 hours before session start.",
        "house_rules": ["No food or unsealed drinks at computer stations", "Quiet zone in bootcamp rooms"],
        "tiers": [
            {
                "name": "RTX 4080 Elite Tier",
                "description": "Intel i9-14900K, RTX 4080 16GB, 240Hz OLED 2K Display",
                "specs": {"gpu": "RTX 4080 16GB", "cpu": "Intel i9-14900K", "ram": "32GB DDR5", "monitor": "27\" 240Hz OLED", "peripherals": "Razer DeathAdder V3"},
                "total_seats": 20,
                "app_bookable_seats": 16,
                "preset_category": "ultra_streamer",
                "price_per_hour": 210.0,
            },
            {
                "name": "RTX 4060 Pro Tier",
                "description": "Ryzen 7 7700X, RTX 4060 8GB, 180Hz Fast IPS Display",
                "specs": {"gpu": "RTX 4060", "cpu": "Ryzen 7 7700X", "ram": "16GB DDR5", "monitor": "24\" 180Hz IPS", "peripherals": "Logitech G502 HERO"},
                "total_seats": 30,
                "app_bookable_seats": 25,
                "preset_category": "pro_gaming",
                "price_per_hour": 110.0,
            }
        ]
    },
    {
        "name": "GearUp Gaming Cafe",
        "city": "Pune",
        "address": "Viman Nagar Central, Near Symbiosis",
        "state": "Maharashtra",
        "pincode": "411014",
        "lat": 18.5679,
        "lng": 73.9143,
        "phone": "+91 91234 56789",
        "email": "gearup.pune@khelo.in",
        "description": "Pune's premier student and esports destination featuring RTX 3080/4070 hybrid battle stations, PS5 zones, and artisan cafe.",
        "opening_time": time(10, 0),
        "closing_time": time(23, 30),
        "amenities": ["wifi", "ac", "ps5_zone", "gaming_cafeteria", "fiber_network", "parking", "mechanical_keyboards"],
        "supported_games": ["Valorant", "CS2", "Rocket League", "EA FC 24", "Tekken 8", "Minecraft"],
        "photos": [
            "https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=1200&auto=format&fit=crop",
            "https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1200&auto=format&fit=crop"
        ],
        "cancellation_policy": "Full refund up to 1 hour prior to booking.",
        "house_rules": ["Student ID discounts valid with current college ID", "Keep voice level reasonable"],
        "tiers": [
            {
                "name": "RTX 4070 Hybrid Rig",
                "description": "Intel i7-13700K, RTX 4070, 240Hz 2K Display",
                "specs": {"gpu": "RTX 4070", "cpu": "Intel i7-13700K", "ram": "32GB DDR5", "monitor": "27\" 240Hz 2K"},
                "total_seats": 16,
                "app_bookable_seats": 12,
                "preset_category": "pro_gaming",
                "price_per_hour": 170.0,
            },
            {
                "name": "RTX 3080 Club Tier",
                "description": "Ryzen 7 5800X3D, RTX 3080 10GB, 165Hz Display",
                "specs": {"gpu": "RTX 3080", "cpu": "Ryzen 7 5800X3D", "ram": "16GB DDR4", "monitor": "24\" 165Hz"},
                "total_seats": 18,
                "app_bookable_seats": 14,
                "preset_category": "esports_starter",
                "price_per_hour": 120.0,
            },
            {
                "name": "PS5 Lounge Station",
                "description": "PlayStation 5 with 4K 120Hz OLED & 2x DualSense Controllers",
                "specs": {"gpu": "PS5 Custom RDNA2", "cpu": "Zen 2", "ram": "16GB", "monitor": "55\" 4K 120Hz OLED"},
                "total_seats": 8,
                "app_bookable_seats": 6,
                "preset_category": "console_lounge",
                "price_per_hour": 80.0,
            }
        ]
    }
]

async def clean_and_seed_realistic_cafes():
    print("Starting clean and seed realistic cafes...")
    async with AsyncSessionLocal() as session:
        # 1. Clean up old/throwaway cafes and cascaded data
        print("Cleaning up old test venues and orphaned records...")
        
        # Delete payments
        await session.execute(text("DELETE FROM payments"))
        # Delete reviews
        await session.execute(text("DELETE FROM reviews"))
        # Delete bookings
        await session.execute(text("DELETE FROM bookings"))
        # Delete hardware tiers
        await session.execute(text("DELETE FROM hardware_tiers"))
        # Delete promotions
        await session.execute(text("DELETE FROM promotions"))
        # Delete staff invitations
        await session.execute(text("DELETE FROM staff_invitations"))
        # Delete cafes
        await session.execute(text("DELETE FROM cafes"))
        
        # Clean up throwaway test users (starting with test_, gamer_, admin_, reset_, cancel_, etc.)
        # but PRESERVE uzair accounts, demo owner, demo admin, demo staff
        await session.execute(text("""
            DELETE FROM user_roles WHERE user_id IN (
                SELECT id FROM users 
                WHERE email NOT LIKE '%uzair%' 
                  AND email NOT IN ('owner@example.com', 'owner@khelo.in', 'owner@khel-o.test', 
                                    'admin@example.com', 'admin@khelo.in', 'admin@khel-o.test', 
                                    'staff@example.com', 'test@example.com')
            )
        """))
        await session.execute(text("""
            DELETE FROM users 
            WHERE email NOT LIKE '%uzair%' 
              AND email NOT IN ('owner@example.com', 'owner@khelo.in', 'owner@khel-o.test', 
                                'admin@example.com', 'admin@khelo.in', 'admin@khel-o.test', 
                                'staff@example.com', 'test@example.com')
        """))
        await session.commit()
        print("Old data cleaned successfully.")

        # 2. Ensure Owner Account
        hashed_password = get_password_hash("testpass123")
        owner_res = await session.execute(select(User).where(User.email == "owner@example.com"))
        owner = owner_res.scalar_one_or_none()
        if not owner:
            owner = User(
                id=uuid.uuid4(),
                email="owner@example.com",
                phone_number="+919876543210",
                password_hash=hashed_password,
                full_name="Rajesh Sharma (Owner)",
                role=UserRole.CAFE_OWNER,
                is_active=True
            )
            session.add(owner)
            session.add(UserRoleMapping(id=uuid.uuid4(), user_id=owner.id, role=UserRole.CAFE_OWNER, cafe_id=None))
            session.add(UserRoleMapping(id=uuid.uuid4(), user_id=owner.id, role=UserRole.GAMER, cafe_id=None))
            await session.commit()
            await session.refresh(owner)
        else:
            owner.password_hash = hashed_password
            owner.is_active = True
            await session.commit()

        # 3. Ensure Uzair accounts
        uzair_accounts = [
            ("uzair@gmail.com", "Uzair (Gamer)", UserRole.GAMER),
            ("uzair1@gmail.com", "Uzair 1", UserRole.GAMER),
            ("uzair2@gmail.com", "Uzair 2", UserRole.GAMER),
            ("uzair3@gmail.com", "Uzair 3", UserRole.GAMER),
        ]
        for email, name, role in uzair_accounts:
            u_res = await session.execute(select(User).where(User.email == email))
            u_obj = u_res.scalar_one_or_none()
            if not u_obj:
                u_obj = User(
                    id=uuid.uuid4(),
                    email=email,
                    password_hash=hashed_password,
                    full_name=name,
                    role=role,
                    is_active=True
                )
                session.add(u_obj)
                session.add(UserRoleMapping(id=uuid.uuid4(), user_id=u_obj.id, role=UserRole.GAMER, cafe_id=None))
            else:
                u_obj.password_hash = hashed_password
                u_obj.is_active = True
                stmt = select(UserRoleMapping).where(UserRoleMapping.user_id == u_obj.id, UserRoleMapping.role == UserRole.GAMER)
                res = await session.execute(stmt)
                if not res.scalars().first():
                    session.add(UserRoleMapping(id=uuid.uuid4(), user_id=u_obj.id, role=UserRole.GAMER, cafe_id=None))
        await session.commit()
        print("User accounts verified.")

        # 4. Seed Authentic Indian Lounges
        print("Seeding authentic esports venues...")
        today = date.today()
        seeded_cafes = 0
        total_tiers = 0

        for cafe_data in REALISTIC_CAFES:
            cafe_id = uuid.uuid4()
            total_seats = sum(t["total_seats"] for t in cafe_data["tiers"])
            app_bookable_seats = sum(t["app_bookable_seats"] for t in cafe_data["tiers"])
            
            cafe = Cafe(
                id=cafe_id,
                owner_id=owner.id,
                name=cafe_data["name"],
                description=cafe_data["description"],
                address_line1=cafe_data["address"],
                city=cafe_data["city"],
                state=cafe_data["state"],
                pincode=cafe_data["pincode"],
                latitude=cafe_data["lat"],
                longitude=cafe_data["lng"],
                phone_number=cafe_data["phone"],
                email=cafe_data["email"],
                opening_time=cafe_data["opening_time"],
                closing_time=cafe_data["closing_time"],
                verification_status=VerificationStatus.VERIFIED,
                is_active=True,
                is_emergency_mode=False,
                bookings_paused=False,
                total_seats=total_seats,
                app_bookable_seats=app_bookable_seats,
                bookable_stations=app_bookable_seats,
                reserved_walkin_seats=total_seats - app_bookable_seats,
                amenities=cafe_data["amenities"],
                photos=cafe_data["photos"],
                supported_games=cafe_data["supported_games"],
                cancellation_policy=cafe_data["cancellation_policy"],
                house_rules=cafe_data["house_rules"],
                social_links={
                    "instagram": f"https://instagram.com/{cafe_data['name'].lower().replace(' ', '')}",
                    "twitter": f"https://twitter.com/{cafe_data['name'].lower().replace(' ', '')}"
                }
            )
            session.add(cafe)
            await session.flush()

            for tier_data in cafe_data["tiers"]:
                tier = HardwareTier(
                    id=uuid.uuid4(),
                    cafe_id=cafe_id,
                    name=tier_data["name"],
                    description=tier_data["description"],
                    specs=tier_data["specs"],
                    total_seats=tier_data["total_seats"],
                    app_bookable_seats=tier_data["app_bookable_seats"],
                    reserved_walkin_seats=tier_data["total_seats"] - tier_data["app_bookable_seats"],
                    active_seats_count=tier_data["app_bookable_seats"],
                    preset_category=tier_data["preset_category"],
                    price_per_hour=tier_data["price_per_hour"],
                    is_active=True
                )
                session.add(tier)
                total_tiers += 1

            seeded_cafes += 1

        await session.commit()
        print(f"Successfully seeded {seeded_cafes} realistic cafes with {total_tiers} hardware tiers across India!")

if __name__ == "__main__":
    asyncio.run(clean_and_seed_realistic_cafes())
