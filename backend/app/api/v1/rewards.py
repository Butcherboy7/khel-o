from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.booking import Booking, BookingStatus
from app.models.user import User
from app.api.deps import get_current_active_user

router = APIRouter(prefix="/rewards", tags=["Rewards"])

IST = timezone(timedelta(hours=5, minutes=30))


@router.get("", status_code=200)
async def get_rewards(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Compute XP, level, and achievement progress from the gamer's real completed bookings."""
    stmt = select(Booking).where(
        Booking.gamer_id == current_user.id,
        Booking.status == BookingStatus.COMPLETED
    )
    result = await db.execute(stmt)
    completed = list(result.scalars().all())

    completed_count = len(completed)
    night_owl_count = sum(1 for b in completed if b.start_time.hour >= 22 or b.start_time.hour < 5)
    early_bird_count = sum(1 for b in completed if b.start_time.hour < 9)
    marathon_count = sum(1 for b in completed if float(b.duration_hours) >= 4)
    squad_count = sum(1 for b in completed if b.seats_count >= 3)
    distinct_cafes = len({b.cafe_id for b in completed})

    now_ist = datetime.now(IST)
    month_start = now_ist.replace(day=1, hour=0, minute=0, second=0, microsecond=0).date()
    weekend_count_this_month = sum(
        1 for b in completed
        if b.session_date >= month_start and b.session_date.weekday() >= 5
    )

    xp = (
        completed_count * 100
        + (250 if night_owl_count >= 1 else 0)
        + (500 if weekend_count_this_month >= 3 else 0)
        + (150 if early_bird_count >= 1 else 0)
        + (300 if marathon_count >= 1 else 0)
        + (200 if squad_count >= 1 else 0)
        + (400 if distinct_cafes >= 3 else 0)
    )

    achievements = [
        {
            "id": "first_blood",
            "title": "First Blood",
            "description": "Complete your first gaming session booking.",
            "icon": "🎯",
            "isUnlocked": completed_count >= 1,
            "progress": f"{min(completed_count, 1)} / 1",
            "xpReward": 100,
        },
        {
            "id": "night_owl",
            "title": "Night Owl",
            "description": "Complete a session that started after 10 PM or before 5 AM.",
            "icon": "🌙",
            "isUnlocked": night_owl_count >= 1,
            "progress": f"{min(night_owl_count, 1)} / 1",
            "xpReward": 250,
        },
        {
            "id": "weekend_warrior",
            "title": "Weekend Warrior",
            "description": "Complete 3 weekend sessions in a single calendar month.",
            "icon": "🎮",
            "isUnlocked": weekend_count_this_month >= 3,
            "progress": f"{min(weekend_count_this_month, 3)} / 3",
            "xpReward": 500,
        },
        {
            "id": "regular_patron",
            "title": "Regular Patron",
            "description": "Complete 10 total station bookings.",
            "icon": "🏆",
            "isUnlocked": completed_count >= 10,
            "progress": f"{min(completed_count, 10)} / 10",
            "xpReward": 1000,
        },
        {
            "id": "early_bird",
            "title": "Early Bird",
            "description": "Complete a session that started before 9 AM.",
            "icon": "🌅",
            "isUnlocked": early_bird_count >= 1,
            "progress": f"{min(early_bird_count, 1)} / 1",
            "xpReward": 150,
        },
        {
            "id": "marathon_gamer",
            "title": "Marathon Gamer",
            "description": "Complete a single session of 4 hours or more.",
            "icon": "🔥",
            "isUnlocked": marathon_count >= 1,
            "progress": f"{min(marathon_count, 1)} / 1",
            "xpReward": 300,
        },
        {
            "id": "squad_up",
            "title": "Squad Up",
            "description": "Complete a booking for 3 or more seats together.",
            "icon": "👥",
            "isUnlocked": squad_count >= 1,
            "progress": f"{min(squad_count, 1)} / 1",
            "xpReward": 200,
        },
        {
            "id": "cafe_explorer",
            "title": "Café Explorer",
            "description": "Complete bookings at 3 different cafés.",
            "icon": "🗺️",
            "isUnlocked": distinct_cafes >= 3,
            "progress": f"{min(distinct_cafes, 3)} / 3",
            "xpReward": 400,
        },
    ]

    level = xp // 500 + 1
    next_level_xp = level * 500

    return {
        "success": True,
        "data": {
            "xp": xp,
            "level": level,
            "nextLevelXp": next_level_xp,
            "completedBookings": completed_count,
            "achievements": achievements,
        }
    }
