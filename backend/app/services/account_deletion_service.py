"""Self-service account deletion (Google Play's account-deletion policy).

A deleted account is anonymised in place, not removed. Its bookings, payments
and reviews belong to cafés' and KHEL-O's books as well as the person's, and
are kept for accounting, tax and dispute handling (Privacy Policy §4) — they
just stop pointing at anyone: the user row keeps its id but loses every
identifying field and can never sign in again.

Café owners are not deleted here. Their account carries cafés, payout bank
details and money still to be settled, so the request becomes a support
ticket and an admin closes the account by hand.
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BadRequestException
from app.core.time import now_ist, session_end_ist
from app.models.booking import Booking, BookingStatus
from app.models.cafe import Cafe
from app.models.cafe_waitlist import CafeWaitlistEntry
from app.models.notification import Notification
from app.models.password_reset_token import PasswordResetToken
from app.models.push_subscription import PushSubscription
from app.models.staff_invitation import StaffInvitation
from app.models.support_ticket import SupportTicket, SupportTicketStatus
from app.models.user import User, UserRole
from app.models.user_role import UserRoleMapping

DELETED_NAME = "Deleted user"
# A subdomain KHEL-O controls with no mail server: anything ever sent here
# goes nowhere, and it can't collide with a real address or fail email
# validation the way a reserved TLD like .invalid would.
DELETED_EMAIL_DOMAIN = "deleted.khel-o.com"
DELETION_TICKET_CATEGORY = "account_deletion"

# Paid sessions that haven't finished. Deleting under one would leave a café
# expecting a player whose name and phone it can no longer see.
_UNFINISHED_PAID = (BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN, BookingStatus.ACTIVE)


async def _count_unfinished_bookings(db: AsyncSession, user_id: uuid.UUID) -> int:
    rows = (await db.execute(
        select(Booking.session_date, Booking.start_time, Booking.end_time).where(
            Booking.gamer_id == user_id,
            Booking.status.in_(_UNFINISHED_PAID),
        )
    )).all()
    now = now_ist()
    return sum(1 for r in rows if session_end_ist(r.session_date, r.start_time, r.end_time) > now)


async def _owns_a_cafe(db: AsyncSession, user_id: uuid.UUID) -> bool:
    return (await db.execute(select(Cafe.id).where(Cafe.owner_id == user_id).limit(1))).first() is not None


async def _request_owner_deletion(db: AsyncSession, user: User) -> dict:
    """Owners: one open ticket per account, however many times they press it."""
    open_ticket = (await db.execute(
        select(SupportTicket.id).where(
            SupportTicket.user_id == user.id,
            SupportTicket.category == DELETION_TICKET_CATEGORY,
            SupportTicket.status.in_((SupportTicketStatus.OPEN, SupportTicketStatus.IN_PROGRESS)),
        ).limit(1)
    )).first()
    if open_ticket is None:
        db.add(SupportTicket(
            user_id=user.id,
            subject="Delete my account",
            description=(
                "Requested from the in-app Delete account page. This account runs a café, "
                "so settle any payouts owed, deactivate its cafés, then anonymise the account."
            ),
            category=DELETION_TICKET_CATEGORY,
        ))
        await db.commit()
    return {"status": "requested"}


async def delete_account(db: AsyncSession, user: User) -> dict:
    """Caller has already re-proved identity. Returns {"status": "deleted"}
    or, for café owners, {"status": "requested"}."""
    roles = set((await db.execute(
        select(UserRoleMapping.role).where(UserRoleMapping.user_id == user.id)
    )).scalars().all())
    if UserRole.ADMIN in roles or user.role == UserRole.ADMIN:
        raise BadRequestException(
            message="Admin accounts can't be deleted from here. Ask another admin to remove your access first.",
            error_code="ADMIN_ACCOUNT",
        )

    if await _owns_a_cafe(db, user.id):
        return await _request_owner_deletion(db, user)

    unfinished = await _count_unfinished_bookings(db, user.id)
    if unfinished:
        plural = "booking that hasn't" if unfinished == 1 else "bookings that haven't"
        raise BadRequestException(
            message=(
                f"You have {unfinished} paid {plural} finished yet. Cancel "
                f"{'it' if unfinished == 1 else 'them'} from My Bookings, or wait until "
                f"{'it' if unfinished == 1 else 'they'}'re over, then delete your account."
            ),
            error_code="UNFINISHED_BOOKINGS",
        )

    old_email = user.email
    now = datetime.now(timezone.utc)

    # Things that exist only for this person and mean nothing without them.
    await db.execute(delete(PushSubscription).where(PushSubscription.user_id == user.id))
    await db.execute(delete(PasswordResetToken).where(PasswordResetToken.user_id == user.id))
    await db.execute(delete(Notification).where(Notification.user_id == user.id))
    # Staff access to cafés, and invitations waiting for this address.
    await db.execute(delete(UserRoleMapping).where(UserRoleMapping.user_id == user.id))
    await db.execute(
        update(StaffInvitation)
        .where(StaffInvitation.email == old_email, StaffInvitation.status == "pending")
        .values(status="cancelled")
    )
    # "Tell me when this café goes live" votes stay counted (a real person did
    # ask), but lose every way of reaching them and get no more emails.
    await db.execute(
        update(CafeWaitlistEntry)
        .where(CafeWaitlistEntry.user_id == user.id)
        .values(contact=None, phone=None, contact_method=None, unsubscribed_at=now)
    )

    user.email = f"deleted-{user.id.hex}@{DELETED_EMAIL_DOMAIN}"
    user.full_name = DELETED_NAME
    user.password_hash = None
    user.google_id = None
    user.phone_number = None
    user.avatar_url = None
    user.city = None
    user.acquisition_source = None
    user.acquisition_medium = None
    user.acquisition_campaign = None
    user.preferences = {}
    user.guide_state = {}
    # Every token check (get_current_user, refresh, login) already refuses an
    # inactive user, so this alone ends all of the person's sessions.
    user.is_active = False
    user.deleted_at = now
    await db.commit()
    return {"status": "deleted"}
