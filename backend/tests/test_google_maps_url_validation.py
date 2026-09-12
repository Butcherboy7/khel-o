"""Unit tests for the Google Maps share-link validator used on café details."""
import pytest

from app.constants import validate_google_maps_url


@pytest.mark.parametrize("url", [
    "https://maps.app.goo.gl/xxxxxAbC123",
    "https://goo.gl/maps/xxxxxAbC123",
    "https://www.google.com/maps/place/Some+Cafe/@12.97,77.59,15z",
    "https://google.com/maps?q=12.97,77.59",
    "http://maps.google.com/maps?q=Some+Cafe",
])
def test_accepts_known_google_maps_url_shapes(url):
    assert validate_google_maps_url(url) == url


@pytest.mark.parametrize("url", [
    "not a url",
    "https://evil.com/maps/xxxxx",
    "javascript:alert(1)",
    "https://maps.app.goo.gl.evil.com/xxxxx",
    "ftp://maps.google.com/maps?q=1",
    "",
])
def test_rejects_non_google_maps_urls(url):
    with pytest.raises(ValueError):
        validate_google_maps_url(url)


def test_none_passes_through_unchanged():
    assert validate_google_maps_url(None) is None
