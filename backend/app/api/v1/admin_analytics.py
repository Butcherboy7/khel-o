from datetime import date
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.admin_analytics_service import AdminAnalyticsService
from app.api.deps import require_admin
from app.models.user import User

router = APIRouter()


@router.get("/executive", status_code=status.HTTP_200_OK)
async def get_executive_dashboard(
    periodDays: int = Query(30, ge=1, le=365),
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    service = AdminAnalyticsService(db)
    result = await service.get_executive_dashboard(period_days=periodDays)
    return {"success": True, "data": result}


@router.get("/cafes", status_code=status.HTTP_200_OK)
async def get_cafe_performance(
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    service = AdminAnalyticsService(db)
    result = await service.get_cafe_performance()
    return {"success": True, "data": result}


@router.get("/setups", status_code=status.HTTP_200_OK)
async def get_setup_performance(
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    service = AdminAnalyticsService(db)
    result = await service.get_setup_performance()
    return {"success": True, "data": result}


@router.get("/geography", status_code=status.HTTP_200_OK)
async def get_geography(
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    service = AdminAnalyticsService(db)
    result = await service.get_geography()
    return {"success": True, "data": result}


@router.get("/revenue", status_code=status.HTTP_200_OK)
async def get_revenue_breakdown(
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    service = AdminAnalyticsService(db)
    result = await service.get_revenue_breakdown()
    return {"success": True, "data": result}


@router.get("/marketplace-health", status_code=status.HTTP_200_OK)
async def get_marketplace_health(
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    service = AdminAnalyticsService(db)
    result = await service.get_marketplace_health()
    return {"success": True, "data": result}


@router.get("/attribution", status_code=status.HTTP_200_OK)
async def get_marketing_attribution(
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    service = AdminAnalyticsService(db)
    result = await service.get_marketing_attribution()
    return {"success": True, "data": result}


@router.get("/campaigns", status_code=status.HTTP_200_OK)
async def get_campaigns(
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    service = AdminAnalyticsService(db)
    result = await service.get_campaigns()
    return {"success": True, "data": result}


@router.get("/campaigns/{campaign_id}", status_code=status.HTTP_200_OK)
async def get_campaign_stats(
    campaign_id: str,
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    service = AdminAnalyticsService(db)
    result = await service.get_campaign_stats(campaign_id)
    return {"success": True, "data": result}


@router.get("/funnels", status_code=status.HTTP_200_OK)
async def get_funnel(
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    service = AdminAnalyticsService(db)
    result = await service.get_funnel()
    return {"success": True, "data": result}


@router.get("/traffic", status_code=status.HTTP_200_OK)
async def get_traffic(
    granularity: str = Query("day", pattern="^(day|week|month)$"),
    periods: int = Query(30, ge=1, le=366),
    end: date | None = Query(None),
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    service = AdminAnalyticsService(db)
    result = await service.get_traffic(granularity=granularity, periods=periods, end=end)
    return {"success": True, "data": result}


@router.get("/shares", status_code=status.HTTP_200_OK)
async def get_share_report(
    start: date | None = Query(None),
    end: date | None = Query(None),
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    from app.services.admin_analytics_service import IST
    from datetime import datetime, timedelta

    end = end or datetime.now(IST).date()
    start = start or end - timedelta(days=29)
    service = AdminAnalyticsService(db)
    result = await service.get_share_report(start=start, end=end)
    return {"success": True, "data": result}


@router.get("/ad-campaigns", status_code=status.HTTP_200_OK)
async def list_ad_campaigns(
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    from app.services import growth_report_service

    return {"success": True, "data": {"campaigns": await growth_report_service.campaign_options(db)}}


@router.get("/ad-campaigns/report", status_code=status.HTTP_200_OK)
async def get_ad_campaign_report(
    source: str = Query(..., min_length=1, max_length=100),
    campaign: str | None = Query(None, max_length=100),
    start: date = Query(..., alias="from"),
    end: date = Query(..., alias="to"),
    include_internal: bool = Query(False, alias="includeInternal"),
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    from app.core.exceptions import BadRequestException
    from app.services import growth_report_service

    if end < start or (end - start).days > 92:
        raise BadRequestException(message="Pick a range of up to 3 months", error_code="INVALID_RANGE")
    from sqlalchemy import select as _select
    from app.models.marketing_campaign import MarketingCampaign
    from app.api.v1.marketing_campaigns import tag_pairs

    from datetime import datetime as _dt
    from app.services.campaign_advisor import advise

    also, mc = [], None
    if campaign:
        mc = (await db.execute(
            _select(MarketingCampaign).where(MarketingCampaign.slug == campaign, MarketingCampaign.utm_source == source)
        )).scalar_one_or_none()
        if mc:
            also = tag_pairs(mc)
    data = await growth_report_service.campaign_report(db, source, campaign or None, start, end, include_internal, also=also)
    # Spend covers the whole campaign, so cost per visitor is only fair when
    # these dates start on (or before) the campaign's first day.
    data["advice"] = advise(
        data,
        spend=mc.spend_inr if mc and mc.spend_inr and start <= mc.started_on else None,
        paid=bool(mc and mc.paid),
        live=bool(mc is None or mc.status == "live"),
        today=_dt.now(growth_report_service.IST).date(),
    )
    return {"success": True, "data": data}


@router.get("/areas", status_code=status.HTTP_200_OK)
async def get_area_report(
    city: str = Query("Hyderabad", min_length=2, max_length=100),
    days: int = Query(90, ge=7, le=365),
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    from app.services import growth_report_service

    return {"success": True, "data": await growth_report_service.area_report(db, city, days)}
