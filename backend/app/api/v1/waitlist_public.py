"""Public, unauthenticated waitlist pages: the unsubscribe link in waitlist
emails, and the owner demand page's numbers (counts only, no personal data)."""
import html
from uuid import UUID

from urllib.parse import parse_qs

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import HTMLResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundException
from app.database import get_db
from app.models.cafe import Cafe
from app.services import waitlist_mailer

router = APIRouter()


def _page(title: str, body: str) -> HTMLResponse:
    return HTMLResponse(f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>{title} · KHEL-O</title></head>
<body style="margin:0;background:#F1EFEA;font-family:Arial,sans-serif;color:#111318">
<div style="max-width:420px;margin:64px auto;padding:32px;background:#fff;border:1px solid #E8E6E2;border-radius:16px">
<div style="font-weight:800;font-size:20px;margin-bottom:20px">KHEL<span style="color:#E54D42">-O</span></div>
{body}</div></body></html>""")


@router.get("/unsubscribe", response_class=HTMLResponse)
async def unsubscribe_confirm(e: UUID = Query(...), t: str = Query(..., max_length=64)):
    # A GET only shows the button: mail scanners open links, and must not
    # unsubscribe anyone by doing so.
    return _page("Unsubscribe", f"""
<h1 style="font-size:20px;margin:0 0 8px">Stop "Notify me" emails?</h1>
<p style="color:#5A5E6B;line-height:1.5">You won't get any more café launch emails from KHEL-O.</p>
<form method="post"><input type="hidden" name="e" value="{html.escape(str(e))}"><input type="hidden" name="t" value="{html.escape(t)}">
<button style="margin-top:12px;background:#E54D42;color:#fff;border:0;border-radius:10px;padding:12px 20px;font-weight:700;font-size:15px">Unsubscribe</button></form>""")


@router.post("/unsubscribe", response_class=HTMLResponse)
async def unsubscribe_do(request: Request, db: AsyncSession = Depends(get_db)):
    # Parsed by hand: a plain urlencoded form, and python-multipart (which
    # FastAPI's Form() needs) isn't a dependency of this service.
    fields = parse_qs((await request.body()).decode("utf-8", "ignore"))
    try:
        e = UUID(fields.get("e", [""])[0])
    except ValueError:
        e = None
    t = fields.get("t", [""])[0][:64]
    ok = e is not None and await waitlist_mailer.unsubscribe(db, e, t)
    if not ok:
        page = _page("Link expired", '<p style="color:#5A5E6B">This unsubscribe link isn\'t valid. Reply to any KHEL-O email and we\'ll remove you.</p>')
        page.status_code = 400
        return page
    return _page("Unsubscribed", '<h1 style="font-size:20px;margin:0 0 8px">You\'re unsubscribed</h1><p style="color:#5A5E6B">No more "Notify me" emails from KHEL-O.</p>')


@router.get("/demand/{slug}")
async def cafe_demand(slug: str, db: AsyncSession = Depends(get_db)):
    cafe = (await db.execute(select(Cafe).where(Cafe.slug == slug))).scalar_one_or_none()
    if cafe is None:
        raise NotFoundException(message="Café not found", error_code="CAFE_NOT_FOUND")
    return {"success": True, "data": await waitlist_mailer.demand_stats(db, cafe)}
