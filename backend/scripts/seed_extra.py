import asyncio
from datetime import time
from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models.cafe import Cafe, VerificationStatus
from app.models.hardware_tier import HardwareTier
from app.models.user import User

async def seed_extra():
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(User).where((User.email == 'owner@khelo.com') | (User.email == 'owner@example.com'))
        )
        owner = result.scalars().first()
        if not owner:
            result = await session.execute(select(User))
            owner = result.scalars().first()
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
                "amenities": ["wifi", "ac", "ps5", "food", "parking", "vr_setup"],
                "photos": [
                    "https://images.unsplash.com/photo-1538481199705-c710c4e965fc?q=80&w=800&auto=format&fit=crop",
                    "https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=800&auto=format&fit=crop"
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
                    },
                    {
                        "name": "RTX 4080 Ultra Gaming Pod",
                        "description": "Intel i9 14900K, RTX 4080 16GB, 240Hz OLED Curved Display",
                        "specs": {"gpu": "RTX 4080", "cpu": "i9-14900K", "ram": "32GB DDR5", "monitor": "240Hz OLED Curved"},
                        "total_seats": 14,
                        "app_bookable_seats": 12,
                        "preset_category": "pro_gamer",
                        "price_per_hour": 220.0,
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
                    },
                    {
                        "name": "Streamer Studio Booth",
                        "description": "Private soundproof booth with dual 4K monitors, Shure SM7B mic & Logitech StreamCam",
                        "specs": {"gpu": "RTX 4090", "cpu": "Ryzen 9 7950X", "ram": "64GB DDR5", "monitor": "Dual 27-inch 4K"},
                        "total_seats": 5,
                        "app_bookable_seats": 4,
                        "preset_category": "streamer_booth",
                        "price_per_hour": 350.0,
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
            },
            {
                "name": "Pixel Vault Esports",
                "description": "Bengaluru's premier flagship gaming hub located in Indiranagar. Featuring 4K 144Hz setups and artisanal cafe food.",
                "address_line1": "100 Feet Road, Indiranagar",
                "city": "Bengaluru",
                "state": "Karnataka",
                "pincode": "560038",
                "latitude": 12.9716,
                "longitude": 77.6412,
                "phone_number": "+91 9741009988",
                "email": "pixelvault@khelo.in",
                "opening_time": time(8, 0),
                "closing_time": time(1, 0),
                "verification_status": VerificationStatus.VERIFIED,
                "is_active": True,
                "total_seats": 40,
                "amenities": ["wifi", "ac", "food", "coffee_bar", "parking", "recharge_station"],
                "photos": [
                    "https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=800&auto=format&fit=crop"
                ],
                "tiers": [
                    {
                        "name": "RTX 4090 Flagship Zone",
                        "description": "i9 14900KS, RTX 4090 24GB, Asus ROG 540Hz Esports Display",
                        "specs": {"gpu": "RTX 4090", "cpu": "i9-14900KS", "ram": "64GB DDR5", "monitor": "Asus ROG 540Hz"},
                        "total_seats": 20,
                        "app_bookable_seats": 16,
                        "preset_category": "pro_gamer",
                        "price_per_hour": 300.0,
                        "is_active": True
                    },
                    {
                        "name": "Casual Gaming Lounge",
                        "description": "RTX 4060 Ti, 180Hz 1080p Ergonomic Setup",
                        "specs": {"gpu": "RTX 4060 Ti", "cpu": "i5-13400F", "ram": "16GB DDR4", "monitor": "180Hz Full HD"},
                        "total_seats": 20,
                        "app_bookable_seats": 15,
                        "preset_category": "budget_friendly",
                        "price_per_hour": 120.0,
                        "is_active": True
                    }
                ]
            },
            {
                "name": "Neon Matrix Gaming Lounge",
                "description": "Cyberpunk-themed lounge in Cyber City Cyber Hub with futuristic RGB pods, VR simulation bays, and gourmet snacks.",
                "address_line1": "DLF Cyber City, Phase 2",
                "city": "Gurugram",
                "state": "Haryana",
                "pincode": "122002",
                "latitude": 28.4950,
                "longitude": 77.0895,
                "phone_number": "+91 9910223344",
                "email": "neonmatrix@khelo.in",
                "opening_time": time(11, 0),
                "closing_time": time(3, 0),
                "verification_status": VerificationStatus.VERIFIED,
                "is_active": True,
                "total_seats": 30,
                "amenities": ["wifi", "ac", "vr_setup", "energy_drinks", "snacks", "valet_parking"],
                "photos": [
                    "https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=800&auto=format&fit=crop"
                ],
                "tiers": [
                    {
                        "name": "Full Motion VR Sim Bay",
                        "description": "Meta Quest Pro & Valve Index with Racing Cockpit Sim Rig",
                        "specs": {"gpu": "RTX 4090", "cpu": "i9 14900K", "ram": "64GB", "monitor": "VR Headset + 55inch telemetry display"},
                        "total_seats": 6,
                        "app_bookable_seats": 5,
                        "preset_category": "vr_zone",
                        "price_per_hour": 400.0,
                        "is_active": True
                    },
                    {
                        "name": "RTX 4070 Ti Cyber Pod",
                        "description": "Ryzen 7 7700X, RTX 4070 Ti, Secretlab Gaming Chair",
                        "specs": {"gpu": "RTX 4070 Ti", "cpu": "Ryzen 7 7700X", "ram": "32GB", "monitor": "240Hz WQHD"},
                        "total_seats": 24,
                        "app_bookable_seats": 20,
                        "preset_category": "pro_gamer",
                        "price_per_hour": 220.0,
                        "is_active": True
                    }
                ]
            },
            # 6. HyperDrive Esports Club - Mumbai
            {
                "name": "HyperDrive Esports Club",
                "description": "State of the art gaming hub in Powai with RTX 4090 rigs, liquid nitrogen cooling showcases, and high-speed fiber internet.",
                "address_line1": "Hiranandani Gardens, Powai",
                "city": "Mumbai",
                "state": "Maharashtra",
                "pincode": "400076",
                "latitude": 19.1197,
                "longitude": 72.9051,
                "phone_number": "+91 9811223344",
                "email": "hyperdrive@khelo.in",
                "opening_time": time(9, 0),
                "closing_time": time(2, 0),
                "verification_status": VerificationStatus.VERIFIED,
                "is_active": True,
                "total_seats": 45,
                "amenities": ["wifi", "ac", "food", "streamer_booth", "parking"],
                "photos": ["https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=800&auto=format&fit=crop"],
                "tiers": [
                    {
                        "name": "RTX 4090 Extreme Pod",
                        "description": "i9-14900KS, RTX 4090, 360Hz OLED",
                        "specs": {"gpu": "RTX 4090", "cpu": "i9-14900KS", "ram": "64GB DDR5", "monitor": "360Hz OLED"},
                        "total_seats": 15,
                        "app_bookable_seats": 12,
                        "preset_category": "pro_gamer",
                        "price_per_hour": 320.0,
                        "is_active": True
                    }
                ]
            },
            # 7. Titan Gaming Arena - Delhi
            {
                "name": "Titan Gaming Arena",
                "description": "Delhi's largest PC gaming lounge situated near Connaught Place. 5v5 scrim rooms and PS5 lounges.",
                "address_line1": "Connaught Place, Outer Circle",
                "city": "Delhi",
                "state": "Delhi",
                "pincode": "110001",
                "latitude": 28.6315,
                "longitude": 77.2167,
                "phone_number": "+91 9811001122",
                "email": "titan@khelo.in",
                "opening_time": time(10, 0),
                "closing_time": time(23, 59),
                "verification_status": VerificationStatus.VERIFIED,
                "is_active": True,
                "total_seats": 60,
                "amenities": ["wifi", "ac", "food", "ps5", "stage", "parking"],
                "photos": ["https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=800&auto=format&fit=crop"],
                "tiers": [
                    {
                        "name": "Tournament 5v5 Stage Setup",
                        "description": "5v5 Soundproof Stage Pod with RTX 4080 Rigs",
                        "specs": {"gpu": "RTX 4080", "cpu": "Ryzen 7 7800X3D", "ram": "32GB", "monitor": "240Hz BenQ"},
                        "total_seats": 10,
                        "app_bookable_seats": 8,
                        "preset_category": "pro_gamer",
                        "price_per_hour": 250.0,
                        "is_active": True
                    }
                ]
            },
            # 8. CyberLair Gaming - Bengaluru
            {
                "name": "CyberLair Gaming",
                "description": "Cozy student gaming den in Koramangala offering budget-friendly tariffs and midnight LAN parties.",
                "address_line1": "5th Block, Koramangala",
                "city": "Bengaluru",
                "state": "Karnataka",
                "pincode": "560095",
                "latitude": 12.9352,
                "longitude": 77.6245,
                "phone_number": "+91 9880011223",
                "email": "cyberlair@khelo.in",
                "opening_time": time(0, 0),
                "closing_time": time(23, 59),
                "verification_status": VerificationStatus.VERIFIED,
                "is_active": True,
                "total_seats": 30,
                "amenities": ["wifi", "ac", "snacks", "coffee_bar"],
                "photos": ["https://images.unsplash.com/photo-1538481199705-c710c4e965fc?q=80&w=800&auto=format&fit=crop"],
                "tiers": [
                    {
                        "name": "RTX 3070 Student Special",
                        "description": "i5 12400F, RTX 3070, 165Hz IPS Display",
                        "specs": {"gpu": "RTX 3070", "cpu": "i5-12400F", "ram": "16GB", "monitor": "165Hz IPS"},
                        "total_seats": 30,
                        "app_bookable_seats": 25,
                        "preset_category": "budget_friendly",
                        "price_per_hour": 90.0,
                        "is_active": True
                    }
                ]
            },
            # 9. Nexus PC Cafe - Hyderabad
            {
                "name": "Nexus PC Cafe",
                "description": "High end esports arena in Gachibowli serving tech professionals and hardcore FPS players.",
                "address_line1": "IT Park Road, Gachibowli",
                "city": "Hyderabad",
                "state": "Telangana",
                "pincode": "500032",
                "latitude": 17.4401,
                "longitude": 78.3489,
                "phone_number": "+91 9700112233",
                "email": "nexus@khelo.in",
                "opening_time": time(9, 0),
                "closing_time": time(1, 0),
                "verification_status": VerificationStatus.VERIFIED,
                "is_active": True,
                "total_seats": 35,
                "amenities": ["wifi", "ac", "food", "parking"],
                "photos": ["https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=800&auto=format&fit=crop"],
                "tiers": [
                    {
                        "name": "RTX 4070 Ti Super Station",
                        "description": "Ryzen 7 7700X, RTX 4070 Ti, 280Hz Asus Tuf Display",
                        "specs": {"gpu": "RTX 4070 Ti Super", "cpu": "Ryzen 7 7700X", "ram": "32GB", "monitor": "280Hz IPS"},
                        "total_seats": 35,
                        "app_bookable_seats": 28,
                        "preset_category": "pro_gamer",
                        "price_per_hour": 190.0,
                        "is_active": True
                    }
                ]
            },
            # 10. Horizon Gaming Lounge - Chennai
            {
                "name": "Horizon Gaming Lounge",
                "description": "Chennai's leading gaming zone with PS5 4K TVs and RTX 4080 battle stations in Nungambakkam.",
                "address_line1": "Nungambakkam High Road",
                "city": "Chennai",
                "state": "Tamil Nadu",
                "pincode": "600034",
                "latitude": 13.0604,
                "longitude": 80.2496,
                "phone_number": "+91 9840112233",
                "email": "horizon@khelo.in",
                "opening_time": time(10, 0),
                "closing_time": time(23, 0),
                "verification_status": VerificationStatus.VERIFIED,
                "is_active": True,
                "total_seats": 40,
                "amenities": ["wifi", "ac", "ps5", "food", "snacks"],
                "photos": ["https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=800&auto=format&fit=crop"],
                "tiers": [
                    {
                        "name": "PS5 Pro Lounge Seat",
                        "description": "PlayStation 5, 55-inch 4K HDR TV",
                        "specs": {"gpu": "PS5 GPU", "cpu": "Custom AMD", "ram": "16GB", "monitor": "55in 4K TV"},
                        "total_seats": 15,
                        "app_bookable_seats": 12,
                        "preset_category": "console_zone",
                        "price_per_hour": 140.0,
                        "is_active": True
                    }
                ]
            },
            # 11. Vortex Gaming Hub - Kolkata
            {
                "name": "Vortex Gaming Hub",
                "description": "Salt Lake Sector 5's iconic gaming destination equipped with ultra-fast rigs and artisanal beverages.",
                "address_line1": "Sector V, Salt Lake City",
                "city": "Kolkata",
                "state": "West Bengal",
                "pincode": "700091",
                "latitude": 22.5726,
                "longitude": 88.4311,
                "phone_number": "+91 9830112233",
                "email": "vortex@khelo.in",
                "opening_time": time(10, 0),
                "closing_time": time(0, 0),
                "verification_status": VerificationStatus.VERIFIED,
                "is_active": True,
                "total_seats": 28,
                "amenities": ["wifi", "ac", "food", "coffee_bar"],
                "photos": ["https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=800&auto=format&fit=crop"],
                "tiers": [
                    {
                        "name": "RTX 3080 Ti Battle Rig",
                        "description": "i7 12700K, RTX 3080 Ti, 240Hz Curved",
                        "specs": {"gpu": "RTX 3080 Ti", "cpu": "i7-12700K", "ram": "32GB", "monitor": "240Hz Curved"},
                        "total_seats": 28,
                        "app_bookable_seats": 24,
                        "preset_category": "pro_gamer",
                        "price_per_hour": 160.0,
                        "is_active": True
                    }
                ]
            },
            # 12. CyberPulse Esports - Ahmedabad
            {
                "name": "CyberPulse Esports",
                "description": "SG Highway's premium gaming cafe with luxury gaming chairs, noise-canceling headsets, and mocktail bar.",
                "address_line1": "SG Highway, Bodakdev",
                "city": "Ahmedabad",
                "state": "Gujarat",
                "pincode": "380054",
                "latitude": 23.0396,
                "longitude": 72.5065,
                "phone_number": "+91 9898001122",
                "email": "cyberpulse@khelo.in",
                "opening_time": time(9, 0),
                "closing_time": time(23, 30),
                "verification_status": VerificationStatus.VERIFIED,
                "is_active": True,
                "total_seats": 32,
                "amenities": ["wifi", "ac", "food", "parking", "snacks"],
                "photos": ["https://images.unsplash.com/photo-1538481199705-c710c4e965fc?q=80&w=800&auto=format&fit=crop"],
                "tiers": [
                    {
                        "name": "RTX 4070 Esports Station",
                        "description": "i7 13700F, RTX 4070, 240Hz Display",
                        "specs": {"gpu": "RTX 4070", "cpu": "i7-13700F", "ram": "32GB", "monitor": "240Hz IPS"},
                        "total_seats": 32,
                        "app_bookable_seats": 26,
                        "preset_category": "pro_gamer",
                        "price_per_hour": 170.0,
                        "is_active": True
                    }
                ]
            },
            # 13. Alpha Domain Gaming - Pune
            {
                "name": "Alpha Domain Gaming",
                "description": "Kothrud's popular esports destination featuring tournament stages and dedicated Valorant/CS2 bootcamps.",
                "address_line1": "Karve Road, Kothrud",
                "city": "Pune",
                "state": "Maharashtra",
                "pincode": "411038",
                "latitude": 18.5074,
                "longitude": 73.8077,
                "phone_number": "+91 9823001122",
                "email": "alphadomain@khelo.in",
                "opening_time": time(9, 0),
                "closing_time": time(0, 0),
                "verification_status": VerificationStatus.VERIFIED,
                "is_active": True,
                "total_seats": 40,
                "amenities": ["wifi", "ac", "food", "stage"],
                "photos": ["https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=800&auto=format&fit=crop"],
                "tiers": [
                    {
                        "name": "Valorant Bootcamp Pod",
                        "description": "i7 13700K, RTX 4070 Super, Zowie 240Hz DyAc",
                        "specs": {"gpu": "RTX 4070 Super", "cpu": "i7-13700K", "ram": "32GB", "monitor": "240Hz DyAc"},
                        "total_seats": 25,
                        "app_bookable_seats": 20,
                        "preset_category": "pro_gamer",
                        "price_per_hour": 175.0,
                        "is_active": True
                    }
                ]
            },
            # 14. Matrix Reloaded Cafe - Bengaluru
            {
                "name": "Matrix Reloaded Cafe",
                "description": "Whitefield IT hub's top gaming destination with ergonomic Herman Miller chairs and high refresh rate monitors.",
                "address_line1": "ITPL Main Road, Whitefield",
                "city": "Bengaluru",
                "state": "Karnataka",
                "pincode": "560066",
                "latitude": 12.9855,
                "longitude": 77.7272,
                "phone_number": "+91 9740112233",
                "email": "matrixreloaded@khelo.in",
                "opening_time": time(9, 0),
                "closing_time": time(2, 0),
                "verification_status": VerificationStatus.VERIFIED,
                "is_active": True,
                "total_seats": 36,
                "amenities": ["wifi", "ac", "food", "parking", "coffee_bar"],
                "photos": ["https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=800&auto=format&fit=crop"],
                "tiers": [
                    {
                        "name": "RTX 4080 Master Rig",
                        "description": "Ryzen 9 7900X, RTX 4080, 240Hz 1440p",
                        "specs": {"gpu": "RTX 4080", "cpu": "Ryzen 9 7900X", "ram": "32GB", "monitor": "240Hz QHD"},
                        "total_seats": 36,
                        "app_bookable_seats": 30,
                        "preset_category": "pro_gamer",
                        "price_per_hour": 240.0,
                        "is_active": True
                    }
                ]
            },
            # 15. GameZone Central - Mumbai
            {
                "name": "GameZone Central",
                "description": "Andheri West venue featuring 24/7 access, PS5 consoles, racing simulators, and gaming snacks.",
                "address_line1": "Link Road, Andheri West",
                "city": "Mumbai",
                "state": "Maharashtra",
                "pincode": "400053",
                "latitude": 19.1363,
                "longitude": 72.8277,
                "phone_number": "+91 9820011223",
                "email": "gamezonecentral@khelo.in",
                "opening_time": time(0, 0),
                "closing_time": time(23, 59),
                "verification_status": VerificationStatus.VERIFIED,
                "is_active": True,
                "total_seats": 40,
                "amenities": ["wifi", "ac", "ps5", "food", "snacks"],
                "photos": ["https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=800&auto=format&fit=crop"],
                "tiers": [
                    {
                        "name": "Racing Sim Cockpit",
                        "description": "Logitech G Pro Wheel & Pedal Sim Setup with Curved Triple Monitors",
                        "specs": {"gpu": "RTX 4080", "cpu": "i7 13700K", "ram": "32GB", "monitor": "Triple 32in 144Hz"},
                        "total_seats": 5,
                        "app_bookable_seats": 4,
                        "preset_category": "vr_zone",
                        "price_per_hour": 350.0,
                        "is_active": True
                    }
                ]
            },
            # Add 15 more cafes for a total of 30+
            {
                "name": "Rogue Esports Arena",
                "description": "Jubilee Hills gaming sanctuary with premium lighting and competitive team scrim chambers.",
                "address_line1": "Jubilee Hills Road No. 36",
                "city": "Hyderabad",
                "state": "Telangana",
                "pincode": "500033",
                "latitude": 17.4319,
                "longitude": 78.4071,
                "phone_number": "+91 9701122334",
                "email": "rogue@khelo.in",
                "opening_time": time(9, 0),
                "closing_time": time(1, 0),
                "verification_status": VerificationStatus.VERIFIED,
                "is_active": True,
                "total_seats": 35,
                "amenities": ["wifi", "ac", "food", "parking", "streamer_booth"],
                "photos": ["https://images.unsplash.com/photo-1538481199705-c710c4e965fc?q=80&w=800&auto=format&fit=crop"],
                "tiers": [
                    {
                        "name": "RTX 4070 Ti Pro Rig",
                        "description": "i7 14700K, RTX 4070 Ti, 240Hz Gaming Monitor",
                        "specs": {"gpu": "RTX 4070 Ti", "cpu": "i7-14700K", "ram": "32GB", "monitor": "240Hz QHD"},
                        "total_seats": 35,
                        "app_bookable_seats": 30,
                        "preset_category": "pro_gamer",
                        "price_per_hour": 210.0,
                        "is_active": True
                    }
                ]
            },
            {
                "name": "ZeroPing Cyber Arena",
                "description": "Ultra low ping dedicated fiber connectivity gaming center in South Extension, Delhi.",
                "address_line1": "South Extension Part 2",
                "city": "Delhi",
                "state": "Delhi",
                "pincode": "110049",
                "latitude": 28.5678,
                "longitude": 77.2210,
                "phone_number": "+91 9810112233",
                "email": "zeroping@khelo.in",
                "opening_time": time(10, 0),
                "closing_time": time(0, 0),
                "verification_status": VerificationStatus.VERIFIED,
                "is_active": True,
                "total_seats": 42,
                "amenities": ["wifi", "ac", "food", "parking"],
                "photos": ["https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=800&auto=format&fit=crop"],
                "tiers": [
                    {
                        "name": "RTX 4080 ZeroPing Rig",
                        "description": "Ryzen 7 7800X3D, RTX 4080, 360Hz Display",
                        "specs": {"gpu": "RTX 4080", "cpu": "Ryzen 7 7800X3D", "ram": "32GB", "monitor": "360Hz BenQ"},
                        "total_seats": 42,
                        "app_bookable_seats": 35,
                        "preset_category": "pro_gamer",
                        "price_per_hour": 230.0,
                        "is_active": True
                    }
                ]
            },
            {
                "name": "Cyberia Gaming Studio",
                "description": "Jayanagar's favorite gaming studio featuring customized mechanical keyboards and high-end headsets.",
                "address_line1": "4th Block, Jayanagar",
                "city": "Bengaluru",
                "state": "Karnataka",
                "pincode": "560011",
                "latitude": 12.9250,
                "longitude": 77.5840,
                "phone_number": "+91 9880112233",
                "email": "cyberia@khelo.in",
                "opening_time": time(9, 0),
                "closing_time": time(23, 0),
                "verification_status": VerificationStatus.VERIFIED,
                "is_active": True,
                "total_seats": 25,
                "amenities": ["wifi", "ac", "snacks", "coffee_bar"],
                "photos": ["https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=800&auto=format&fit=crop"],
                "tiers": [
                    {
                        "name": "RTX 4060 Ti Custom Desk",
                        "description": "i5 13400F, RTX 4060 Ti, 180Hz IPS",
                        "specs": {"gpu": "RTX 4060 Ti", "cpu": "i5-13400F", "ram": "16GB", "monitor": "180Hz IPS"},
                        "total_seats": 25,
                        "app_bookable_seats": 20,
                        "preset_category": "budget_friendly",
                        "price_per_hour": 130.0,
                        "is_active": True
                    }
                ]
            },
            {
                "name": "Apex Legend Lounge",
                "description": "Aundh gaming venue with immersive soundproofing and premium ergonomic gaming chairs.",
                "address_line1": "ITI Road, Aundh",
                "city": "Pune",
                "state": "Maharashtra",
                "pincode": "411007",
                "latitude": 18.5580,
                "longitude": 73.8070,
                "phone_number": "+91 9890011223",
                "email": "apexlegend@khelo.in",
                "opening_time": time(10, 0),
                "closing_time": time(1, 0),
                "verification_status": VerificationStatus.VERIFIED,
                "is_active": True,
                "total_seats": 30,
                "amenities": ["wifi", "ac", "food", "snacks"],
                "photos": ["https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=800&auto=format&fit=crop"],
                "tiers": [
                    {
                        "name": "RTX 4070 Super Rig",
                        "description": "i7 13700K, RTX 4070 Super, 240Hz QHD",
                        "specs": {"gpu": "RTX 4070 Super", "cpu": "i7-13700K", "ram": "32GB", "monitor": "240Hz QHD"},
                        "total_seats": 30,
                        "app_bookable_seats": 25,
                        "preset_category": "pro_gamer",
                        "price_per_hour": 185.0,
                        "is_active": True
                    }
                ]
            },
            {
                "name": "CyberSpace Arena",
                "description": "Velachery's premier PC gaming arena with high capacity tournament setups and food delivery service.",
                "address_line1": "Velachery Main Road",
                "city": "Chennai",
                "state": "Tamil Nadu",
                "pincode": "600042",
                "latitude": 12.9815,
                "longitude": 80.2180,
                "phone_number": "+91 9840011223",
                "email": "cyberspace@khelo.in",
                "opening_time": time(9, 0),
                "closing_time": time(23, 30),
                "verification_status": VerificationStatus.VERIFIED,
                "is_active": True,
                "total_seats": 35,
                "amenities": ["wifi", "ac", "food", "parking"],
                "photos": ["https://images.unsplash.com/photo-1538481199705-c710c4e965fc?q=80&w=800&auto=format&fit=crop"],
                "tiers": [
                    {
                        "name": "RTX 3070 Ti Gaming Rig",
                        "description": "i7 12700F, RTX 3070 Ti, 165Hz IPS",
                        "specs": {"gpu": "RTX 3070 Ti", "cpu": "i7-12700F", "ram": "16GB", "monitor": "165Hz IPS"},
                        "total_seats": 35,
                        "app_bookable_seats": 28,
                        "preset_category": "pro_gamer",
                        "price_per_hour": 140.0,
                        "is_active": True
                    }
                ]
            },
            {
                "name": "Overdrive Esports Hub",
                "description": "Park Street Kolkata venue known for high-tier CS2 and Valorant regional tournaments.",
                "address_line1": "Park Street",
                "city": "Kolkata",
                "state": "West Bengal",
                "pincode": "700016",
                "latitude": 22.5550,
                "longitude": 88.3510,
                "phone_number": "+91 9830011223",
                "email": "overdrive@khelo.in",
                "opening_time": time(10, 0),
                "closing_time": time(1, 0),
                "verification_status": VerificationStatus.VERIFIED,
                "is_active": True,
                "total_seats": 38,
                "amenities": ["wifi", "ac", "food", "coffee_bar", "stage"],
                "photos": ["https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=800&auto=format&fit=crop"],
                "tiers": [
                    {
                        "name": "RTX 4070 Ti Super Arena Rig",
                        "description": "Ryzen 7 7800X3D, RTX 4070 Ti Super, 280Hz",
                        "specs": {"gpu": "RTX 4070 Ti Super", "cpu": "Ryzen 7 7800X3D", "ram": "32GB", "monitor": "280Hz IPS"},
                        "total_seats": 38,
                        "app_bookable_seats": 30,
                        "preset_category": "pro_gamer",
                        "price_per_hour": 195.0,
                        "is_active": True
                    }
                ]
            },
            {
                "name": "Quantum Cyber Hub",
                "description": "Vastrapur Ahmedabad venue with curved ultrawide monitors and racing wheel setups.",
                "address_line1": "Vastrapur Lake Road",
                "city": "Ahmedabad",
                "state": "Gujarat",
                "pincode": "380015",
                "latitude": 23.0350,
                "longitude": 72.5280,
                "phone_number": "+91 9898112233",
                "email": "quantum@khelo.in",
                "opening_time": time(9, 30),
                "closing_time": time(23, 0),
                "verification_status": VerificationStatus.VERIFIED,
                "is_active": True,
                "total_seats": 28,
                "amenities": ["wifi", "ac", "food", "parking"],
                "photos": ["https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=800&auto=format&fit=crop"],
                "tiers": [
                    {
                        "name": "RTX 4070 Curved Ultrawide",
                        "description": "i7 13700, RTX 4070, 34in Ultrawide 165Hz",
                        "specs": {"gpu": "RTX 4070", "cpu": "i7-13700", "ram": "32GB", "monitor": "34in Ultrawide 165Hz"},
                        "total_seats": 28,
                        "app_bookable_seats": 22,
                        "preset_category": "pro_gamer",
                        "price_per_hour": 180.0,
                        "is_active": True
                    }
                ]
            },
            {
                "name": "Glitch Gaming Lounge",
                "description": "Kochi Kakkanad InfoPark tech hub gaming club with PS5 4K stations and high performance PCs.",
                "address_line1": "InfoPark Express Highway, Kakkanad",
                "city": "Kochi",
                "state": "Kerala",
                "pincode": "682030",
                "latitude": 10.0068,
                "longitude": 76.3609,
                "phone_number": "+91 9846011223",
                "email": "glitch@khelo.in",
                "opening_time": time(9, 0),
                "closing_time": time(0, 0),
                "verification_status": VerificationStatus.VERIFIED,
                "is_active": True,
                "total_seats": 30,
                "amenities": ["wifi", "ac", "ps5", "food", "coffee_bar"],
                "photos": ["https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=800&auto=format&fit=crop"],
                "tiers": [
                    {
                        "name": "PS5 4K OLED Lounge",
                        "description": "PlayStation 5, 55-inch OLED 120Hz TV",
                        "specs": {"gpu": "PS5 Custom", "cpu": "Zen 2", "ram": "16GB", "monitor": "55in OLED 120Hz"},
                        "total_seats": 10,
                        "app_bookable_seats": 8,
                        "preset_category": "console_zone",
                        "price_per_hour": 150.0,
                        "is_active": True
                    },
                    {
                        "name": "RTX 4070 Super Rig",
                        "description": "i7 13700K, RTX 4070 Super, 240Hz",
                        "specs": {"gpu": "RTX 4070 Super", "cpu": "i7-13700K", "ram": "32GB", "monitor": "240Hz IPS"},
                        "total_seats": 20,
                        "app_bookable_seats": 16,
                        "preset_category": "pro_gamer",
                        "price_per_hour": 180.0,
                        "is_active": True
                    }
                ]
            },
            {
                "name": "Battlestation Prime",
                "description": "Noida Sector 62 venue featuring individual RGB gaming pods and streamer setups.",
                "address_line1": "Sector 62",
                "city": "Delhi",
                "state": "Uttar Pradesh",
                "pincode": "201309",
                "latitude": 28.6270,
                "longitude": 77.3725,
                "phone_number": "+91 9812011223",
                "email": "battlestation@khelo.in",
                "opening_time": time(9, 0),
                "closing_time": time(1, 0),
                "verification_status": VerificationStatus.VERIFIED,
                "is_active": True,
                "total_seats": 35,
                "amenities": ["wifi", "ac", "food", "streamer_booth", "parking"],
                "photos": ["https://images.unsplash.com/photo-1538481199705-c710c4e965fc?q=80&w=800&auto=format&fit=crop"],
                "tiers": [
                    {
                        "name": "RTX 4080 RGB Pod",
                        "description": "i9 13900K, RTX 4080, 240Hz OLED",
                        "specs": {"gpu": "RTX 4080", "cpu": "i9-13900K", "ram": "32GB", "monitor": "240Hz OLED"},
                        "total_seats": 35,
                        "app_bookable_seats": 28,
                        "preset_category": "pro_gamer",
                        "price_per_hour": 240.0,
                        "is_active": True
                    }
                ]
            },
            {
                "name": "Cyber Sanctuary",
                "description": "Thane West venue offering ultra comfortable recliner seating for casual and competitive gamers.",
                "address_line1": "Ghodbunder Road, Thane West",
                "city": "Mumbai",
                "state": "Maharashtra",
                "pincode": "400607",
                "latitude": 19.2640,
                "longitude": 72.9670,
                "phone_number": "+91 9821011223",
                "email": "cybersanctuary@khelo.in",
                "opening_time": time(10, 0),
                "closing_time": time(23, 30),
                "verification_status": VerificationStatus.VERIFIED,
                "is_active": True,
                "total_seats": 32,
                "amenities": ["wifi", "ac", "food", "parking"],
                "photos": ["https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=800&auto=format&fit=crop"],
                "tiers": [
                    {
                        "name": "RTX 3080 Recliner Pod",
                        "description": "i7 12700K, RTX 3080, Auto Recliner Desk",
                        "specs": {"gpu": "RTX 3080", "cpu": "i7-12700K", "ram": "32GB", "monitor": "180Hz QHD"},
                        "total_seats": 32,
                        "app_bookable_seats": 25,
                        "preset_category": "pro_gamer",
                        "price_per_hour": 160.0,
                        "is_active": True
                    }
                ]
            },
            {
                "name": "Arcade X Esports",
                "description": "HSR Layout Bengaluru cafe with arcade fighting game cabinets, PS5s, and RTX 4070 rigs.",
                "address_line1": "27th Main Road, HSR Layout",
                "city": "Bengaluru",
                "state": "Karnataka",
                "pincode": "560102",
                "latitude": 12.9116,
                "longitude": 77.6389,
                "phone_number": "+91 9886011223",
                "email": "arcadex@khelo.in",
                "opening_time": time(9, 0),
                "closing_time": time(2, 0),
                "verification_status": VerificationStatus.VERIFIED,
                "is_active": True,
                "total_seats": 40,
                "amenities": ["wifi", "ac", "ps5", "food", "snacks", "coffee_bar"],
                "photos": ["https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=800&auto=format&fit=crop"],
                "tiers": [
                    {
                        "name": "RTX 4070 Super Rig",
                        "description": "Ryzen 7 7700X, RTX 4070 Super, 240Hz",
                        "specs": {"gpu": "RTX 4070 Super", "cpu": "Ryzen 7 7700X", "ram": "32GB", "monitor": "240Hz IPS"},
                        "total_seats": 40,
                        "app_bookable_seats": 32,
                        "preset_category": "pro_gamer",
                        "price_per_hour": 190.0,
                        "is_active": True
                    }
                ]
            },
            {
                "name": "LevelUp Gaming Club",
                "description": "Madhapur Hyderabad cafe with high refresh rate displays and specialized FPS mice options.",
                "address_line1": "Madhapur Main Road",
                "city": "Hyderabad",
                "state": "Telangana",
                "pincode": "500081",
                "latitude": 17.4483,
                "longitude": 78.3915,
                "phone_number": "+91 9702011223",
                "email": "levelup@khelo.in",
                "opening_time": time(9, 0),
                "closing_time": time(0, 0),
                "verification_status": VerificationStatus.VERIFIED,
                "is_active": True,
                "total_seats": 30,
                "amenities": ["wifi", "ac", "food", "parking"],
                "photos": ["https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=800&auto=format&fit=crop"],
                "tiers": [
                    {
                        "name": "RTX 4060 Ti FPS Rig",
                        "description": "i5 13400F, RTX 4060 Ti, 240Hz Zowie",
                        "specs": {"gpu": "RTX 4060 Ti", "cpu": "i5-13400F", "ram": "16GB", "monitor": "240Hz Zowie"},
                        "total_seats": 30,
                        "app_bookable_seats": 24,
                        "preset_category": "budget_friendly",
                        "price_per_hour": 140.0,
                        "is_active": True
                    }
                ]
            },
            {
                "name": "Overload Gaming Lounge",
                "description": "Vimannagar Pune gaming lounge with broad game library and multiplayer console zones.",
                "address_line1": "Symbiosis Road, Viman Nagar",
                "city": "Pune",
                "state": "Maharashtra",
                "pincode": "411014",
                "latitude": 18.5650,
                "longitude": 73.9120,
                "phone_number": "+91 9891011223",
                "email": "overload@khelo.in",
                "opening_time": time(10, 0),
                "closing_time": time(23, 0),
                "verification_status": VerificationStatus.VERIFIED,
                "is_active": True,
                "total_seats": 28,
                "amenities": ["wifi", "ac", "ps5", "snacks"],
                "photos": ["https://images.unsplash.com/photo-1538481199705-c710c4e965fc?q=80&w=800&auto=format&fit=crop"],
                "tiers": [
                    {
                        "name": "Console Multiplayer Sofa",
                        "description": "PS5 + Xbox Series X Dual Setup with 65in TV",
                        "specs": {"gpu": "PS5/Xbox Series X", "cpu": "Custom AMD", "ram": "16GB", "monitor": "65in 4K HDR"},
                        "total_seats": 12,
                        "app_bookable_seats": 10,
                        "preset_category": "console_zone",
                        "price_per_hour": 160.0,
                        "is_active": True
                    }
                ]
            },
            {
                "name": "CyberStorm Esports",
                "description": "Lajpat Nagar Delhi venue with 240Hz gaming monitors and professional sound headsets.",
                "address_line1": "Lajpat Nagar Central Market",
                "city": "Delhi",
                "state": "Delhi",
                "pincode": "110024",
                "latitude": 28.5700,
                "longitude": 77.2400,
                "phone_number": "+91 9813011223",
                "email": "cyberstorm@khelo.in",
                "opening_time": time(9, 30),
                "closing_time": time(23, 30),
                "verification_status": VerificationStatus.VERIFIED,
                "is_active": True,
                "total_seats": 35,
                "amenities": ["wifi", "ac", "food", "parking"],
                "photos": ["https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=800&auto=format&fit=crop"],
                "tiers": [
                    {
                        "name": "RTX 4070 Gaming Rig",
                        "description": "i7 13700F, RTX 4070, 240Hz",
                        "specs": {"gpu": "RTX 4070", "cpu": "i7-13700F", "ram": "32GB", "monitor": "240Hz IPS"},
                        "total_seats": 35,
                        "app_bookable_seats": 28,
                        "preset_category": "pro_gamer",
                        "price_per_hour": 175.0,
                        "is_active": True
                    }
                ]
            },
            {
                "name": "Omega Realm Gaming",
                "description": "Malleswaram Bengaluru cafe with mechanical keyboards, ultra-fast fibre network, and custom PCs.",
                "address_line1": "Margosa Road, Malleswaram",
                "city": "Bengaluru",
                "state": "Karnataka",
                "pincode": "560003",
                "latitude": 12.9980,
                "longitude": 77.5700,
                "phone_number": "+91 9887011223",
                "email": "omegarealm@khelo.in",
                "opening_time": time(9, 0),
                "closing_time": time(23, 0),
                "verification_status": VerificationStatus.VERIFIED,
                "is_active": True,
                "total_seats": 30,
                "amenities": ["wifi", "ac", "food", "coffee_bar"],
                "photos": ["https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=800&auto=format&fit=crop"],
                "tiers": [
                    {
                        "name": "RTX 3070 Ti Station",
                        "description": "i7 12700K, RTX 3070 Ti, 165Hz IPS",
                        "specs": {"gpu": "RTX 3070 Ti", "cpu": "i7-12700K", "ram": "16GB", "monitor": "165Hz IPS"},
                        "total_seats": 30,
                        "app_bookable_seats": 24,
                        "preset_category": "budget_friendly",
                        "price_per_hour": 135.0,
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
