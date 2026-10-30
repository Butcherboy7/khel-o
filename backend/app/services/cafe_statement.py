"""Weekly café statement: every paid booking for one café in a Monday-Sunday week
(by session date, India time), in a table a café owner or an accountant can follow.

Money, per booking (all from what was recorded when it was booked):
  Booking value        base_amount            what the session cost at the café's price
  Offers & discounts   discount_amount        any offer used; the challenge thank-you is split out
  Café earnings        owner_settlement_amount = value - discounts (what the café is owed)
KHEL-O keeps its booking fee (charged to the player on top) and pays the ₹1 price
drop itself, so neither changes the café's earnings. A discount on a KHEL-O-funded
reward is the one thing added back: the café's earnings already have it taken off,
KHEL-O pays it, so it is shown and totalled separately as "added back".

Read-only: nothing here records a payment or changes a payout.
"""
from __future__ import annotations

import io
import zipfile
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import IST, now_ist
from app.models.booking import REDEEMED_STATUSES, Booking
from app.models.cafe_payout import CafePayout
from app.models.cafe_payout_item import CafePayoutItem
from app.models.cafe import Cafe, VerificationStatus
from app.models.hardware_tier import HardwareTier
from app.models.platform_fee import PlatformFee
from app.models.promotion import OfferCampaign, Promotion
from app.models.user import User

LEGAL_NAME = "Khelo"
TAGLINE = "KHEL-O · Book gaming sessions at cafés near you"
WEBSITE = "khel-o.com"
SUPPORT_EMAIL = "support@khel-o.com"


def week_monday(d: date) -> date:
    return d - timedelta(days=d.weekday())


def last_full_week(today: Optional[date] = None) -> date:
    """Monday of the most recent finished Monday-Sunday week."""
    today = today or now_ist().date()
    return week_monday(today) - timedelta(days=7)


def money(x) -> Decimal:
    return Decimal(str(x or 0)).quantize(Decimal("0.01"))


@dataclass
class Line:
    date: date
    time: str
    reference: str
    player: str
    setup: str
    hours: float
    value: Decimal
    offer_discount: Decimal          # any offer other than the challenge thank-you
    challenge_discount: Decimal      # the café-funded challenge discount
    earnings: Decimal
    khelo_added_back: Decimal        # the discount KHEL-O funds, owed back to the café
    offer: str = ""
    # Whether KHEL-O has paid this booking's earnings to the café: "paid" (with the UTR and date),
    # "processing", or "pending" (not in a payout yet, or the payout isn't paid).
    payment: str = "pending"
    paid_on: Optional[date] = None
    utr: str = ""


@dataclass
class Statement:
    cafe_id: str
    cafe_name: str
    cafe_address: str
    week_start: date
    week_end: date
    number: str
    generated_on: date
    lines: list[Line] = field(default_factory=list)

    @property
    def value(self) -> Decimal:
        return sum((l.value for l in self.lines), Decimal("0.00"))

    @property
    def offer_discounts(self) -> Decimal:
        return sum((l.offer_discount for l in self.lines), Decimal("0.00"))

    @property
    def challenge_discounts(self) -> Decimal:
        return sum((l.challenge_discount for l in self.lines), Decimal("0.00"))

    @property
    def earnings(self) -> Decimal:
        return sum((l.earnings for l in self.lines), Decimal("0.00"))

    @property
    def added_back(self) -> Decimal:
        return sum((l.khelo_added_back for l in self.lines), Decimal("0.00"))

    @property
    def total_due(self) -> Decimal:
        return self.earnings + self.added_back

    @property
    def paid_out(self) -> Decimal:
        """Earnings KHEL-O has already paid the café: bookings whose payout is marked paid."""
        return sum((l.earnings for l in self.lines if l.payment == "paid"), Decimal("0.00"))

    @property
    def balance(self) -> Decimal:
        """Still to be paid: everything due less what is already paid out. The add-back is
        settled by hand and is not recorded as paid anywhere, so it always stays in here."""
        return self.total_due - self.paid_out


def financial_year(d: date) -> str:
    start = d.year if d.month >= 4 else d.year - 1
    return f"{start}-{str(start + 1)[-2:]}"


def statement_number(cafe: Cafe, week_start: date) -> str:
    code = "".join(ch for ch in (cafe.slug or cafe.name).upper() if ch.isalnum())[:12] or "CAFE"
    return f"KHELO/{code}/{financial_year(week_start)}/WK{week_start.isocalendar()[1]:02d}"


def _address(cafe: Cafe) -> str:
    return ", ".join(x for x in (cafe.address_line1, cafe.address_line2, cafe.city) if x)


async def build(db: AsyncSession, cafe: Cafe, week_start: date) -> Statement:
    week_start = week_monday(week_start)
    week_end = week_start + timedelta(days=6)
    rows = (await db.execute(
        select(Booking, User, HardwareTier, PlatformFee, Promotion, OfferCampaign, CafePayout)
        .join(User, User.id == Booking.gamer_id)
        .join(HardwareTier, HardwareTier.id == Booking.hardware_tier_id)
        .outerjoin(PlatformFee, PlatformFee.booking_id == Booking.id)
        .outerjoin(Promotion, Promotion.id == Booking.promotion_id)
        .outerjoin(OfferCampaign, OfferCampaign.id == Promotion.campaign_id)
        .outerjoin(CafePayoutItem, CafePayoutItem.platform_fee_id == PlatformFee.id)
        .outerjoin(CafePayout, CafePayout.id == CafePayoutItem.payout_id)
        .where(
            Booking.cafe_id == cafe.id, Booking.status.in_(REDEEMED_STATUSES),
            Booking.session_date >= week_start, Booking.session_date <= week_end,
        )
        .order_by(Booking.session_date, Booking.start_time, Booking.created_at)
    )).all()
    st = Statement(
        cafe_id=str(cafe.id), cafe_name=cafe.name, cafe_address=_address(cafe), week_start=week_start,
        week_end=week_end, number=statement_number(cafe, week_start), generated_on=now_ist().date(),
    )
    for b, user, tier, fee, promo, camp, payout in rows:
        discount = money(b.discount_amount)
        challenge_reward = camp is not None and camp.challenge_id is not None
        funded = bool(challenge_reward and camp.khelo_funded)
        cafe_funded_challenge = bool(challenge_reward and not camp.khelo_funded)
        earnings = money(fee.owner_settlement_amount) if fee is not None else money(b.base_amount) - discount
        st.lines.append(Line(
            date=b.session_date, time=b.start_time.strftime("%I:%M %p").lstrip("0"), reference=b.booking_reference,
            player=(user.full_name or "Player").strip(), setup=tier.name, hours=float(b.duration_hours),
            value=money(b.base_amount),
            offer_discount=discount if not cafe_funded_challenge else Decimal("0.00"),
            challenge_discount=discount if cafe_funded_challenge else Decimal("0.00"),
            earnings=earnings, khelo_added_back=discount if funded else Decimal("0.00"),
            offer=(promo.title if promo is not None else ""),
            payment=(payout.status.value if payout is not None and payout.status is not None else "pending"),
            paid_on=(payout.paid_at.astimezone(IST).date() if payout is not None and payout.paid_at is not None else None),
            utr=((payout.utr_reference or "") if payout is not None else ""),
        ))
    return st


async def live_cafes(db: AsyncSession) -> list[Cafe]:
    """Every café that is live on KHEL-O: verified, active, a real partner (not a
    lead listing, not our own demo café)."""
    return list((await db.execute(
        select(Cafe).join(User, User.id == Cafe.owner_id).where(
            Cafe.is_active.is_(True), Cafe.verification_status == VerificationStatus.VERIFIED,
            Cafe.is_lead_listing.is_(False), ~User.email.ilike("%@example.com"),
        ).order_by(Cafe.name)
    )).scalars().all())


def as_json(st: Statement) -> dict:
    f = lambda x: float(x)  # noqa: E731
    return {
        "cafeId": st.cafe_id, "cafe": st.cafe_name, "number": st.number,
        "weekStart": st.week_start.isoformat(), "weekEnd": st.week_end.isoformat(),
        "totals": {
            "bookings": len(st.lines), "value": f(st.value), "offerDiscounts": f(st.offer_discounts),
            "challengeDiscounts": f(st.challenge_discounts), "earnings": f(st.earnings),
            "addedBack": f(st.added_back), "totalDue": f(st.total_due),
            "paidOut": f(st.paid_out), "balance": f(st.balance),
        },
        "lines": [{
            "date": l.date.isoformat(), "time": l.time, "reference": l.reference, "player": l.player,
            "setup": l.setup, "hours": l.hours, "value": f(l.value), "offerDiscount": f(l.offer_discount),
            "challengeDiscount": f(l.challenge_discount), "earnings": f(l.earnings),
            "addedBack": f(l.khelo_added_back), "offer": l.offer,
            "payment": l.payment, "paidOn": l.paid_on.isoformat() if l.paid_on else None, "utr": l.utr,
        } for l in st.lines],
    }


# ── PDF ────────────────────────────────────────────────────────────────────

INK = "#1B1D24"
MUTED = "#5B6070"
RULE = "#D9DCE3"
BAND = "#F3F4F7"
ACCENT = "#C0392B"


def inr(x) -> str:
    n = money(x)
    whole, frac = f"{abs(n):.2f}".split(".")
    head, tail = whole[:-3], whole[-3:]
    if head:
        parts = []
        while len(head) > 2:
            parts.insert(0, head[-2:])
            head = head[:-2]
        if head:
            parts.insert(0, head)
        whole = ",".join(parts) + "," + tail
    return ("-" if n < 0 else "") + "Rs " + whole + "." + frac


_ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
         "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"]
_TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]


def _below_thousand(n: int) -> str:
    out = []
    if n >= 100:
        out.append(_ONES[n // 100] + " Hundred")
        n %= 100
    if n >= 20:
        out.append(_TENS[n // 10] + (" " + _ONES[n % 10] if n % 10 else ""))
    elif n:
        out.append(_ONES[n])
    return " ".join(out)


def in_words(amount) -> str:
    """Indian-style words: 'Rupees One Thousand Two Hundred and Fifty Paise Only'."""
    n = money(amount)
    rupees, paise = int(abs(n)), int((abs(n) - int(abs(n))) * 100)
    if rupees == 0 and paise == 0:
        return "Rupees Zero Only"
    parts = []
    for div, name in ((10_000_000, "Crore"), (100_000, "Lakh"), (1000, "Thousand")):
        if rupees >= div:
            parts.append(_below_thousand(rupees // div) + " " + name)
            rupees %= div
    if rupees:
        parts.append(_below_thousand(rupees))
    text = "Rupees " + " ".join(parts) if parts else "Rupees Zero"
    if paise:
        text += f" and {_below_thousand(paise)} Paise"
    return text + " Only"


def _payment_text(l: Line) -> str:
    if l.payment == "paid":
        return "Paid" + (f" {l.paid_on.strftime('%d %b')}" if l.paid_on else "") + (f"<br/>UTR {l.utr}" if l.utr else "")
    return "Processing" if l.payment == "processing" else "Not yet paid"


def render_pdf(st: Statement) -> bytes:
    """A4 statement: letterhead, summary block, the bookings table, totals in
    figures and words, notes and signature. Plain, printable, no GST or PAN."""
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_RIGHT
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import (
        BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer, Table, TableStyle,
    )

    buf = io.BytesIO()
    page = landscape(A4)
    margin = 14 * mm
    doc = BaseDocTemplate(
        buf, pagesize=page, leftMargin=margin, rightMargin=margin, topMargin=margin, bottomMargin=16 * mm,
        title=f"Statement {st.number}", author=LEGAL_NAME,
    )
    width = page[0] - 2 * margin

    def base(name, **kw):
        d = dict(fontName="Helvetica", fontSize=8.5, leading=11, textColor=colors.HexColor(INK))
        d.update(kw)
        return ParagraphStyle(name, **d)

    small = base("small", fontSize=7.5, leading=10, textColor=colors.HexColor(MUTED))
    body = base("body")
    bold = base("bold", fontName="Helvetica-Bold")
    h1 = base("h1", fontName="Helvetica-Bold", fontSize=15, leading=18)
    right = base("right", alignment=TA_RIGHT)
    right_bold = base("rb", alignment=TA_RIGHT, fontName="Helvetica-Bold")
    cell = base("cell", fontSize=8, leading=10)

    def on_page(canvas, d):
        canvas.saveState()
        # Letterhead band
        canvas.setFillColor(colors.HexColor(ACCENT))
        canvas.rect(0, page[1] - 7 * mm, page[0], 7 * mm, stroke=0, fill=1)
        # Footer
        canvas.setStrokeColor(colors.HexColor(RULE))
        canvas.line(margin, 12 * mm, page[0] - margin, 12 * mm)
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(colors.HexColor(MUTED))
        canvas.drawString(margin, 8 * mm, f"{LEGAL_NAME} · {WEBSITE} · {SUPPORT_EMAIL}")
        canvas.drawCentredString(page[0] / 2, 8 * mm, f"Statement {st.number}")
        canvas.drawRightString(page[0] - margin, 8 * mm, f"Page {d.page}")
        canvas.restoreState()

    doc.addPageTemplates([PageTemplate(id="p", frames=[Frame(margin, 16 * mm, width, page[1] - margin - 16 * mm - 6 * mm, id="f", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)], onPage=on_page)])

    story = []
    period = f"{st.week_start.strftime('%d %b %Y')} to {st.week_end.strftime('%d %b %Y')}"

    head = Table([[
        [Paragraph(f'<font color="{ACCENT}">{LEGAL_NAME.upper()}</font>', base("lh", fontName="Helvetica-Bold", fontSize=22, leading=24)),
         Paragraph(TAGLINE, small)],
        [Paragraph("WEEKLY SETTLEMENT STATEMENT", base("t", fontName="Helvetica-Bold", fontSize=12, leading=15, alignment=TA_RIGHT)),
         Paragraph(f"Statement no. <b>{st.number}</b>", right),
         Paragraph(f"Period: <b>{period}</b>", right),
         Paragraph(f"Issued on: {st.generated_on.strftime('%d %b %Y')}", right)],
    ]], colWidths=[width * 0.5, width * 0.5])
    head.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LINEBELOW", (0, 0), (-1, 0), 0.8, colors.HexColor(INK)),
                              ("BOTTOMPADDING", (0, 0), (-1, -1), 8), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    story += [head, Spacer(1, 8)]

    parties = Table([[
        [Paragraph("STATEMENT FOR", small), Paragraph(f"<b>{st.cafe_name}</b>", base("c", fontSize=11, leading=14)),
         Paragraph(st.cafe_address or "", body)],
        [Paragraph("ISSUED BY", small), Paragraph(f"<b>{LEGAL_NAME}</b>", base("c2", fontSize=11, leading=14)),
         Paragraph("Operating the KHEL-O booking platform.", body)],
    ]], colWidths=[width * 0.5, width * 0.5])
    parties.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(BAND)), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                                 ("LEFTPADDING", (0, 0), (-1, -1), 10), ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8)]))
    story += [parties, Spacer(1, 8)]

    summary_rows = [
        ["Total booking value (at your prices)", inr(st.value)],
        ["Less: offers and discounts you set", "-" + inr(st.offer_discounts)],
    ]
    if st.challenge_discounts:
        summary_rows.append(["Less: 20% challenge thank-you (funded by your café)", "-" + inr(st.challenge_discounts)])
    summary_rows.append(["Your earnings from bookings", inr(st.earnings)])
    if st.added_back:
        summary_rows.append(["Add: discounts KHEL-O funded and adds back to you", inr(st.added_back)])
    summary_rows.append(["TOTAL DUE TO YOUR CAFÉ", inr(st.total_due)])
    summary_rows.append(["Less: already paid to you by KHEL-O", "-" + inr(st.paid_out)])
    summary_rows.append(["BALANCE STILL TO BE PAID", inr(st.balance)])
    strong = {len(summary_rows) - 3, len(summary_rows) - 1}  # total due, balance
    summary = Table([[Paragraph(a, bold if i in strong else body), Paragraph(b, right_bold if i in strong else right)]
                     for i, (a, b) in enumerate(summary_rows)], colWidths=[width * 0.34, width * 0.14], hAlign="LEFT")
    summary.setStyle(TableStyle([
        ("LINEBELOW", (0, 0), (-1, -2), 0.25, colors.HexColor(RULE)),
        *[cmd for i in sorted(strong) for cmd in (
            ("LINEABOVE", (0, i), (-1, i), 0.9, colors.HexColor(INK)), ("BACKGROUND", (0, i), (-1, i), colors.HexColor(BAND)))],
        ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    words = Paragraph(f"<b>Balance in words:</b> {in_words(st.balance)}<br/><b>Total due in words:</b> {in_words(st.total_due)}", body)
    side = Table([[[Paragraph("SUMMARY", small), Spacer(1, 3), summary],
                   [Spacer(1, 12), words, Spacer(1, 26), Paragraph("For <b>Khelo</b>", right), Spacer(1, 22), Paragraph("Authorised signatory", right)]]],
                 colWidths=[width * 0.5, width * 0.5], style=TableStyle([
                     ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    story += [side, Spacer(1, 8)]

    story += [Paragraph("BOOKINGS", small), Spacer(1, 3)]
    show_ch = bool(st.challenge_discounts)
    header = ["Date", "Time", "Booking ref", "Player", "Setup", "Hrs", "Value", "Offer / discount"]
    if show_ch:
        header.append("Challenge 20%")
    header += ["Your earnings", "KHEL-O adds back", "Payment"]
    data = [[Paragraph(f"<b>{h}</b>", cell if i < 5 else base("hr", fontSize=8, leading=10, alignment=TA_RIGHT, fontName="Helvetica-Bold")) for i, h in enumerate(header)]]
    for l in st.lines:
        r = [Paragraph(l.date.strftime("%d %b"), cell), Paragraph(l.time, cell), Paragraph(l.reference, cell),
             Paragraph(l.player, cell), Paragraph(l.setup, cell), Paragraph(f"{l.hours:g}", base("n", fontSize=8, leading=10, alignment=TA_RIGHT)),
             Paragraph(inr(l.value), base("n1", fontSize=8, leading=10, alignment=TA_RIGHT)),
             Paragraph(inr(l.offer_discount) if l.offer_discount else "-", base("n2", fontSize=8, leading=10, alignment=TA_RIGHT))]
        if show_ch:
            r.append(Paragraph(inr(l.challenge_discount) if l.challenge_discount else "-", base("n3", fontSize=8, leading=10, alignment=TA_RIGHT)))
        r += [Paragraph(inr(l.earnings), base("n4", fontSize=8, leading=10, alignment=TA_RIGHT, fontName="Helvetica-Bold")),
              Paragraph(inr(l.khelo_added_back) if l.khelo_added_back else "-", base("n5", fontSize=8, leading=10, alignment=TA_RIGHT)),
              Paragraph(_payment_text(l), base("n6", fontSize=7.5, leading=9, alignment=TA_RIGHT))]
        data.append(r)
    if not st.lines:
        data.append([Paragraph("No paid bookings in this period.", cell)] + [""] * (len(header) - 1))
    tail = ["", "", "", "", "", "", Paragraph(inr(st.value), right_bold), Paragraph(inr(st.offer_discounts), right_bold)]
    if show_ch:
        tail.append(Paragraph(inr(st.challenge_discounts), right_bold))
    tail += [Paragraph(inr(st.earnings), right_bold), Paragraph(inr(st.added_back), right_bold), ""]
    tail[0] = Paragraph("<b>Total</b>", cell)
    data.append(tail)

    fixed = [15, 14, 22, 30, 25, 7, 19, 20] + ([19] if show_ch else []) + [21, 19, 22]
    scale = width / sum(fixed)
    t = Table(data, colWidths=[w * scale for w in fixed], repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(BAND)),
        ("LINEBELOW", (0, 0), (-1, 0), 0.8, colors.HexColor(INK)),
        ("LINEBELOW", (0, 1), (-1, -2), 0.25, colors.HexColor(RULE)),
        ("LINEABOVE", (0, -1), (-1, -1), 0.8, colors.HexColor(INK)),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]))
    story += [t, Spacer(1, 8)]

    notes = [
        "Earnings = booking value minus offers and discounts. KHEL-O's booking fee is paid by the player on top and the Rs 1 price drop by KHEL-O, so neither reduces you.",
        "'Paid' = part of a payout KHEL-O has marked paid (UTR shown). Discounts KHEL-O adds back are settled separately and stay in the balance until then. Not a tax invoice.",
    ]
    story += [Paragraph("NOTES", small), Spacer(1, 2), *[Paragraph(f"{i}. {n}", small) for i, n in enumerate(notes, 1)]]
    doc.build(story)
    return buf.getvalue()


def zip_pdfs(files: list[tuple[str, bytes]]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for name, data in files:
            z.writestr(name, data)
    return buf.getvalue()


def file_name(st: Statement) -> str:
    return st.number.replace("/", "-") + ".pdf"
