"""What the customer pays, after the café's price and any offer: KHEL-O's
₹1 price drop and the first-booking launch offer. Used by both the quote
(what checkout shows) and create_booking (what is charged), so they agree.

- Price drop (every booking, no end date): when the café's price for the
  session, after any offer, is a round number (ends in 0), the customer pays
  ₹1 less: ₹150 -> ₹149, ₹300 -> ₹299. ₹155 or ₹225 stay as they are.
  KHEL-O pays the café that ₹1, so the café's share never changes.
- Booking fee: the platform percentage of what the customer pays for the
  session (the ₹149, not the ₹150).
- First-booking offer: a customer's first booking has no booking fee, until
  FIRST_BOOKING_OFFER_ENDS, for the first FIRST_BOOKING_OFFER_CAP bookings.
"""
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import IST

FIRST_BOOKING_OFFER_ENDS = datetime(2026, 11, 30, 23, 59, 59, tzinfo=IST)
FIRST_BOOKING_OFFER_CAP = 500

# A booking that was actually paid for. An abandoned or failed checkout
# doesn't make someone a returning customer, and doesn't use up the cap.
def _paid_statuses():
    from app.models.booking import BookingStatus
    return (BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN, BookingStatus.ACTIVE,
            BookingStatus.COMPLETED, BookingStatus.NO_SHOW)


def price_drop(cafe_price: Decimal) -> Decimal:
    """₹1 off a round café price (ends in 0), else nothing."""
    if cafe_price > 0 and cafe_price == cafe_price.to_integral_value() and int(cafe_price) % 10 == 0:
        return Decimal('1.00')
    return Decimal('0.00')


@dataclass
class CheckoutMoney:
    cafe_price: Decimal        # café's price after any offer: the café's share
    khelo_discount: Decimal    # KHEL-O's ₹1 price drop
    session_price: Decimal     # what the customer pays for the session
    fee_before_offer: Decimal  # the booking fee had it not been waived
    booking_fee: Decimal       # the booking fee actually charged
    total: Decimal             # what the customer pays in all
    first_booking_offer: bool

    @property
    def fee_saved(self) -> Decimal:
        return self.fee_before_offer - self.booking_fee


def checkout_money(cafe_price: Decimal, fee_percent: Decimal, first_booking_offer: bool) -> CheckoutMoney:
    drop = price_drop(cafe_price)
    session = cafe_price - drop
    fee = (session * fee_percent / Decimal('100')).quantize(Decimal('0.01'))
    charged_fee = Decimal('0.00') if first_booking_offer else fee
    return CheckoutMoney(
        cafe_price=cafe_price,
        khelo_discount=drop,
        session_price=session,
        fee_before_offer=fee,
        booking_fee=charged_fee,
        total=session + charged_fee,
        first_booking_offer=first_booking_offer,
    )


async def first_booking_offer_open(db: AsyncSession, now: Optional[datetime] = None) -> bool:
    """The launch offer is still running: before the end date, under the cap."""
    from app.models.booking import Booking

    now = now or datetime.now(IST)
    if now > FIRST_BOOKING_OFFER_ENDS:
        return False
    used = (await db.execute(
        select(func.count(Booking.id)).where(
            Booking.first_booking_offer.is_(True),
            Booking.status.in_(_paid_statuses()),
        )
    )).scalar() or 0
    return used < FIRST_BOOKING_OFFER_CAP


async def has_paid_booking(db: AsyncSession, gamer_id: UUID) -> bool:
    from app.models.booking import Booking

    found = (await db.execute(
        select(Booking.id).where(Booking.gamer_id == gamer_id, Booking.status.in_(_paid_statuses())).limit(1)
    )).first()
    return found is not None


async def first_booking_offer_for(db: AsyncSession, gamer_id: Optional[UUID], now: Optional[datetime] = None) -> bool:
    """Does this customer's booking get the fee waived? Someone not signed in
    yet is treated as new (checkout re-checks once they sign in, and
    create_booking always decides with the real account)."""
    if not await first_booking_offer_open(db, now):
        return False
    if gamer_id is None:
        return True
    return not await has_paid_booking(db, gamer_id)
