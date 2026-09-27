from fastapi import APIRouter, Depends, status, Query
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from fastapi.responses import Response
from app.schemas.review import ReviewCreateRequest, ReviewResponse, ReviewReplyRequest, ReviewUpdateRequest
from app.repositories.review_repository import ReviewRepository
from app.repositories.booking_repository import BookingRepository
from app.repositories.cafe_repository import CafeRepository
from app.repositories.platform_settings_repository import PlatformSettingsRepository
from app.services.review_service import ReviewService
from app.api.deps import require_gamer, require_cafe_owner, get_current_user
from app.models.user import User

router = APIRouter()

@router.get("/settings", status_code=status.HTTP_200_OK)
async def get_review_settings(db: AsyncSession = Depends(get_db)):
    """Public, unauthenticated read of whether a review currently requires an
    eligible booking — lets the customer-facing "Write a review" card decide
    whether to gate submission client-side. Temporary admin toggle, see
    PlatformSetting.reviews_require_booking."""
    settings = await PlatformSettingsRepository(db).get_or_create()
    return {"success": True, "data": {"requireBooking": settings.reviews_require_booking}}

@router.post("", status_code=status.HTTP_201_CREATED)
async def create_review(
    payload: ReviewCreateRequest,
    current_user: User = Depends(require_gamer),
    db: AsyncSession = Depends(get_db)
):
    review_repo = ReviewRepository(db)
    booking_repo = BookingRepository(db)
    service = ReviewService(review_repo, booking_repo)
    settings = await PlatformSettingsRepository(db).get_or_create()
    result = await service.submit_review(
        current_user.id, current_user.full_name, payload, require_booking=settings.reviews_require_booking
    )
    return {
        "success": True,
        "data": {
            "review": result
        }
    }

@router.get("/cafe/{cafe_id}", status_code=status.HTTP_200_OK)
async def get_cafe_reviews(
    cafe_id: UUID,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db)
):
    review_repo = ReviewRepository(db)
    booking_repo = BookingRepository(db)
    service = ReviewService(review_repo, booking_repo)
    result = await service.get_cafe_reviews(cafe_id, page=page, limit=limit)
    return {
        "success": True,
        "data": result
    }

@router.get("/cafe/{cafe_id}/qr.png")
async def review_qr_code(cafe_id: UUID, db: AsyncSession = Depends(get_db)):
    """QR code for a café's counter or table: scanning it opens the café's
    KHEL-O page at the review form. Only encodes a public page, so no auth."""
    import io

    import qrcode

    from app.config import settings as app_settings
    from app.core.exceptions import NotFoundException

    cafe = await CafeRepository(db).get_by_id(cafe_id)
    if not cafe:
        raise NotFoundException(message="Café not found", error_code="CAFE_NOT_FOUND")
    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=16, border=3)
    qr.add_data(review_link(app_settings.FRONTEND_URL, cafe.slug or str(cafe.id)))
    qr.make(fit=True)
    buf = io.BytesIO()
    qr.make_image(fill_color="black", back_color="white").save(buf, format="PNG")
    return Response(
        content=buf.getvalue(),
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=86400", "Content-Disposition": f'inline; filename="review-qr-{cafe.slug or cafe.id}.png"'},
    )


def review_link(frontend_url: str, slug: str) -> str:
    return (
        f"{frontend_url.rstrip('/')}/cafe/{slug}"
        f"?utm_source=qr&utm_medium=review&utm_campaign=review-{slug}#write-review"
    )


@router.patch("/{review_id}", status_code=status.HTTP_200_OK)
async def edit_review(
    review_id: UUID,
    payload: ReviewUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """The reviewer edits their own review; it then shows an "Edited" tag."""
    service = ReviewService(ReviewRepository(db), BookingRepository(db))
    result = await service.edit_review(review_id, current_user.id, payload.rating, payload.comment)
    return {"success": True, "data": {"review": result}}


@router.patch("/{review_id}/reply", status_code=status.HTTP_200_OK)
async def reply_to_review(
    review_id: UUID,
    payload: ReviewReplyRequest,
    current_owner: User = Depends(require_cafe_owner),
    db: AsyncSession = Depends(get_db)
):
    """Café owner posts a public reply to a review on their own café."""
    review_repo = ReviewRepository(db)
    booking_repo = BookingRepository(db)
    cafe_repo = CafeRepository(db)
    service = ReviewService(review_repo, booking_repo, cafe_repo)
    result = await service.reply_to_review(review_id, current_owner.id, payload.reply)
    return {
        "success": True,
        "data": {
            "review": result
        }
    }
