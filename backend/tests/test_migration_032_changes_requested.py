import pytest
import importlib.util
import pathlib


def _load_migration_032():
    spec = importlib.util.spec_from_file_location(
        "migration_032",
        pathlib.Path(__file__).resolve().parents[1] / "migrations" / "versions" / "032_changes_requested_and_photo_categories.py",
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_photo_backfill_wraps_flat_urls_as_exterior():
    m = _load_migration_032()
    assert m._backfill_photos(["https://x/a.jpg", "https://x/b.jpg"]) == [
        {"url": "https://x/a.jpg", "category": "exterior"},
        {"url": "https://x/b.jpg", "category": "exterior"},
    ]
    assert m._backfill_photos([{"url": "https://x/a.jpg", "category": "seating"}]) == [
        {"url": "https://x/a.jpg", "category": "seating"}
    ]
    assert m._backfill_photos([]) == []
    assert m._backfill_photos(None) == []
