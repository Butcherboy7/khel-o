from uuid import UUID
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.config import settings
from app.core.logging import logger
from app.models.booking import Booking
from app.models.user import User
from app.models.cafe import Cafe
from app.models.hardware_tier import HardwareTier

class NotificationService:
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or settings.RESEND_API_KEY

    async def _send_resend_email(self, to_email: str, subject: str, html_body: str, booking_ref: str) -> bool:
        if not self.api_key:
            logger.warning("resend_api_key_missing", message="RESEND_API_KEY is missing or empty. Email notification skipped.", booking_ref=booking_ref)
            return False

        try:
            import resend
            resend.api_key = self.api_key
            params = {
                "from": "KHEL-O <notifications@khelo.in>",
                "to": [to_email],
                "subject": subject,
                "html": html_body
            }
            resend.Emails.send(params)
            logger.info("resend_email_sent_success", to_email=to_email, subject=subject, booking_ref=booking_ref)
            return True
        except Exception as e:
            logger.error("resend_email_send_failed", error=str(e), to_email=to_email, booking_ref=booking_ref)
            return False

    async def send_booking_confirmation(self, db: AsyncSession, booking_id: UUID):
        try:
            stmt = select(Booking, User, Cafe, HardwareTier).join(
                User, Booking.gamer_id == User.id
            ).join(
                Cafe, Booking.cafe_id == Cafe.id
            ).join(
                HardwareTier, Booking.hardware_tier_id == HardwareTier.id
            ).where(Booking.id == booking_id)

            res = await db.execute(stmt)
            row = res.first()
            if not row:
                return

            booking, gamer, cafe, tier = row[0], row[1], row[2], row[3]
            gamer_first_name = (gamer.full_name or "Gamer").split()[0]
            qr_url = f"{settings.FRONTEND_URL}{booking.qr_code_url}" if booking.qr_code_url else ""

            subject = f"Your gaming session is confirmed! 🎮 [{booking.booking_reference}]"
            html_body = f"""
            <div style="font-family: Arial, sans-serif; background: #09090b; color: #f4f4f5; padding: 20px;">
                <h2>Hello {gamer_first_name}, your session is confirmed!</h2>
                <h1 style="color: #7c3aed;">{booking.booking_reference}</h1>
                <p><strong>Café:</strong> {cafe.name} ({cafe.city})</p>
                <p><strong>Date & Time:</strong> {booking.session_date} at {booking.start_time}</p>
                <p><strong>Tier:</strong> {tier.name}</p>
                <p><strong>Total Paid:</strong> ₹{booking.total_amount}</p>
                {f'<img src="{qr_url}" alt="QR Code" style="width:200px;height:200px;"/>' if qr_url else ''}
                <p>Show this QR code when you arrive at the café.</p>
                <footer style="margin-top:20px; color:#a1a1aa;">KHEL-O — Gaming Café Marketplace</footer>
            </div>
            """
            await self._send_resend_email(gamer.email, subject, html_body, booking.booking_reference)
        except Exception as e:
            logger.error("send_booking_confirmation_error", error=str(e), booking_id=str(booking_id))

    async def send_payment_failure(self, db: AsyncSession, booking_id: UUID):
        try:
            stmt = select(Booking, User).join(User, Booking.gamer_id == User.id).where(Booking.id == booking_id)
            res = await db.execute(stmt)
            row = res.first()
            if not row:
                return
            booking, gamer = row[0], row[1]
            subject = f"Payment unsuccessful for booking [{booking.booking_reference}]"
            html_body = f"<p>Your payment for booking {booking.booking_reference} (₹{booking.total_amount}) failed. Please retry payment from your bookings tab.</p>"
            await self._send_resend_email(gamer.email, subject, html_body, booking.booking_reference)
        except Exception as e:
            logger.error("send_payment_failure_error", error=str(e), booking_id=str(booking_id))

    async def send_session_reminder(self, db: AsyncSession, booking_id: UUID):
        try:
            stmt = select(Booking, User, Cafe).join(User, Booking.gamer_id == User.id).join(Cafe, Booking.cafe_id == Cafe.id).where(Booking.id == booking_id)
            res = await db.execute(stmt)
            row = res.first()
            if not row:
                return
            booking, gamer, cafe = row[0], row[1], row[2]
            subject = f"Your gaming session starts in 30 minutes! ⚡ [{booking.booking_reference}]"
            html_body = f"<p>Your session at {cafe.name} ({cafe.address_line1}) starts at {booking.start_time}. Don't forget your QR code!</p>"
            await self._send_resend_email(gamer.email, subject, html_body, booking.booking_reference)
        except Exception as e:
            logger.error("send_session_reminder_error", error=str(e), booking_id=str(booking_id))

    async def send_refund_confirmation(self, db: AsyncSession, booking_id: UUID):
        try:
            stmt = select(Booking, User).join(User, Booking.gamer_id == User.id).where(Booking.id == booking_id)
            res = await db.execute(stmt)
            row = res.first()
            if not row:
                return
            booking, gamer = row[0], row[1]
            subject = f"Refund processed — [{booking.booking_reference}]"
            html_body = f"<p>Your refund of ₹{booking.total_amount} for booking {booking.booking_reference} has been processed (3-5 business days).</p>"
            await self._send_resend_email(gamer.email, subject, html_body, booking.booking_reference)
        except Exception as e:
            logger.error("send_refund_confirmation_error", error=str(e), booking_id=str(booking_id))
