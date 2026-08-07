"""
Seed realistic cafes with comprehensive test scenarios.
Each cafe has specific operating hours and description explaining what can be tested.
"""
import asyncio
from datetime import time
from uuid import uuid4
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.models.user import User, UserRole
from app.models.user_role import UserRoleMapping
from app.models.cafe import Cafe, VerificationStatus
from app.models.hardware_tier import HardwareTier
from app.core.security import get_password_hash

async def seed_test_cafes():
    async with AsyncSessionLocal() as session:
        # Create test owner
        owner = User(
            id=uuid4(),
            email="testowner@khelo.com",
            full_name="Test Owner",
            password_hash=get_password_hash("testpass123"),
            role=UserRole.CAFE_OWNER,
            is_active=True
        )
        session.add(owner)
        await session.flush()
        
        session.add(UserRoleMapping(id=uuid4(), user_id=owner.id, role=UserRole.CAFE_OWNER))
        
        cafes_data = [
            {
                "name": "Overnight Gaming Hub",
                "address": "45 Night Street, HSR Layout",
                "description": "🏢 TESTING: Overnight hours (10AM-2AM)\n\nTry booking late-night slots (after 11PM) to test overnight slot generation. Verify slots appear through 1:30AM. Test cancellation window for post-midnight bookings.",
                "opening_time": time(10, 0),
                "closing_time": time(2, 0),
                "bookable_stations": 20,
                "total_seats": 20,
            },
            {
                "name": "Standard Day Café",
                "address": "12 Main Road, Koramangala",
                "description": "🏢 TESTING: Normal hours (9AM-9PM)\n\nStandard business hours. Test regular slot generation, morning bookings, evening bookings. Verify no overnight slots appear. Test 2-hour cancellation window.",
                "opening_time": time(9, 0),
                "closing_time": time(21, 0),
                "bookable_stations": 15,
                "total_seats": 15,
            },
            {
                "name": "Early Bird Gaming",
                "address": "78 Sunrise Avenue, Whitefield",
                "description": "🏢 TESTING: Early morning hours (6AM-12PM)\n\nTest early morning slot availability. Book 6AM-8AM slots. Verify early-morning cancellation rules. Test past-midnight booking creation flow.",
                "opening_time": time(6, 0),
                "closing_time": time(12, 0),
                "bookable_stations": 10,
                "total_seats": 10,
            },
            {
                "name": "Late Night Legends",
                "address": "999 Party Zone, Indiranagar",
                "description": "🏢 TESTING: Late night only (8PM-4AM)\n\n8-hour overnight operation. Test prime-time evening slots and post-midnight availability. Verify 2AM-3AM slots. Test payment flow for late-night bookings.",
                "opening_time": time(20, 0),
                "closing_time": time(4, 0),
                "bookable_stations": 25,
                "total_seats": 25,
            },
            {
                "name": "24/7 Gaming Paradise",
                "address": "100 Marathon Road, Electronic City",
                "description": "🏢 TESTING: 24-hour operation (12AM-12AM)\n\nFull day coverage. Test boundary cases: midnight slots, noon slots, end-of-day slots. Verify continuous slot generation across day boundaries.",
                "opening_time": time(0, 0),
                "closing_time": time(23, 59),
                "bookable_stations": 30,
                "total_seats": 30,
            },
            {
                "name": "Weekend Warriors Hub",
                "address": "55 Fun Street, JP Nagar",
                "description": "🏢 TESTING: Extended weekend hours (10AM-1AM)\n\nPopular weekend spot. Test high-demand booking scenarios. Book multiple consecutive slots. Test concurrent booking limits and capacity enforcement.",
                "opening_time": time(10, 0),
                "closing_time": time(1, 0),
                "bookable_stations": 40,
                "total_seats": 40,
            },
            {
                "name": "Express Gaming Zone",
                "address": "22 Quick Lane, MG Road",
                "description": "🏢 TESTING: Short hours (10AM-6PM)\n\nLimited operating window. Test maximum duration bookings (can you book 8h in 8h window?). Test boundary slot timing at opening and closing.",
                "opening_time": time(10, 0),
                "closing_time": time(18, 0),
                "bookable_stations": 12,
                "total_seats": 12,
            },
            {
                "name": "Premium RTX Arena",
                "address": "1 Tech Park, Marathahalli",
                "description": "🏢 TESTING: Multiple hardware tiers\n\nTest hardware tier selection. Book RTX 4090 tier vs RTX 3060 tier. Verify pricing differences. Test tier-specific availability. Test upgrading tiers.",
                "opening_time": time(10, 0),
                "closing_time": time(23, 0),
                "bookable_stations": 35,
                "total_seats": 35,
            },
            {
                "name": "Capacity Test Café",
                "address": "5 Test Boulevard, Bellandur",
                "description": "🏢 TESTING: Limited capacity (5 stations)\n\nSmall capacity to test booking limits. Try overbooking. Test bookable_stations enforcement. Verify 'SLOT_FULLY_BOOKED' error when capacity reached.",
                "opening_time": time(10, 0),
                "closing_time": time(22, 0),
                "bookable_stations": 5,
                "total_seats": 5,
            },
            {
                "name": "Paused Bookings Café",
                "address": "88 Pause Avenue, BTM Layout",
                "description": "🏢 TESTING: Bookings paused feature\n\nHas bookable stations but bookings_paused=True. Test that booking attempts return 'BOOKINGS_PAUSED' error. Verify owner can unpause bookings.",
                "opening_time": time(10, 0),
                "closing_time": time(22, 0),
                "bookable_stations": 15,
                "total_seats": 15,
                "bookings_paused": True,
            },
        ]
        
        for cafe_data in cafes_data:
            cafe = Cafe(
                id=uuid4(),
                owner_id=owner.id,
                name=cafe_data["name"],
                address_line1=cafe_data["address"],
                city="Bengaluru",
                state="Karnataka",
                pincode="560001",
                phone_number="+919999999999",
                verification_status=VerificationStatus.VERIFIED,
                is_active=True,
                opening_time=cafe_data["opening_time"],
                closing_time=cafe_data["closing_time"],
                bookable_stations=cafe_data["bookable_stations"],
                total_seats=cafe_data["total_seats"],
                app_bookable_seats=cafe_data["bookable_stations"],
                description=cafe_data["description"],
                bookings_paused=cafe_data.get("bookings_paused", False),
            )
            session.add(cafe)
            await session.flush()
            
            # Create hardware tiers
            if "premium" in cafe_data["name"].lower():
                # Premium cafe has multiple tiers
                tiers = [
                    {
                        "name": "RTX 3060 Standard",
                        "specs": {"gpu": "RTX 3060", "ram": "16GB"},
                        "price_per_hour": 80,
                        "seats": 15,
                    },
                    {
                        "name": "RTX 4070 Premium",
                        "specs": {"gpu": "RTX 4070", "ram": "32GB"},
                        "price_per_hour": 150,
                        "seats": 10,
                    },
                    {
                        "name": "RTX 4090 Elite",
                        "specs": {"gpu": "RTX 4090", "ram": "64GB"},
                        "price_per_hour": 250,
                        "seats": 10,
                    },
                ]
            else:
                # Standard tier
                tiers = [
                    {
                        "name": "Standard RTX 3060 Pods",
                        "specs": {"gpu": "RTX 3060", "ram": "16GB"},
                        "price_per_hour": 100,
                        "seats": cafe_data["total_seats"],
                    },
                ]
            
            for tier_data in tiers:
                tier = HardwareTier(
                    id=uuid4(),
                    cafe_id=cafe.id,
                    name=tier_data["name"],
                    specs=tier_data["specs"],
                    price_per_hour=tier_data["price_per_hour"],
                    total_seats=tier_data["seats"],
                    app_bookable_seats=tier_data["seats"],
                    active_seats_count=tier_data["seats"],
                    is_active=True,
                )
                session.add(tier)
        
        await session.commit()
        print("✅ Seeded 10 realistic test cafes with operating hours")
        print("\nEach cafe has a description explaining what to test:")
        print("- Overnight hours (10AM-2AM)")
        print("- Normal business hours (9AM-9PM)")
        print("- Early morning slots (6AM-12PM)")
        print("- Late night hours (8PM-4AM)")
        print("- 24-hour operation")
        print("- Extended weekend hours")
        print("- Short operating windows")
        print("- Multiple hardware tiers")
        print("- Limited capacity testing")
        print("- Paused bookings state")

if __name__ == "__main__":
    asyncio.run(seed_test_cafes())
