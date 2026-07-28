import hmac
import hashlib
from typing import Optional, Dict, Any
from uuid import UUID, uuid4
from datetime import datetime, timezone

from app.config import settings
from app.repositories.payment_repository import PaymentRepository
from app.repositories.booking_repository import BookingRepository
from app.schemas.payment import PaymentCreateResponse, PaymentVerifyRequest, PaymentResponse
from app.models.payment import Payment, PaymentStatus
from app.models.booking import BookingStatus
from app.models.user import User, UserRole
from app.core.exceptions import NotFoundException, ForbiddenException, ValidationException

class PaymentService:
    def __init__(self, payment_repo: PaymentRepository, booking_repo: BookingRepository):
        self.payment_repo = payment_repo
        self.booking_repo = booking_repo

    async def create_razorpay_order(self, booking_id: UUID, gamer_id: UUID) -> PaymentCreateResponse:
        booking = await self.booking_repo.get_by_id(booking_id)
        if not booking:
            raise NotFoundException(message="Booking not found", error_code="BOOKING_NOT_FOUND")

        if str(booking.gamer_id) != str(gamer_id):
            raise ForbiddenException(message="You can only create payment orders for your own bookings", error_code="FORBIDDEN")

        if booking.status != BookingStatus.PENDING_PAYMENT:
            raise ValidationException(
                message=f"Cannot initiate payment for booking in status '{booking.status.value}'",
                error_code="INVALID_BOOKING_STATUS"
            )

        existing_payment = await self.payment_repo.get_by_booking_id(booking_id)
        if existing_payment:
            return PaymentCreateResponse(
                razorpay_order_id=existing_payment.razorpay_order_id,
                amount=float(existing_payment.amount),
                currency=existing_payment.currency,
                key_id=settings.RAZORPAY_KEY_ID
            )

        order_id = f"order_{booking.booking_reference}_{uuid4().hex[:6]}"
        payment_dict = {
            "id": uuid4(),
            "booking_id": booking_id,
            "razorpay_order_id": order_id,
            "amount": float(booking.total_amount),
            "currency": "INR",
            "status": PaymentStatus.CREATED
        }
        created = await self.payment_repo.create(payment_dict)

        return PaymentCreateResponse(
            razorpay_order_id=created.razorpay_order_id,
            amount=float(created.amount),
            currency=created.currency,
            key_id=settings.RAZORPAY_KEY_ID
        )

    create_payment_order = create_razorpay_order

    async def verify_payment(self, payload: PaymentVerifyRequest, gamer_id: UUID) -> PaymentResponse:
        payment = await self.payment_repo.get_by_razorpay_order_id(payload.razorpay_order_id)
        if not payment:
            raise NotFoundException(message="Payment order not found", error_code="PAYMENT_NOT_FOUND")

        booking = await self.booking_repo.get_by_id(payment.booking_id)
        if not booking:
            raise NotFoundException(message="Associated booking not found", error_code="BOOKING_NOT_FOUND")

        if str(booking.gamer_id) != str(gamer_id):
            raise ForbiddenException(message="You can only verify payments for your own bookings", error_code="FORBIDDEN")

        # Verify HMAC signature
        message = f"{payload.razorpay_order_id}|{payload.razorpay_payment_id}"
        expected_signature = hmac.new(
            settings.RAZORPAY_KEY_SECRET.encode('utf-8'),
            message.encode('utf-8'),
            hashlib.sha256
        ).hexdigest()

        if payload.razorpay_signature != expected_signature:
            raise ValidationException(message="Invalid payment signature", error_code="INVALID_SIGNATURE")

        # Update Payment
        updated_payment = await self.payment_repo.update_status(
            payment_id=payment.id,
            status=PaymentStatus.CAPTURED,
            razorpay_payment_id=payload.razorpay_payment_id,
            signature=payload.razorpay_signature
        )

        # Confirm Booking & Populate QR code URL
        qr_url = f"/api/v1/bookings/{booking.id}/qr"
        await self.booking_repo.update(booking.id, {
            "status": BookingStatus.CONFIRMED,
            "qr_code_url": qr_url
        })

        return PaymentResponse.model_validate(updated_payment)

    async def handle_webhook(self, payload: Dict[str, Any], signature: Optional[str] = None) -> Dict[str, str]:
        event = payload.get("event")
        payload_data = payload.get("payload", {})

        if event == "payment.captured":
            entity = payload_data.get("payment", {}).get("entity", {})
            order_id = entity.get("order_id")
            payment_id = entity.get("id")
            if order_id:
                payment = await self.payment_repo.get_by_razorpay_order_id(order_id)
                if payment:
                    await self.payment_repo.update_status(payment.id, PaymentStatus.CAPTURED, razorpay_payment_id=payment_id)
                    qr_url = f"/api/v1/bookings/{payment.booking_id}/qr"
                    await self.booking_repo.update(payment.booking_id, {
                        "status": BookingStatus.CONFIRMED,
                        "qr_code_url": qr_url
                    })

        elif event == "payment.failed":
            entity = payload_data.get("payment", {}).get("entity", {})
            order_id = entity.get("order_id")
            error_reason = entity.get("error_description", "Payment failed")
            if order_id:
                payment = await self.payment_repo.get_by_razorpay_order_id(order_id)
                if payment:
                    await self.payment_repo.update(payment.id, {
                        "status": PaymentStatus.FAILED,
                        "failure_reason": error_reason
                    })

        elif event == "refund.processed":
            entity = payload_data.get("refund", {}).get("entity", {})
            payment_id = entity.get("payment_id")
            refund_id = entity.get("id")
            if payment_id:
                result = await self.payment_repo.db.execute(
                    PaymentRepository.get_by_id.__tablename__  # fetch by payment_id
                ) if hasattr(PaymentRepository, 'get_by_id') else None

        return {"status": "ok"}

    async def process_refund(self, booking_id: UUID, admin_id: UUID) -> Dict[str, Any]:
        payment = await self.payment_repo.get_by_booking_id(booking_id)
        if not payment:
            raise NotFoundException(message="Payment not found for booking", error_code="PAYMENT_NOT_FOUND")

        dummy_refund_id = f"rfnd_{uuid4().hex[:8]}"
        updated = await self.payment_repo.mark_refunded(payment.id, dummy_refund_id)
        await self.booking_repo.update(booking_id, {"status": BookingStatus.CANCELLED})

        return {
            "refundId": dummy_refund_id,
            "status": "processed",
            "amount": float(payment.amount)
        }
