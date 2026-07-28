from app.background.notification_tasks import send_email_notification, send_web_push_notification

class NotificationService:
    async def notify_booking_confirmation(self, email: str, booking_reference: str, cafe_name: str):
        subject = f"🎮 Booking Confirmed: {booking_reference} at {cafe_name}"
        body = f"Your booking {booking_reference} at {cafe_name} is confirmed!"
        await send_email_notification(to_email=email, subject=subject, body=body)

    async def notify_session_reminder(self, user_id: str, email: str, cafe_name: str):
        title = "🎮 Session Reminder"
        body = f"Get Ready! Your session at {cafe_name} starts in 30 minutes."
        await send_web_push_notification(user_id=user_id, title=title, body=body)
        await send_email_notification(to_email=email, subject=title, body=body)
