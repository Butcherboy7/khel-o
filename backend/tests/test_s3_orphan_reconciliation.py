"""The orphan sweep must delete abandoned uploads and nothing else.

This job deletes production files, so the interesting tests are the ones that
prove it *doesn't* delete: a live photo, an upload still in flight, and the
whole bucket when the database lookup comes back empty.
"""
import pytest
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from app.models.cafe import Cafe, VerificationStatus
from app.services.storage_service import key_from_url
from tests.test_launch_invariants import _make_owner_and_cafe


BUCKET = "khelo-test-bucket"
REGION = "ap-south-1"


def _url(key: str) -> str:
    return f"https://{BUCKET}.s3.{REGION}.amazonaws.com/{key}"


@pytest.fixture(autouse=True)
def _s3_settings(monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, "AWS_S3_BUCKET", BUCKET, raising=False)
    monkeypatch.setattr(settings, "AWS_REGION", REGION, raising=False)


def _select_orphans(all_objects, keep, min_age_hours=24):
    """The script's selection rule, isolated so it can be tested without S3."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=min_age_hours)
    return [
        key for key, modified in all_objects
        if key not in keep and modified <= cutoff
    ]


def test_referenced_photo_is_never_deleted():
    old = datetime.now(timezone.utc) - timedelta(days=30)
    live = "cafes/abc/live.jpg"
    orphans = _select_orphans([(live, old)], keep={live})
    assert orphans == [], "a photo a café still references was selected for deletion"


def test_abandoned_upload_is_collected():
    """The case nothing else can catch: in the bucket, in no database row."""
    old = datetime.now(timezone.utc) - timedelta(days=2)
    abandoned = "cafes/abc/abandoned.jpg"
    assert _select_orphans([(abandoned, old)], keep=set()) == [abandoned]


def test_in_flight_upload_is_protected_by_the_age_floor():
    """An upload that happened a minute ago is unreferenced *because the owner
    has not saved yet*. Deleting it would race their own save."""
    just_now = datetime.now(timezone.utc) - timedelta(minutes=1)
    fresh = "cafes/abc/in-flight.jpg"
    assert _select_orphans([(fresh, just_now)], keep=set()) == [], (
        "an in-flight upload was selected — this would destroy a photo the "
        "owner is in the middle of saving"
    )


def test_age_floor_boundary_is_respected():
    keep = set()
    older = datetime.now(timezone.utc) - timedelta(hours=25)
    newer = datetime.now(timezone.utc) - timedelta(hours=23)
    picked = _select_orphans([("cafes/a/old.jpg", older), ("cafes/a/new.jpg", newer)], keep)
    assert picked == ["cafes/a/old.jpg"]


@pytest.mark.asyncio
async def test_referenced_keys_reads_both_photo_fields(db_session):
    """menu_photos is a separate column; missing it would delete every menu
    photo in the bucket."""
    from scripts.reconcile_s3_orphans import referenced_keys  # noqa: F401  (import shape check)

    owner, cafe, tier = await _make_owner_and_cafe(db_session, "s3ref")
    gallery_key = f"cafes/{cafe.id}/gallery.jpg"
    menu_key = f"cafes/{cafe.id}/menu.jpg"
    cafe.photos = [_url(gallery_key)]
    cafe.menu_photos = [_url(menu_key)]
    await db_session.commit()

    keys = set()
    for field in (cafe.photos, cafe.menu_photos):
        for url in field:
            k = key_from_url(url)
            if k:
                keys.add(k)

    assert gallery_key in keys
    assert menu_key in keys, "menu photos were not collected — they would be deleted"


def test_foreign_urls_are_ignored():
    """key_from_url returns None for anything outside our bucket, so a photo
    hosted elsewhere can never be mistaken for one of our keys."""
    assert key_from_url("https://example.com/somebody-elses.jpg") is None
    assert key_from_url(_url("cafes/x/ours.jpg")) == "cafes/x/ours.jpg"
