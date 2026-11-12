"""Expected FPS on a PC setup: estimated from the GPU, owner numbers win, unknown GPUs get nothing."""
from app.core.fps_estimate import expected_fps
from app.schemas.hardware_tier import HardwareTierResponse
from datetime import datetime, timezone
import uuid


def test_known_gpu_gets_labelled_estimates():
    rows = expected_fps("pc", {"gpu": "NVIDIA GeForce RTX 4070"}, {})
    by_key = {r["key"]: r for r in rows}
    assert by_key["valorant"] == {"key": "valorant", "game": "Valorant", "fps": 500, "estimated": True}
    assert all(r["estimated"] for r in rows)


def test_ti_variant_is_not_mistaken_for_its_prefix():
    ti = {r["key"]: r["fps"] for r in expected_fps("pc", {"gpu": "RTX 4060 Ti"}, {})}
    plain = {r["key"]: r["fps"] for r in expected_fps("pc", {"gpu": "RTX 4060"}, {})}
    assert ti["valorant"] > plain["valorant"]


def test_owner_number_wins_and_is_not_estimated():
    rows = {r["key"]: r for r in expected_fps("pc", {"gpu": "RTX 3060"}, {"valorant": 310})}
    assert rows["valorant"]["fps"] == 310 and rows["valorant"]["estimated"] is False
    assert rows["cs2"]["estimated"] is True


def test_unknown_gpu_gets_no_estimate_but_owner_numbers_still_show():
    assert expected_fps("pc", {"gpu": "Budget"}, {}) == []
    rows = expected_fps("pc", {"gpu": "Budget"}, {"cs2": 120})
    assert [(r["key"], r["estimated"]) for r in rows] == [("cs2", False)]


def test_consoles_and_missing_specs_get_nothing():
    assert expected_fps("playstation", {"console": "PS5"}, {}) == []
    assert expected_fps("pc", None, None) == []


def test_response_serialises_expected_fps_camel_case():
    now = datetime.now(timezone.utc)
    resp = HardwareTierResponse(
        id=uuid.uuid4(), cafe_id=uuid.uuid4(), total_seats=4, app_bookable_seats=4, price_per_hour=100,
        platform="pc", specs={"gpu": "RTX 3060"}, active_seats_count=4, is_active=True,
        created_at=now, updated_at=now, refresh_rate_hz=144,
    )
    dumped = resp.model_dump(by_alias=True)
    assert dumped["refreshRateHz"] == 144
    assert dumped["expectedFps"][0]["game"] == "Valorant"
