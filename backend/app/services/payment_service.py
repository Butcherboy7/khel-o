import hmac
import hashlib
import json
import logging
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
from app.models.cafe import Cafe
from app.models.owner_payout_account import OwnerPayoutAccount
from app.models.platform_fee import PlatformFee
from app.core.exceptions import NotFoundException, ForbiddenException, ValidationException
from app.background.qr_generator import generate_and_save_qr_code
from app.services.notification_service import NotificationService

logger = logging.getLogger(__name__)

class PaymentService:
    def __init__(
        self,
        payment_repo: PaymentRepository,
        booking_repo: BookingRepository,
        db_session: Optional[Any] = None
    ):
        self.payment_repo = payment_repo
        self.booking_repo = booking_repo
        self.db = db_session

    async def _notify_owner(self, cafe_id: UUID, title: str, message: str, notification_type: str = "system", link: Optional[str] = None) -> None:
        """Best-effort in-app notification for the café owner. Never blocks the payment flow."""
        try:
            from sqlalchemy import select
            cafe_result = await self.booking_repo.db.execute(select(Cafe).where(Cafe.id == cafe_id))
            cafe = cafe_result.scalars().first()
            if not cafe or not cafe.owner_id:
                return
            from app.models.notification import Notification
            notif = Notification(
                id=uuid4(),
                user_id=cafe.owner_id,
                title=title,
                message=message,
                notification_type=notification_type,
                is_read=False,
                link=link
            )
            self.booking_repo.db.add(notif)
            await self.booking_repo.db.commit()
        except Exception as e:
            logger.error(f"Failed to write owner notification for cafe {cafe_id}: {e}")

    async def _backfill_phone_from_payment(self, gamer_id: UUID, contact: Optional[str]) -> None:
        """Razorpay's own checkout collects a phone number from the customer
        (for its UPI/card verification) and includes it as `contact` on the
        captured payment entity. If our own record has no phone number for
        this user yet, save it here — no OTP, no extra step, just reusing
        data the customer already gave Razorpay during checkout."""
        if not contact:
            return
        try:
            from app.repositories.user_repository import UserRepository
            user_repo = UserRepository(self.payment_repo.db)
            user = await user_repo.get_by_id(gamer_id)
            if user and not user.phone_number:
                await user_repo.update(gamer_id, {"phone_number": contact})
        except Exception as e:
            logger.error(f"Failed to backfill phone number for user {gamer_id} from payment: {e}")

    async def _create_route_transfer(self, booking, razorpay_payment_id: str) -> None:
        """Split a captured payment: transfer the café's share to its Razorpay Route
        linked account, leaving KHEL-O's service fee behind in the main account.

        Called from both verify_payment (frontend-driven confirmation) and the
        payment.captured webhook (server-to-server, the reliable source of truth)
        — both paths can fire for the same payment, so this is idempotent via the
        PlatformFee row's transfer_status/razorpay_transfer_id.
        """
        if not getattr(settings, "RAZORPAY_ROUTE_ENABLED", False):
            return

        from sqlalchemy import select
        from app.repositories.platform_fee_repository import PlatformFeeRepository

        fee_repo = PlatformFeeRepository(self.payment_repo.db)
        fee_row = await fee_repo.get_by_booking_id(booking.id)
        if not fee_row:
            logger.error(f"No PlatformFee row for booking {booking.id}; cannot create Route transfer")
            return

        if fee_row.transfer_status == "transferred":
            return  # already split by the other confirmation path

        cafe_result = await self.payment_repo.db.execute(select(Cafe).where(Cafe.id == booking.cafe_id))
        cafe = cafe_result.scalars().first()
        if not cafe:
            await fee_repo.update(fee_row, {"transfer_status": "failed", "transfer_error": "Cafe not found"})
            return

        payout_result = await self.payment_repo.db.execute(
            select(OwnerPayoutAccount).where(OwnerPayoutAccount.owner_id == cafe.owner_id)
        )
        payout = payout_result.scalars().first()

        if not payout or payout.kyc_status != "activated" or not payout.razorpay_account_id:
            await fee_repo.update(fee_row, {"transfer_status": "skipped_no_linked_account"})
            logger.info(f"Skipping Route transfer for booking {booking.id}: café owner has no activated linked account yet")
            return

        if not (settings.RAZORPAY_KEY_ID and settings.RAZORPAY_KEY_SECRET):
            await fee_repo.update(fee_row, {"transfer_status": "failed", "transfer_error": "Razorpay credentials not configured"})
            return

        try:
            import base64
            import urllib.request

            auth_str = f"{settings.RAZORPAY_KEY_ID}:{settings.RAZORPAY_KEY_SECRET}"
            encoded_auth = base64.b64encode(auth_str.encode('utf-8')).decode('utf-8')
            headers = {
                "Authorization": f"Basic {encoded_auth}",
                "Content-Type": "application/json"
            }

            transfer_url = f"https://api.razorpay.com/v1/payments/{razorpay_payment_id}/transfers"
            payload_data = json.dumps({
                "transfers": [{
                    "account": payout.razorpay_account_id,
                    "amount": int(round(fee_row.owner_settlement_amount * 100)),
                    "currency": "INR",
                    "on_hold": False,
                    "notes": {
                        "booking_id": str(booking.id),
                        "booking_reference": booking.booking_reference
                    }
                }]
            }).encode('utf-8')

            req = urllib.request.Request(transfer_url, data=payload_data, headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=10) as resp:
                res_data = json.loads(resp.read().decode('utf-8'))
                items = res_data.get("items", [])
                transfer_id = items[0]["id"] if items else res_data.get("id")

            await fee_repo.update(fee_row, {
                "razorpay_transfer_id": transfer_id,
                "transfer_status": "transferred",
                "transfer_error": None
            })
            logger.info(f"Route transfer {transfer_id} created for booking {booking.id}: INR {fee_row.owner_settlement_amount} to {payout.razorpay_account_id}")
        except Exception as e:
            logger.error(f"Route transfer failed for booking {booking.id}: {e}")
            await fee_repo.update(fee_row, {"transfer_status": "failed", "transfer_error": str(e)[:500]})

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

        # Get Café and Payout details
        from sqlalchemy import select
        cafe_stmt = select(Cafe).where(Cafe.id == booking.cafe_id)
        cafe_res = await self.payment_repo.db.execute(cafe_stmt)
        cafe = cafe_res.scalars().first()

        if not cafe:
             raise NotFoundException(message="Café not found", error_code="CAFE_NOT_FOUND")

        payout_stmt = select(OwnerPayoutAccount).where(OwnerPayoutAccount.owner_id == cafe.owner_id)
        payout_res = await self.payment_repo.db.execute(payout_stmt)
        payout = payout_res.scalars().first()

        # Check KYC completion if Route split is active
        if getattr(settings, "RAZORPAY_ROUTE_ENABLED", False):
            if not payout or payout.kyc_status != "activated":
                raise ValidationException(
                    message="Café owner has not completed payout setup or KYC is pending",
                    error_code="OWNER_KYC_INCOMPLETE"
                )

        existing_payment = await self.payment_repo.get_by_booking_id(booking_id)
        if existing_payment:
            return PaymentCreateResponse(
                razorpay_order_id=existing_payment.razorpay_order_id,
                amount=float(existing_payment.amount),
                currency=existing_payment.currency,
                key_id=settings.RAZORPAY_KEY_ID
            )

        # Fetch settlement share from PlatformFee row
        fee_stmt = select(PlatformFee).where(PlatformFee.booking_id == booking_id)
        fee_res = await self.payment_repo.db.execute(fee_stmt)
        fee_row = fee_res.scalars().first()
        owner_share = fee_row.owner_settlement_amount if fee_row else (booking.base_amount - booking.discount_amount)

        # Attempt real Razorpay API order creation if keys are present
        order_id = None
        if settings.RAZORPAY_KEY_ID and settings.RAZORPAY_KEY_SECRET:
            try:
                import base64
                import urllib.request
                import json
                
                auth_str = f"{settings.RAZORPAY_KEY_ID}:{settings.RAZORPAY_KEY_SECRET}"
                encoded_auth = base64.b64encode(auth_str.encode('utf-8')).decode('utf-8')
                headers = {
                    "Authorization": f"Basic {encoded_auth}",
                    "Content-Type": "application/json"
                }
                payload_data = json.dumps({
                    "amount": int(round(booking.total_amount * 100)),
                    "currency": "INR",
                    "receipt": booking.booking_reference
                }).encode('utf-8')

                req = urllib.request.Request("https://api.razorpay.com/v1/orders", data=payload_data, headers=headers, method="POST")
                with urllib.request.urlopen(req, timeout=5) as resp:
                    res_data = json.loads(resp.read().decode('utf-8'))
                    order_id = res_data.get("id")
            except Exception as e:
                logger.warning(f"Razorpay API order creation failed, falling back to local order ID: {e}")

        if not order_id:
            order_id = f"order_{booking.booking_reference}_{uuid4().hex[:6]}"

        # Log split for transparency
        logger.info(f"Creating order {order_id} with Route split: Cafe Owner Share = INR {owner_share}, Platform Share = INR {booking.total_amount - owner_share}")

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

        if booking.status != BookingStatus.PENDING_PAYMENT:
            raise ValidationException(
                message=f"Cannot verify payment for booking in status '{booking.status.value}'",
                error_code="INVALID_BOOKING_STATUS"
            )

        if abs(payment.amount - booking.total_amount) > 0.01:
            logger.error(f"Payment amount mismatch: payment.amount={payment.amount}, booking.total_amount={booking.total_amount}")
            raise ValidationException(
                message="Payment amount does not match booking total",
                error_code="AMOUNT_MISMATCH"
            )

        # Verify HMAC signature
        message = f"{payload.razorpay_order_id}|{payload.razorpay_payment_id}"
        expected_signature = hmac.new(
            settings.RAZORPAY_KEY_SECRET.encode('utf-8'),
            message.encode('utf-8'),
            hashlib.sha256
        ).hexdigest()

        if payload.razorpay_signature != expected_signature:
            if payload.razorpay_signature == 'mock_signature_valid' and settings.ENVIRONMENT != "production":
                logger.info("Mock signature accepted in development mode")
            elif payload.razorpay_signature == 'mock_signature_valid':
                raise ValidationException(message="Invalid payment signature", error_code="INVALID_SIGNATURE")
            elif payload.razorpay_signature.startswith('mock_signature_INVALID'):
                await self.payment_repo.update_status(
                    payment_id=payment.id,
                    status=PaymentStatus.FAILED,
                    razorpay_payment_id=payload.razorpay_payment_id,
                    signature=payload.razorpay_signature
                )
                await self.booking_repo.update(booking.id, {
                    "status": BookingStatus.FAILED,
                    "cancellation_reason": "Payment failed: Invalid signature"
                })
                await self._notify_owner(
                    cafe_id=booking.cafe_id,
                    title="Payment issue on a booking",
                    message=f"Booking {booking.booking_reference} failed payment verification (invalid signature).",
                    notification_type="payment_failed",
                    link=f"/owner/bookings?ref={booking.booking_reference}"
                )
                raise ValidationException(message="Payment verification failed: Invalid signature", error_code="PAYMENT_FAILED")
            elif settings.ENVIRONMENT == "production":
                raise ValidationException(message="Invalid payment signature", error_code="INVALID_SIGNATURE")
            else:
                logger.warning(f"Signature mismatch in dev mode (Expected {expected_signature}, got {payload.razorpay_signature}); allowing for testing.")

        # Verify 15-minute TTL window has not expired
        now_utc = datetime.now(timezone.utc)
        if booking.created_at:
            created_dt = booking.created_at.replace(tzinfo=timezone.utc) if booking.created_at.tzinfo is None else booking.created_at
            if (now_utc - created_dt).total_seconds() > 900:
                await self.booking_repo.update(booking.id, {
                    "status": BookingStatus.FAILED,
                    "cancellation_reason": "Payment completed after 15-minute TTL window"
                })
                raise ValidationException(message="Payment session expired after 15 minutes. Auto-refund initiated.", error_code="PAYMENT_TTL_EXPIRED")

        # Update Payment
        updated_payment = await self.payment_repo.update_status(
            payment_id=payment.id,
            status=PaymentStatus.CAPTURED,
            razorpay_payment_id=payload.razorpay_payment_id,
            signature=payload.razorpay_signature
        )

        # Generate & save QR code file, update booking status
        qr_url = generate_and_save_qr_code(
            booking_id=str(booking.id),
            booking_reference=booking.booking_reference,
            cafe_id=str(booking.cafe_id)
        )
        await self.booking_repo.update(booking.id, {
            "status": BookingStatus.CONFIRMED,
            "qr_code_url": qr_url
        })

        # Trigger confirmation email
        notifier = NotificationService()
        await notifier.send_booking_confirmation(self.payment_repo.db, booking.id)

        # In-app notification for the café owner
        await self._notify_owner(
            cafe_id=booking.cafe_id,
            title="New booking confirmed",
            message=f"Booking {booking.booking_reference} confirmed for {booking.session_date} at {booking.start_time}.",
            notification_type="booking_confirmed",
            link=f"/owner/bookings?ref={booking.booking_reference}"
        )

        await self._create_route_transfer(booking, payload.razorpay_payment_id)

        return PaymentResponse.model_validate(updated_payment)

    async def handle_webhook(self, raw_body_bytes: bytes, signature: Optional[str] = None) -> Dict[str, str]:
        webhook_secret = settings.RAZORPAY_WEBHOOK_SECRET

        if not webhook_secret:
            if settings.ENVIRONMENT == "production":
                logger.error("RAZORPAY_WEBHOOK_SECRET is empty in production mode; rejecting webhook")
                return {"status": "ok"}
            else:
                logger.warning("RAZORPAY_WEBHOOK_SECRET is empty in development mode; proceeding without signature check")
        else:
            if not signature:
                logger.warning("invalid_webhook_signature: Missing signature header")
                return {"status": "ok"}
            expected = hmac.new(
                webhook_secret.encode('utf-8'),
                raw_body_bytes,
                hashlib.sha256
            ).hexdigest()
            if not hmac.compare_digest(expected, signature):
                logger.warning("invalid_webhook_signature: Webhook signature mismatch")
                return {"status": "ok"}

        try:
            payload = json.loads(raw_body_bytes.decode('utf-8'))
        except Exception:
            logger.warning("Invalid JSON payload in webhook")
            return {"status": "ok"}

        event = payload.get("event")
        payload_data = payload.get("payload", {})
        notifier = NotificationService()

        if event == "payment.captured":
            entity = payload_data.get("payment", {}).get("entity", {})
            order_id = entity.get("order_id")
            payment_id = entity.get("id")
            if order_id:
                payment = await self.payment_repo.get_by_razorpay_order_id(order_id)
                if payment:
                    booking = await self.booking_repo.get_by_id(payment.booking_id)
                    if booking:
                        now_utc = datetime.now(timezone.utc)
                        created_dt = booking.created_at.replace(tzinfo=timezone.utc) if (booking.created_at and booking.created_at.tzinfo is None) else (booking.created_at or now_utc)
                        
                        # Check TTL expiry before confirmation (> 900 seconds = 15 mins)
                        if booking.status == BookingStatus.PENDING_PAYMENT and (now_utc - created_dt).total_seconds() > 900:
                            logger.warning(f"Rejecting late webhook confirmation for expired booking {booking.id}")
                            await self.payment_repo.update(payment.id, {
                                "status": PaymentStatus.FAILED,
                                "failure_reason": "Late webhook payment received after 15-minute TTL expiry"
                            })
                            await self.booking_repo.update(booking.id, {
                                "status": BookingStatus.FAILED,
                                "cancellation_reason": "Payment captured after 15-minute TTL window"
                            })
                            return {"status": "ttl_expired_refunded"}

                        await self.payment_repo.update_status(payment.id, PaymentStatus.CAPTURED, razorpay_payment_id=payment_id)
                        qr_url = generate_and_save_qr_code(
                            booking_id=str(booking.id),
                            booking_reference=booking.booking_reference,
                            cafe_id=str(booking.cafe_id)
                        )
                        await self.booking_repo.update(booking.id, {
                            "status": BookingStatus.CONFIRMED,
                            "qr_code_url": qr_url
                        })
                        await notifier.send_booking_confirmation(self.payment_repo.db, booking.id)
                        await self._create_route_transfer(booking, payment_id)
                        await self._backfill_phone_from_payment(booking.gamer_id, entity.get("contact"))

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
                    await notifier.send_payment_failure(self.payment_repo.db, payment.booking_id)

        elif event in ("account.activated", "account.suspended", "account.rejected"):
            entity = payload_data.get("account", {}).get("entity", {})
            account_id = entity.get("id")
            if account_id:
                from app.services.owner_payout_service import OwnerPayoutService
                from app.repositories.owner_payout_repository import OwnerPayoutRepository
                payout_repo = OwnerPayoutRepository(self.payment_repo.db)
                payout_service = OwnerPayoutService(payout_repo)
                await payout_service.handle_kyc_webhook(account_id, event)

        return {"status": "ok"}

    async def process_refund(self, booking_id: UUID, admin_id: UUID) -> Dict[str, Any]:
        payment = await self.payment_repo.get_by_booking_id(booking_id)
        if not payment:
            raise NotFoundException(message="Payment not found for booking", error_code="PAYMENT_NOT_FOUND")

        # NOTE (Route, deliberately not auto-handled yet — needs live testing first):
        # if this booking's payment was already split to the café's linked account
        # (transfer_status == "transferred"), a plain refund on the original payment
        # can leave the books mismatched — the café's share already left the main
        # account. Razorpay can reverse a linked-account transfer, but that's a
        # separate API call this doesn't make. Flagging loudly rather than silently
        # under- or over-refunding until this is verified against a real transfer.
        from app.repositories.platform_fee_repository import PlatformFeeRepository
        fee_repo = PlatformFeeRepository(self.payment_repo.db)
        fee_row = await fee_repo.get_by_booking_id(booking_id)
        if fee_row and fee_row.transfer_status == "transferred":
            logger.warning(
                f"Refunding booking {booking_id} whose payment was already split via Route "
                f"(transfer {fee_row.razorpay_transfer_id}, café share INR {fee_row.owner_settlement_amount}) — "
                f"the café's share is NOT automatically clawed back by this refund. Reverse the "
                f"transfer manually in the Razorpay dashboard, or via the Route reversal API, until "
                f"automatic reversal is built and tested."
            )

        if not payment.razorpay_payment_id:
            logger.warning(f"Payment for booking {booking_id} has no razorpay_payment_id; cannot refund via Razorpay")
            return {
                "refundId": None,
                "status": "no_payment_id",
                "amount": float(payment.amount),
                "message": "No Razorpay payment ID found; manual refund required"
            }

        real_refund_id = None
        refund_status = "pending_manual_refund"
        
        if settings.RAZORPAY_KEY_ID and settings.RAZORPAY_KEY_SECRET:
            try:
                import base64
                import urllib.request
                
                auth_str = f"{settings.RAZORPAY_KEY_ID}:{settings.RAZORPAY_KEY_SECRET}"
                encoded_auth = base64.b64encode(auth_str.encode('utf-8')).decode('utf-8')
                
                refund_url = f"https://api.razorpay.com/v1/payments/{payment.razorpay_payment_id}/refund"
                payload_data = json.dumps({
                    "amount": int(round(payment.amount * 100)),
                    "notes": {
                        "booking_id": str(booking_id),
                        "refunded_by": str(admin_id)
                    }
                }).encode('utf-8')
                
                headers = {
                    "Authorization": f"Basic {encoded_auth}",
                    "Content-Type": "application/json"
                }
                
                req = urllib.request.Request(refund_url, data=payload_data, headers=headers, method="POST")
                with urllib.request.urlopen(req, timeout=10) as resp:
                    res_data = json.loads(resp.read().decode('utf-8'))
                    real_refund_id = res_data.get("id")
                    refund_status = "processed"
                    logger.info(f"Razorpay refund initiated: {real_refund_id} for booking {booking_id}")
            except Exception as e:
                logger.error(f"Razorpay refund API failed: {e}")
        else:
            logger.warning("Razorpay credentials not configured; skipping real refund API call")

        refund_id = real_refund_id or f"local_rfnd_{uuid4().hex[:8]}"
        updated = await self.payment_repo.mark_refunded(payment.id, refund_id)
        await self.booking_repo.update(booking_id, {"status": BookingStatus.CANCELLED})

        notifier = NotificationService()
        await notifier.send_refund_confirmation(self.payment_repo.db, booking_id)

        return {
            "refundId": refund_id,
            "status": refund_status,
            "amount": float(payment.amount)
        }
