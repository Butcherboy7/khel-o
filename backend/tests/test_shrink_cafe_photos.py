"""The one-time S3 photo shrink: resize logic only (no S3 involved)."""
import io

from PIL import Image

from scripts.shrink_cafe_photos import MAX_SIDE, _shrink


def _jpeg(w: int, h: int, quality: int = 95) -> bytes:
    im = Image.effect_noise((w, h), 60).convert("RGB")
    out = io.BytesIO()
    im.save(out, "JPEG", quality=quality)
    return out.getvalue()


def test_phone_sized_photo_is_resized_and_smaller():
    data = _jpeg(4032, 2016)
    new, content_type, old_dims, new_dims = _shrink(data)
    assert content_type == "image/jpeg"
    assert old_dims == (4032, 2016)
    assert max(new_dims) == MAX_SIDE and new_dims[0] / new_dims[1] == 2
    assert len(new) < len(data) / 3
    assert Image.open(io.BytesIO(new)).format == "JPEG"


def test_small_photo_is_left_alone():
    assert _shrink(_jpeg(800, 600, quality=70)) is None


def test_png_stays_png():
    im = Image.new("RGB", (3000, 1500), (200, 60, 50))
    out = io.BytesIO()
    im.save(out, "PNG")
    new, content_type, _, new_dims = _shrink(out.getvalue())
    assert content_type == "image/png" and max(new_dims) == MAX_SIDE
