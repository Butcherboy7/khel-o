from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.seo_service import SeoService

router = APIRouter()


def _camel(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            (k.split("_")[0] + "".join(p.title() for p in k.split("_")[1:])): _camel(v)
            for k, v in value.items()
        }
    if isinstance(value, list):
        return [_camel(v) for v in value]
    return value


@router.get("/pages", status_code=status.HTTP_200_OK)
async def list_seo_pages(db: AsyncSession = Depends(get_db)):
    """Every indexable landing page — feeds the XML and HTML sitemaps."""
    return {"success": True, "data": _camel(await SeoService(db).list_indexable_pages())}


@router.get("/page", status_code=status.HTTP_200_OK)
async def get_seo_page(
    city: str = Query(..., min_length=1, max_length=100),
    facet: Optional[str] = Query(None, max_length=100),
    db: AsyncSession = Depends(get_db),
):
    from app.core.exceptions import NotFoundException

    page = await SeoService(db).get_page(city.lower(), facet.lower() if facet else None)
    if page is None:
        raise NotFoundException(message="Page not found", error_code="SEO_PAGE_NOT_FOUND")
    return {"success": True, "data": _camel(page)}


@router.get("/cafe-links/{cafe_id}", status_code=status.HTTP_200_OK)
async def get_cafe_links(cafe_id: UUID, db: AsyncSession = Depends(get_db)):
    """Internal links for a café page: its city, indexable facet pages, nearby cafés."""
    from app.core.exceptions import NotFoundException

    links = await SeoService(db).get_cafe_links(cafe_id)
    if links is None:
        raise NotFoundException(message="Café not found", error_code="CAFE_NOT_FOUND")
    return {"success": True, "data": _camel(links)}
