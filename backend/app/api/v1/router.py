from fastapi import APIRouter

from app.api.v1.auth import router as auth_router
from app.api.v1.cafes import router as cafes_router
from app.api.v1.hardware_tiers import router as hardware_tiers_router
from app.api.v1.bookings import router as bookings_router
from app.api.v1.payments import router as payments_router
from app.api.v1.promotions import router as promotions_router
from app.api.v1.owner import router as owner_router
from app.api.v1.owner_payouts import router as owner_payouts_router
from app.api.v1.reviews import router as reviews_router
from app.api.v1.admin import router as admin_router

api_router = APIRouter()

api_router.include_router(auth_router, prefix="/auth", tags=["Auth"])
api_router.include_router(cafes_router, prefix="/cafes", tags=["Cafés"])
api_router.include_router(hardware_tiers_router, prefix="/hardware-tiers", tags=["Hardware Tiers"])
api_router.include_router(bookings_router, prefix="/bookings", tags=["Bookings"])
api_router.include_router(payments_router, prefix="/payments", tags=["Payments"])
api_router.include_router(promotions_router, prefix="/promotions", tags=["Promotions"])
api_router.include_router(owner_router, prefix="/owner", tags=["Owner Dashboard"])
api_router.include_router(owner_payouts_router, prefix="/owner/payouts", tags=["Owner Payouts"])
api_router.include_router(reviews_router, prefix="/reviews", tags=["Reviews"])
api_router.include_router(admin_router, prefix="/admin", tags=["Admin"])

@api_router.get("/status", tags=["Status"])
async def get_v1_status():
    return {"message": "KHEL-O API v1 Operational"}

# Alias for consistent module importing
router = api_router
