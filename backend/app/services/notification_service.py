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

    async def send_staff_invitation(self, email: str, full_name: str, venue_name: str, invite_url: str) -> bool:
        try:
            subject = f"You've been invited to join {venue_name} on KHEL-O! 🎮"
            html_body = f"""
            <div style="font-family: Arial, sans-serif; background: #09090b; color: #f4f4f5; padding: 24px; border-radius: 8px;">
                <h2 style="color: #7c3aed; margin-top: 0;">Staff Invitation</h2>
                <p>Hello <strong>{full_name}</strong>,</p>
                <p>You have been invited to join <strong>{venue_name}</strong> as a staff member on KHEL-O Cafe Management Platform.</p>
                <p>Click the button below to accept your invitation and set up your account password:</p>
                <div style="margin: 24px 0;">
                    <a href="{invite_url}" style="background-color: #7c3aed; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Accept Invitation & Set Password</a>
                </div>
                <p style="color: #a1a1aa; font-size: 14px;">Or copy and paste this link into your browser:<br/><a href="{invite_url}" style="color: #a78bfa;">{invite_url}</a></p>
                <p style="color: #71717a; font-size: 12px; margin-top: 24px;">This invitation link will expire in 7 days.</p>
                <footer style="margin-top: 20px; border-top: 1px solid #27272a; padding-top: 12px; color: #71717a; font-size: 12px;">
                    KHEL-O — Next Gen Gaming Cafe Platform
                </footer>
            </div>
            """
            return await self._send_resend_email(email, subject, html_body, f"INVITE-{venue_name}")
        except Exception as e:
            logger.error("send_staff_invitation_error", error=str(e), email=email)
            return False

    async def send_password_reset(self, email: str, full_name: str, reset_url: str) -> bool:
        try:
            subject = "Reset your KHEL-O password"
            html_body = f"""
            <div style="font-family: Arial, sans-serif; background: #09090b; color: #f4f4f5; padding: 24px; border-radius: 8px;">
                <h2 style="color: #7c3aed; margin-top: 0;">Password Reset</h2>
                <p>Hello <strong>{full_name or 'there'}</strong>,</p>
                <p>We received a request to reset the password on your KHEL-O account. Click the button below to choose a new one:</p>
                <div style="margin: 24px 0;">
                    <a href="{reset_url}" style="background-color: #7c3aed; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Reset Password</a>
                </div>
                <p style="color: #a1a1aa; font-size: 14px;">Or copy and paste this link into your browser:<br/><a href="{reset_url}" style="color: #a78bfa;">{reset_url}</a></p>
                <p style="color: #71717a; font-size: 12px; margin-top: 24px;">This link will expire in 30 minutes. If you didn't request this, you can safely ignore this email — your password won't change.</p>
                <footer style="margin-top: 20px; border-top: 1px solid #27272a; padding-top: 12px; color: #71717a; font-size: 12px;">
                    KHEL-O — Next Gen Gaming Cafe Platform
                </footer>
            </div>
            """
            return await self._send_resend_email(email, subject, html_body, "PASSWORD-RESET")
        except Exception as e:
            logger.error("send_password_reset_error", error=str(e), email=email)
            return False

