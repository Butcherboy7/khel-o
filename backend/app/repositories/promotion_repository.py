from typing import List, Optional, Any
from uuid import UUID
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, or_, and_
from app.models.promotion import Promotion, OfferCampaign
from app.repositories.base import BaseRepository

class PromotionRepository(BaseRepository[Promotion]):
    def __init__(self, db: AsyncSession):
        super().__init__(Promotion, db)

    async def get_by_id(self, promotion_id: UUID) -> Optional[Promotion]:
        result = await self.db.execute(select(Promotion).where(Promotion.id == promotion_id))
        return result.scalars().first()

    async def get_by_id_with_lock(self, promotion_id: UUID) -> Optional[Promotion]:
        """Row-locked fetch so a concurrent apply of the same promo can't read
        current_uses before this transaction's increment commits — mirrors the
        with_for_update() pattern booking_repository already uses for seat
        capacity. Without this, N concurrent bookings near max_uses can all
        pass the current_uses < max_uses check before any of them increments,
        letting a "first 10 customers" promo go to more than 10 people."""
        result = await self.db.execute(
            select(Promotion).where(Promotion.id == promotion_id).with_for_update()
        )
        return result.scalars().first()

    async def get_by_code(self, khelo_code: str) -> Optional[Promotion]:
        """Codes are globally unique (see migration 025), so no cafe filter
        is needed to disambiguate — the caller still checks the resolved
        promotion's cafe_id matches the venue the booking is for."""
        result = await self.db.execute(
            select(Promotion).where(Promotion.khelo_code == khelo_code)
        )
        return result.scalars().first()

    async def get_by_cafe_id(self, cafe_id: UUID) -> List[Promotion]:
        result = await self.db.execute(
            select(Promotion).where(Promotion.cafe_id == cafe_id).order_by(Promotion.created_at.desc())
        )
        return list(result.scalars().all())

    @staticmethod
    def _listable(now: datetime):
        """Offers shown on public surfaces: ordinary offers, plus those of a
        public campaign that is switched on and inside its dates. Link-only
        campaign offers stay hidden."""
        public_campaigns = select(OfferCampaign.id).where(
            OfferCampaign.is_public == True,
            OfferCampaign.is_active == True,
            OfferCampaign.starts_at <= now,
            OfferCampaign.ends_at >= now,
        )
        return or_(Promotion.campaign_id.is_(None), Promotion.campaign_id.in_(public_campaigns))

    async def get_active_for_cafe(self, cafe_id: UUID, now: datetime) -> List[Promotion]:
        stmt = select(Promotion).where(
            Promotion.cafe_id == cafe_id,
            Promotion.is_active == True,
            self._listable(now),
            Promotion.valid_from <= now,
            Promotion.valid_until >= now
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_active_for_cafes(self, cafe_ids: List[UUID], now: datetime) -> List[Promotion]:
        """One query for the explore list: every switched-on, in-date offer of
        the given cafés."""
        if not cafe_ids:
            return []
        stmt = select(Promotion).where(
            Promotion.cafe_id.in_(cafe_ids),
            Promotion.is_active == True,
            self._listable(now),
            Promotion.valid_from <= now,
            Promotion.valid_until >= now
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_active_for_tier(self, tier_id: UUID, cafe_id: UUID, now: datetime) -> List[Promotion]:
        stmt = select(Promotion).where(
            Promotion.cafe_id == cafe_id,
            Promotion.is_active == True,
            self._listable(now),
            Promotion.valid_from <= now,
            Promotion.valid_until >= now,
            or_(
                Promotion.applicable_tier_id == tier_id,
                Promotion.applicable_tier_id.is_(None)
            )
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def create(self, promo_data: dict[str, Any] | Promotion) -> Promotion:
        if isinstance(promo_data, Promotion):
            promo_obj = promo_data
        else:
            promo_obj = Promotion(**promo_data)
        self.db.add(promo_obj)
        await self.db.commit()
        await self.db.refresh(promo_obj)
        return promo_obj

    async def update(self, promotion_id: UUID, update_data: dict[str, Any]) -> Optional[Promotion]:
        promo = await self.get_by_id(promotion_id)
        if not promo:
            return None
        # update_data always comes from Pydantic's model_dump(exclude_unset=True)
        # — a key's mere presence here means the caller explicitly sent it,
        # including an explicit None meaning "clear this field". Filtering on
        # `value is not None` used to silently drop that clearing intent.
        for field, value in update_data.items():
            if hasattr(promo, field):
                setattr(promo, field, value)
        await self.db.commit()
        await self.db.refresh(promo)
        return promo

    async def recount_uses(self, promotion_id: UUID) -> int:
        """current_uses = bookings with this offer that were actually paid
        for. Recomputed (not +1/-1) so it is idempotent: payment callbacks,
        webhooks, cancellations and refunds can all call it any number of
        times and it stays right."""
        from sqlalchemy import func, select
        from app.models.booking import Booking, REDEEMED_STATUSES

        count = (await self.db.execute(
            select(func.count(Booking.id)).where(
                Booking.promotion_id == promotion_id, Booking.status.in_(REDEEMED_STATUSES)
            )
        )).scalar() or 0
        await self.db.execute(update(Promotion).where(Promotion.id == promotion_id).values(current_uses=count))
        return count

    async def pending_holds(self, promotion_id: UUID) -> int:
        """Unpaid bookings still inside their 15-minute payment window. They
        hold an offer slot (so the last slot can't be sold twice) without
        counting as redeemed."""
        from datetime import datetime, timedelta, timezone
        from sqlalchemy import func, select
        from app.models.booking import Booking, BookingStatus

        cutoff = datetime.now(timezone.utc) - timedelta(minutes=15)
        return (await self.db.execute(
            select(func.count(Booking.id)).where(
                Booking.promotion_id == promotion_id,
                Booking.status == BookingStatus.PENDING_PAYMENT,
                Booking.created_at >= cutoff,
            )
        )).scalar() or 0

    # ---- link-only campaigns ----

    async def get_campaign_by_code(self, code: str) -> Optional[OfferCampaign]:
        stmt = select(OfferCampaign).where(OfferCampaign.access_code == code.strip().upper())
        return (await self.db.execute(stmt)).scalars().first()

    async def get_campaign_cafes(self, campaign_id: UUID) -> List[Any]:
        """Cafés that have at least one offer in this campaign."""
        from app.models.cafe import Cafe
        stmt = select(Cafe).where(Cafe.id.in_(select(Promotion.cafe_id).where(Promotion.campaign_id == campaign_id)))
        return list((await self.db.execute(stmt)).scalars().all())

    async def get_campaign_promotions(self, campaign_id: UUID, now: datetime) -> List[Promotion]:
        stmt = select(Promotion).where(
            Promotion.campaign_id == campaign_id,
            Promotion.is_active == True,
            Promotion.valid_from <= now,
            Promotion.valid_until >= now,
        )
        return list((await self.db.execute(stmt)).scalars().all())

    async def get_campaign_with_lock(self, campaign_id: UUID) -> Optional[OfferCampaign]:
        stmt = select(OfferCampaign).where(OfferCampaign.id == campaign_id).with_for_update()
        return (await self.db.execute(stmt)).scalars().first()

    async def campaign_claimed(self, campaign_id: UUID) -> int:
        """People who really booked under the campaign: paid bookings across
        all of its promotions. This is the only number ever shown as claimed."""
        from sqlalchemy import func
        from app.models.booking import Booking, REDEEMED_STATUSES

        return (await self.db.execute(
            select(func.count(Booking.id)).where(
                Booking.promotion_id.in_(select(Promotion.id).where(Promotion.campaign_id == campaign_id)),
                Booking.status.in_(REDEEMED_STATUSES),
            )
        )).scalar() or 0

    async def campaign_holds(self, campaign_id: UUID) -> int:
        """Unpaid bookings still inside their 15-minute payment window."""
        from datetime import timedelta, timezone
        from sqlalchemy import func
        from app.models.booking import Booking, BookingStatus

        cutoff = datetime.now(timezone.utc) - timedelta(minutes=15)
        return (await self.db.execute(
            select(func.count(Booking.id)).where(
                Booking.promotion_id.in_(select(Promotion.id).where(Promotion.campaign_id == campaign_id)),
                Booking.status == BookingStatus.PENDING_PAYMENT,
                Booking.created_at >= cutoff,
            )
        )).scalar() or 0

    async def grant_badge(self, user_id: UUID, badge_key: str, campaign_id: Optional[UUID]):
        """(badge, created). Safe to call twice, even concurrently."""
        from sqlalchemy.exc import IntegrityError
        from app.models.user_badge import UserBadge

        async def _existing():
            return (await self.db.execute(
                select(UserBadge).where(UserBadge.user_id == user_id, UserBadge.badge_key == badge_key)
            )).scalars().first()

        found = await _existing()
        if found:
            return found, False
        badge = UserBadge(user_id=user_id, badge_key=badge_key, campaign_id=campaign_id)
        self.db.add(badge)
        try:
            await self.db.commit()
        except IntegrityError:
            await self.db.rollback()
            return await _existing(), False
        await self.db.refresh(badge)
        return badge, True

    async def get_badges(self, user_id: UUID) -> list:
        from app.models.user_badge import UserBadge
        return list((await self.db.execute(select(UserBadge).where(UserBadge.user_id == user_id))).scalars().all())

    async def share_stats(self, user_id: UUID) -> dict:
        """How many times this person shared a campaign link and how many
        different people opened those links. Read from the existing share
        analytics events (share_created / share_opened keyed by `sid`)."""
        from sqlalchemy import func
        from app.models.analytics_event import AnalyticsEvent

        created = (await self.db.execute(
            select(AnalyticsEvent.event_metadata).where(
                AnalyticsEvent.user_id == user_id, AnalyticsEvent.event_type == "share_created"
            ).limit(500)
        )).scalars().all()
        sids = [m.get("sid") for m in created if isinstance(m, dict) and m.get("context") == "campaign" and m.get("sid")]
        if not sids:
            return {"shared": 0, "opened": 0}
        opened = (await self.db.execute(
            select(func.count(func.distinct(AnalyticsEvent.session_id))).where(
                AnalyticsEvent.event_type == "share_opened",
                AnalyticsEvent.event_metadata["sid"].as_string().in_(sids),
            )
        )).scalar() or 0
        return {"shared": len(sids), "opened": int(opened)}

    async def increment_uses(self, promotion_id: UUID) -> None:
        stmt = update(Promotion).where(Promotion.id == promotion_id).values(
            current_uses=Promotion.current_uses + 1
        )
        await self.db.execute(stmt)
        await self.db.commit()

    async def deactivate(self, promotion_id: UUID) -> Optional[Promotion]:
        promo = await self.get_by_id(promotion_id)
        if not promo:
            return None
        promo.is_active = False
        await self.db.commit()
        await self.db.refresh(promo)
        return promo

    async def delete(self, promotion_id: UUID) -> None:
        """Hard delete — only ever called on a promotion with current_uses==0
        (see PromotionService.delete_promotion), so this never touches a
        Booking that references it via Booking.promotion_id."""
        promo = await self.get_by_id(promotion_id)
        if not promo:
            return
        await self.db.delete(promo)
        await self.db.commit()
