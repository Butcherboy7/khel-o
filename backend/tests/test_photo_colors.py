"""Main colour of café photos, painted behind each photo while it loads."""
import io
import uuid
from datetime import time

import pytest
from PIL import Image

from app.core.security import get_password_hash
from app.models.cafe import Cafe, VerificationStatus
from app.models.photo_color import PhotoColor
from app.models.user import User, UserRole
from app.services import photo_colors
from app.services.photo_colors import attach_colors, dominant_color

BUCKET = "https://khelo-cafe-photos-prod.s3.ap-south-1.amazonaws.com/cafes/"


def _jpeg(main, other, main_share=0.7) -> bytes:
    img = Image.new("RGB", (200, 100), other)
    img.paste(Image.new("RGB", (int(200 * main_share), 100), main), (0, 0))
    out = io.BytesIO()
    img.save(out, "JPEG", quality=90)
    return out.getvalue()


def _close(hex_color, rgb, tol=24):
    got = tuple(int(hex_color[i:i + 2], 16) for i in (1, 3, 5))
    return all(abs(a - b) <= tol for a, b in zip(got, rgb))


def test_dominant_color_is_the_colour_covering_most_of_the_photo():
    # Mostly deep purple with a bright yellow strip: the placeholder should be
    # purple, not the muddy average of the two.
    color = dominant_color(_jpeg((60, 20, 110), (250, 220, 40)))
    assert color.startswith("#") and len(color) == 7
    assert _close(color, (60, 20, 110))


@pytest.mark.asyncio
async def test_attach_colors_adds_known_and_reports_missing(db_session):
    known, unknown, foreign = BUCKET + f"{uuid.uuid4().hex}.jpg", BUCKET + f"{uuid.uuid4().hex}.jpg", "https://evil.example/x.jpg"
    db_session.add(PhotoColor(url=known, color="#112233"))
    await db_session.commit()

    photos = [{"url": known, "category": "interior"}, {"url": unknown, "category": "setup"}, {"url": foreign, "category": "x"}]
    missing = await attach_colors(db_session, [photos, None, []])

    assert photos[0]["color"] == "#112233"
    assert "color" not in photos[1]
    # Only our own buckets are ever downloaded.
    assert missing == [unknown]


@pytest.mark.asyncio
async def test_fill_colors_stores_and_skips_unreadable(db_session, monkeypatch):
    good, broken = BUCKET + f"{uuid.uuid4().hex}.jpg", BUCKET + f"{uuid.uuid4().hex}.jpg"
    bodies = {good: _jpeg((200, 30, 30), (10, 10, 10)), broken: b"not an image"}

    async def fake_download(client, url):
        return bodies.get(url)

    monkeypatch.setattr(photo_colors, "_download", fake_download)
    stored = await photo_colors.fill_colors(db_session, [good, broken, good])
    assert stored == 1
    row = await db_session.get(PhotoColor, good)
    assert row is not None and _close(row.color, (200, 30, 30))
    assert await db_session.get(PhotoColor, broken) is None


async def _cafe(db, photos):
    owner = User(id=uuid.uuid4(), email=f"o_{uuid.uuid4().hex[:8]}@t.com", password_hash=get_password_hash("x12345678"),
                 full_name="O", role=UserRole.CAFE_OWNER, is_active=True)
    db.add(owner)
    await db.flush()
    cafe = Cafe(id=uuid.uuid4(), owner_id=owner.id, name=f"Colour Cafe {uuid.uuid4().hex[:6]}", address_line1="1",
                city="Hyderabad", state="Telangana", pincode="500001", phone_number=f"+9190{uuid.uuid4().hex[:8]}",
                verification_status=VerificationStatus.VERIFIED, is_active=True,
                opening_time=time(0, 0), closing_time=time(23, 59, 59), photos=photos)
    db.add(cafe)
    await db.commit()
    return cafe


@pytest.mark.asyncio
async def test_cafe_page_and_list_carry_photo_colours(async_client, db_session, monkeypatch):
    known, unknown = BUCKET + f"{uuid.uuid4().hex}.jpg", BUCKET + f"{uuid.uuid4().hex}.jpg"
    db_session.add(PhotoColor(url=known, color="#abcdef"))
    cafe = await _cafe(db_session, [{"url": known, "category": "interior"}, {"url": unknown, "category": "setup"}])

    queued = []

    async def fake_fill(urls):
        queued.append(list(urls))

    monkeypatch.setattr(photo_colors, "fill_in_background", fake_fill)

    r = await async_client.get(f"/api/v1/cafes/{cafe.id}")
    assert r.status_code == 200
    photos = r.json()["data"]["cafe"]["photos"]
    assert photos[0]["color"] == "#abcdef" and "color" not in photos[1]
    assert queued == [[unknown]]  # the missing one is worked out after the response

    r = await async_client.get("/api/v1/cafes", params={"city": "Hyderabad", "limit": 50})
    assert r.status_code == 200
    item = next(i for i in r.json()["data"]["items"] if i["id"] == str(cafe.id))
    assert item["photos"][0]["color"] == "#abcdef"
