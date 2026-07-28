from uuid import UUID
from app.repositories.payment_repository import PaymentRepository
from app.repositories.booking_repository import BookingRepository
from app.schemas.payment import PaymentResponse, RazorpayVerifyRequest
from app.models.payment import Payment, PaymentStatus
from app.models.booking import BookingStatus
from app.core.exceptions import PaymentException, NotFoundException

class PaymentService:
    def __init__(self, payment_repo: PaymentRepository, booking_repo: BookingRepository):
        self.payment_repo = payment_repo
        self.booking_repo = booking_repo

    async def create_payment_order(self, booking_id: UUID) -> PaymentResponse:
        booking = await self.booking_repo.get_by_id(booking_id)
        if not booking:
            raise NotFoundException(message="Booking not found", error_code="BOOKING_NOT_FOUND")

        # Mock order ID for structure
        dummy_order_id = f"order_{booking.booking_reference}"
        payment = Payment(
            booking_id=booking_id,
            razorpay_order_id=dummy_order_id,
            amount=booking.total_amount,
            currency="INR",
            status=PaymentStatus.CREATED,
        )
        created = await self.payment_repo.create(payment)
        return PaymentResponse.model_validate(created)

    async def verify_payment(self, payload: RazorpayVerifyRequest) -> PaymentResponse:
        payment = await self.payment_repo.get_by_razorpay_order_id(payload.razorpay_order_id)
        if not payment:
            raise NotFoundException(message="Payment order not found", error_code="PAYMENT_NOT_FOUND")

        payment.razorpay_payment_id = payload.razorpay_payment_id
        payment.razorpay_signature = payload.razorpay_signature
        payment.status = PaymentStatus.CAPTURED
        
        # Update booking status to confirmed
        booking = await self.booking_repo.get_by_id(payment.booking_id)
        if booking:
            booking.status = BookingStatus.CONFIRMED
            await self.booking_repo.create(booking)

        await self.payment_repo.create(payment)
        return PaymentResponse.model_validate(payment)
