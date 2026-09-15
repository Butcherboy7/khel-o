import html
from uuid import UUID
from typing import Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.config import settings
from app.core.logging import logger
from app.models.booking import Booking
from app.models.user import User
from app.models.cafe import Cafe
from app.models.hardware_tier import HardwareTier

# Mirrors frontend/src/globals.css's brand tokens (--primary, --secondary,
# --surface, --text-primary/-secondary) so transactional email matches the
# site instead of the generic purple-on-black these templates started with.
_BRAND_PRIMARY = "#E54D42"
_BRAND_PRIMARY_DARK = "#C83B31"
_BRAND_SECONDARY = "#18191E"
_BRAND_SURFACE = "#F1EFEA"
_BRAND_CARD = "#FFFFFF"
_BRAND_TEXT_PRIMARY = "#111318"
_BRAND_TEXT_SECONDARY = "#5A5E6B"
_BRAND_BORDER = "#E8E6E2"


def _email_button(url: str, label: str) -> str:
    return (
        f'<a href="{url}" style="background-color: {_BRAND_PRIMARY}; color: #ffffff; '
        f'padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: 700; '
        f'display: inline-block; font-family: Arial, sans-serif;">{label}</a>'
    )


def _email_wrapper(body_html: str) -> str:
    """Shared card layout for every transactional email — wordmark header,
    white card on the site's warm cream background, muted footer."""
    return f"""
    <div style="background: {_BRAND_SURFACE}; padding: 32px 16px; font-family: Arial, sans-serif;">
        <div style="max-width: 480px; margin: 0 auto;">
            <div style="text-align: center; padding-bottom: 20px;">
                <span style="font-size: 22px; font-weight: 800; color: {_BRAND_SECONDARY}; letter-spacing: -0.5px;">
                    KHEL<span style="color: {_BRAND_PRIMARY};">-O</span>
                </span>
            </div>
            <div style="background: {_BRAND_CARD}; border: 1px solid {_BRAND_BORDER}; border-radius: 12px; padding: 32px; color: {_BRAND_TEXT_PRIMARY};">
                {body_html}
            </div>
            <p style="text-align: center; color: {_BRAND_TEXT_SECONDARY}; font-size: 12px; margin-top: 20px;">
                KHEL-O — Next Gen Gaming Cafe Platform
            </p>
        </div>
    </div>
    """


_ses_client: Any = None


def _get_ses_client() -> Any:
    global _ses_client
    if _ses_client is None:
        import boto3
        _ses_client = boto3.client(
            "ses",
            region_name=settings.AWS_REGION,
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        )
    return _ses_client


class NotificationService:
    async def _send_resend_email(self, to_email: str, subject: str, html_body: str, booking_ref: str) -> bool:
        """Tries Resend first, falls back to AWS SES. SES production access is
        still pending (sandbox only sends to verified addresses), so Resend is
        the path that actually reaches real inboxes right now. Name kept as-is
        since auth_service and the booking flows already call this method."""
        if settings.RESEND_API_KEY:
            sent = await self._send_via_resend(to_email, subject, html_body, booking_ref)
            if sent:
                return True
            logger.warning("resend_send_failed_falling_back_to_ses", to_email=to_email, booking_ref=booking_ref)

        return await self._send_via_ses(to_email, subject, html_body, booking_ref)

    async def _send_via_resend(self, to_email: str, subject: str, html_body: str, booking_ref: str) -> bool:
        import httpx

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(
                    "https://api.resend.com/emails",
                    headers={"Authorization": f"Bearer {settings.RESEND_API_KEY}"},
                    json={
                        "from": settings.RESEND_SENDER_EMAIL,
                        "to": [to_email],
                        "subject": subject,
                        "html": html_body,
                    },
                )
            if response.status_code >= 400:
                logger.error("resend_email_send_failed", status_code=response.status_code, body=response.text, to_email=to_email, booking_ref=booking_ref)
                return False
            logger.info("resend_email_sent_success", to_email=to_email, subject=subject, booking_ref=booking_ref)
            return True
        except Exception as e:
            logger.error("resend_email_send_failed", error=str(e), to_email=to_email, booking_ref=booking_ref)
            return False

    async def _send_via_ses(self, to_email: str, subject: str, html_body: str, booking_ref: str) -> bool:
        if not settings.AWS_ACCESS_KEY_ID or not settings.AWS_SECRET_ACCESS_KEY:
            logger.warning("ses_credentials_missing", message="AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY missing. Email notification skipped.", booking_ref=booking_ref)
            return False

        try:
            client = _get_ses_client()
            client.send_email(
                Source=settings.SES_SENDER_EMAIL,
                Destination={"ToAddresses": [to_email]},
                Message={
                    "Subject": {"Data": subject, "Charset": "UTF-8"},
                    "Body": {"Html": {"Data": html_body, "Charset": "UTF-8"}},
                },
            )
            logger.info("ses_email_sent_success", to_email=to_email, subject=subject, booking_ref=booking_ref)
            return True
        except Exception as e:
            logger.error("ses_email_send_failed", error=str(e), to_email=to_email, booking_ref=booking_ref)
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
            html_body = _email_wrapper(f"""
                <h2 style="margin-top: 0; color: {_BRAND_TEXT_PRIMARY};">Hello {gamer_first_name}, your session is confirmed!</h2>
                <p style="font-size: 20px; font-weight: 700; color: {_BRAND_PRIMARY}; margin: 4px 0 20px;">{booking.booking_reference}</p>
                <p><strong>Café:</strong> {cafe.name} ({cafe.city})</p>
                <p><strong>Date & Time:</strong> {booking.session_date} at {booking.start_time}</p>
                <p><strong>Tier:</strong> {tier.name}</p>
                <p><strong>Total Paid:</strong> ₹{booking.total_amount}</p>
                {f'<div style="text-align:center; margin: 20px 0;"><img src="{qr_url}" alt="QR Code" style="width:200px;height:200px; border-radius: 8px; border: 1px solid {_BRAND_BORDER};"/></div>' if qr_url else ''}
                <p style="color: {_BRAND_TEXT_SECONDARY}; font-size: 14px;">Show this QR code when you arrive at the café.</p>
            """)
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
            html_body = _email_wrapper(f"""
                <h2 style="margin-top: 0; color: {_BRAND_TEXT_PRIMARY};">Payment unsuccessful</h2>
                <p>Your payment for booking <strong>{booking.booking_reference}</strong> (₹{booking.total_amount}) failed.</p>
                <p style="color: {_BRAND_TEXT_SECONDARY};">Please retry payment from your bookings tab.</p>
            """)
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
            html_body = _email_wrapper(f"""
                <h2 style="margin-top: 0; color: {_BRAND_TEXT_PRIMARY};">Your session starts in 30 minutes!</h2>
                <p>Your session at <strong>{cafe.name}</strong> ({cafe.address_line1}) starts at <strong>{booking.start_time}</strong>.</p>
                <p style="color: {_BRAND_TEXT_SECONDARY};">Don't forget your QR code!</p>
            """)
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
            html_body = _email_wrapper(f"""
                <h2 style="margin-top: 0; color: {_BRAND_TEXT_PRIMARY};">Refund processed</h2>
                <p>Your refund of <strong>₹{booking.total_amount}</strong> for booking <strong>{booking.booking_reference}</strong> has been processed.</p>
                <p style="color: {_BRAND_TEXT_SECONDARY};">Expect it in your account within 3-5 business days.</p>
            """)
            await self._send_resend_email(gamer.email, subject, html_body, booking.booking_reference)
        except Exception as e:
            logger.error("send_refund_confirmation_error", error=str(e), booking_id=str(booking_id))

    async def send_staff_invitation(self, email: str, full_name: str, venue_name: str, invite_url: str) -> bool:
        try:
            subject = f"You've been invited to join {venue_name} on KHEL-O! 🎮"
            html_body = _email_wrapper(f"""
                <h2 style="margin-top: 0; color: {_BRAND_TEXT_PRIMARY};">Staff Invitation</h2>
                <p>Hello <strong>{full_name}</strong>,</p>
                <p>You have been invited to join <strong>{venue_name}</strong> as a staff member on KHEL-O's café management platform.</p>
                <p>Click below to accept your invitation and set up your account password:</p>
                <div style="margin: 24px 0; text-align: center;">
                    {_email_button(invite_url, "Accept Invitation & Set Password")}
                </div>
                <p style="color: {_BRAND_TEXT_SECONDARY}; font-size: 13px;">Or copy and paste this link into your browser:<br/><a href="{invite_url}" style="color: {_BRAND_PRIMARY_DARK}; word-break: break-all;">{invite_url}</a></p>
                <p style="color: {_BRAND_TEXT_SECONDARY}; font-size: 12px; margin-top: 20px; margin-bottom: 0;">This invitation link will expire in 7 days.</p>
            """)
            return await self._send_resend_email(email, subject, html_body, f"INVITE-{venue_name}")
        except Exception as e:
            logger.error("send_staff_invitation_error", error=str(e), email=email)
            return False

    async def send_password_reset(self, email: str, full_name: str, reset_url: str) -> bool:
        try:
            subject = "Reset your KHEL-O password"
            html_body = _email_wrapper(f"""
                <h2 style="margin-top: 0; color: {_BRAND_TEXT_PRIMARY};">Password Reset</h2>
                <p>Hello <strong>{full_name or 'there'}</strong>,</p>
                <p>We received a request to reset the password on your KHEL-O account. Click below to choose a new one:</p>
                <div style="margin: 24px 0; text-align: center;">
                    {_email_button(reset_url, "Reset Password")}
                </div>
                <p style="color: {_BRAND_TEXT_SECONDARY}; font-size: 13px;">Or copy and paste this link into your browser:<br/><a href="{reset_url}" style="color: {_BRAND_PRIMARY_DARK}; word-break: break-all;">{reset_url}</a></p>
                <p style="color: {_BRAND_TEXT_SECONDARY}; font-size: 12px; margin-top: 20px; margin-bottom: 0;">This link will expire in 30 minutes. If you didn't request this, you can safely ignore this email — your password won't change.</p>
            """)
            return await self._send_resend_email(email, subject, html_body, "PASSWORD-RESET")
        except Exception as e:
            logger.error("send_password_reset_error", error=str(e), email=email)
            return False

    async def send_contact_message(self, to_email: str, name: str, from_email: str, category: str, message: str) -> bool:
        try:
            safe_name = html.escape(name)
            safe_message = html.escape(message).replace("\n", "<br/>")
            subject = f"KHEL-O contact form: {category}"
            html_body = f"""
            <div style="font-family: Arial, sans-serif; background: #09090b; color: #f4f4f5; padding: 24px; border-radius: 8px;">
                <h2 style="color: #7c3aed; margin-top: 0;">New contact form submission</h2>
                <p><strong>From:</strong> {safe_name} &lt;{html.escape(from_email)}&gt;</p>
                <p><strong>Category:</strong> {html.escape(category)}</p>
                <p style="margin-top: 16px;">{safe_message}</p>
            </div>
            """
            return await self._send_resend_email(to_email, subject, html_body, "CONTACT-FORM")
        except Exception as e:
            logger.error("send_contact_message_error", error=str(e), from_email=from_email)
            return False

