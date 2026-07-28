from app.core.logging import logger

async def send_email_notification(to_email: str, subject: str, body: str):
    logger.info("sending_email", to_email=to_email, subject=subject)
    # Resend email API integration placeholder

async def send_web_push_notification(user_id: str, title: str, body: str):
    logger.info("sending_web_push", user_id=user_id, title=title)
    # FCM Web Push notification placeholder
