import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import settings
from app.core.logging import setup_logging, logger
from app.core.exceptions import BaseAppException
from app.api.v1.router import api_router

async def init_db():
    try:
        from app.database import engine, Base
        import app.models
        
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("database_tables_initialized")
    except Exception as e:
        logger.error("database_init_failed", error=str(e))

async def ensure_demo_users():
    try:
        from app.database import AsyncSessionLocal
        from app.repositories.user_repository import UserRepository
        from app.models.user import UserRole
        from app.core.security import get_password_hash
        
        async with AsyncSessionLocal() as session:
            repo = UserRepository(session)
            hashed_password = get_password_hash("testpass123")
            
            demo_accounts = [
                ("test@example.com", "Demo Gamer", UserRole.GAMER),
                ("owner@example.com", "Demo Cafe Owner", UserRole.CAFE_OWNER),
                ("owner@khelo.in", "Demo Cafe Owner", UserRole.CAFE_OWNER),
                ("owner@khel-o.test", "Demo Cafe Owner", UserRole.CAFE_OWNER),
                ("admin@example.com", "Platform Admin", UserRole.ADMIN),
                ("admin@khelo.in", "Platform Admin", UserRole.ADMIN),
                ("admin@khel-o.test", "Platform Admin", UserRole.ADMIN),
            ]
            
            for email, name, role in demo_accounts:
                existing = await repo.get_by_email(email)
                if not existing:
                    await repo.create({
                        "email": email,
                        "password_hash": hashed_password,
                        "full_name": name,
                        "role": role,
                        "is_active": True,
                    })
                elif existing.role != role:
                    await repo.update(existing.id, {"role": role, "is_active": True})

            # Also ensure a staff account exists for scanning QR codes
            staff_user = await repo.get_by_email("staff@example.com")
            if not staff_user:
                await repo.create({
                    "email": "staff@example.com",
                    "password_hash": hashed_password,
                    "full_name": "Demo Staff Member",
                    "role": UserRole.STAFF,
                    "is_active": True,
                })
        logger.info("demo_users_seeded_successfully")
    except Exception as e:
        logger.warning("ensure_demo_users_warning", error=str(e))

async def seed_demo_cafes():
    try:
        from app.database import AsyncSessionLocal
        from app.repositories.user_repository import UserRepository
        from app.repositories.cafe_repository import CafeRepository
        from app.models.cafe import Cafe, VerificationStatus
        from app.models.hardware_tier import HardwareTier
        from datetime import time
        from sqlalchemy import select

        async with AsyncSessionLocal() as session:
            user_repo = UserRepository(session)
            cafe_repo = CafeRepository(session)
            owner = await user_repo.get_by_email("owner@example.com")
            if not owner:
                return

            existing_cafes = await cafe_repo.get_by_owner_id(owner.id)
            if existing_cafes:
                return

            cafes_data = [
                {
                    "name": "LXG Esports Arena",
                    "description": "Premium esports facility with 240Hz monitors, RTX 4080 rigs, and ergonomic gaming chairs.",
                    "address_line1": "100 Feet Road, Indiranagar",
                    "city": "Bengaluru",
                    "state": "Karnataka",
                    "pincode": "560038",
                    "phone_number": "+91 9876543210",
                    "email": "lxg@khelo.in",
                    "opening_time": time(9, 0),
                    "closing_time": time(23, 0),
                    "verification_status": VerificationStatus.VERIFIED,
                    "is_active": True,
                    "total_seats": 40,
                    "amenities": ["wifi", "ac", "food", "headsets", "streaming"],
                    "photos": [
                        "https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=800&auto=format&fit=crop",
                        "https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=800&auto=format&fit=crop"
                    ],
                    "tiers": [
                        {
                            "name": "Flagship RTX 4080 Tier",
                            "description": "Intel i9-14900K, RTX 4080 Super, 240Hz 2K Display, Logitech G Pro Peripherals",
                            "specs": {"gpu": "RTX 4080 Super", "cpu": "Intel i9-14900K", "ram": "32GB DDR5", "monitor": "27'' 240Hz 2K"},
                            "total_seats": 20,
                            "app_bookable_seats": 15,
                            "preset_category": "ultra_streamer",
                            "price_per_hour": 150.0,
                            "is_active": True
                        },
                        {
                            "name": "Pro Gaming Tier",
                            "description": "Ryzen 7 7800X3D, RTX 4070, 180Hz 1080p Display",
                            "specs": {"gpu": "RTX 4070", "cpu": "Ryzen 7 7800X3D", "ram": "16GB DDR5", "monitor": "24'' 180Hz"},
                            "total_seats": 20,
                            "app_bookable_seats": 15,
                            "preset_category": "pro_gaming",
                            "price_per_hour": 100.0,
                            "is_active": True
                        }
                    ]
                },
                {
                    "name": "Respawn Gaming Lounge",
                    "description": "Cozy community gaming lounge featuring private streaming booths and console zones.",
                    "address_line1": "FC Road, Shivajinagar",
                    "city": "Pune",
                    "state": "Maharashtra",
                    "pincode": "411005",
                    "phone_number": "+91 9123456789",
                    "email": "respawn@khelo.in",
                    "opening_time": time(10, 0),
                    "closing_time": time(22, 0),
                    "verification_status": VerificationStatus.VERIFIED,
                    "is_active": True,
                    "total_seats": 25,
                    "amenities": ["wifi", "ac", "parking", "private_rooms"],
                    "photos": [
                        "https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=800&auto=format&fit=crop"
                    ],
                    "tiers": [
                        {
                            "name": "Esports Starter Tier",
                            "description": "Core i5, RTX 3060, 144Hz Monitor",
                            "specs": {"gpu": "RTX 3060", "cpu": "Intel i5-12400F", "ram": "16GB DDR4", "monitor": "24'' 144Hz"},
                            "total_seats": 25,
                            "app_bookable_seats": 20,
                            "preset_category": "esports_starter",
                            "price_per_hour": 70.0,
                            "is_active": True
                        }
                    ]
                }
            ]

            for cdata in cafes_data:
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

        logger.info("demo_cafes_seeded_successfully")
    except Exception as e:
        logger.warning("seed_demo_cafes_warning", error=str(e))

@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    os.makedirs("static/qr", exist_ok=True)
    logger.info("starting_khel_o_backend", environment=settings.ENVIRONMENT)
    await init_db()
    await ensure_demo_users()
    await seed_demo_cafes()
    yield
    logger.info("stopping_khel_o_backend")

app = FastAPI(
    title="KHEL-O Backend API",
    description="Marketplace and Demand-Generation Platform for Gaming Cafés in India",
    version="1.0.0",
    lifespan=lifespan
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL, "http://localhost:3000", "http://localhost:3002"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files directory
os.makedirs("static/qr", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

# Register API Router
app.include_router(api_router, prefix="/api/v1")

# Custom Exception Handlers
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = []
    for error in exc.errors():
        field = " -> ".join(str(loc) for loc in error["loc"] if loc != "body")
        errors.append({
            "field": field,
            "message": error["msg"]
        })
    return JSONResponse(
        status_code=422,
        content={
            "success": False,
            "data": None,
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "Request validation failed",
                "details": errors
            },
            "meta": {
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
        }
    )

@app.exception_handler(BaseAppException)
async def custom_app_exception_handler(request: Request, exc: BaseAppException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "data": None,
            "error": {
                "code": exc.error_code,
                "message": exc.message,
                "details": exc.details
            },
            "meta": {
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
        }
    )

@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    if exc.status_code == status.HTTP_401_UNAUTHORIZED:
        return JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content={
                "success": False,
                "data": None,
                "error": {
                    "code": "UNAUTHORIZED",
                    "message": "Authentication required",
                    "details": []
                },
                "meta": {
                    "timestamp": datetime.now(timezone.utc).isoformat()
                }
            }
        )
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "data": None,
            "error": {
                "code": "HTTP_ERROR",
                "message": exc.detail if isinstance(exc.detail, str) else str(exc.detail),
                "details": []
            },
            "meta": {
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
        }
    )

@app.get("/health", tags=["Health"])
async def health_check():
    return {
        "status": "ok",
        "service": "khel-o-backend",
        "environment": settings.ENVIRONMENT,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
