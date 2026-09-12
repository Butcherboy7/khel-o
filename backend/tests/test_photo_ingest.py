"""Cover-photo selection for real café listings.

43 of the 99 source photos are portrait (ratios down to 0.53). The grid crops
to 16:9, so picking the cover badly means shipping a horizontal sliver of a
real venue's room as its identifying image.

See docs/superpowers/specs/2026-09-10-explore-real-cafes-design.md §4.3
"""
from PIL import Image

from scripts.photo_ingest import select_cover, make_cover_derivative


def _img(tmp_path, name, w, h):
    path = tmp_path / name
    Image.new("RGB", (w, h), "black").save(path)
    return str(path)


def test_select_cover_prefers_landscape(tmp_path):
    # Real dimensions from the source set: mega gamerz vs 1vx gaming cafe.
    portrait = _img(tmp_path, "portrait.png", 481, 803)
    landscape = _img(tmp_path, "landscape.png", 1385, 663)
    assert select_cover([portrait, landscape]) == landscape


def test_select_cover_prefers_the_widest_qualifying_landscape(tmp_path):
    mild = _img(tmp_path, "mild.png", 900, 700)        # 1.29, below the 1.4 bar
    good = _img(tmp_path, "good.png", 1433, 639)       # 2.24, g5 arena
    assert select_cover([mild, good]) == good


def test_select_cover_falls_back_to_highest_resolution(tmp_path):
    """A café whose every photo is portrait still needs a cover."""
    small = _img(tmp_path, "small.png", 476, 806)
    big = _img(tmp_path, "big.png", 900, 1400)
    assert select_cover([small, big]) == big


def test_select_cover_handles_single_photo(tmp_path):
    only = _img(tmp_path, "only.png", 476, 806)
    assert select_cover([only]) == only


def test_select_cover_returns_none_for_empty():
    assert select_cover([]) is None


def test_make_cover_derivative_produces_16_9(tmp_path):
    source = _img(tmp_path, "tall.png", 476, 806)
    out = tmp_path / "cover.jpg"
    make_cover_derivative(source, str(out))

    with Image.open(out) as im:
        width, height = im.size
    assert abs((width / height) - (16 / 9)) < 0.02


def test_make_cover_derivative_keeps_landscape_detail(tmp_path):
    source = _img(tmp_path, "wide.png", 1385, 663)
    out = tmp_path / "cover.jpg"
    make_cover_derivative(source, str(out))

    with Image.open(out) as im:
        width, height = im.size
    assert abs((width / height) - (16 / 9)) < 0.02
    # A 2.09 source should be cropped horizontally, not upscaled past itself.
    assert width <= 1385
