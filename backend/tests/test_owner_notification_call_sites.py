import inspect
import pytest

from app.services import payment_service, booking_service


def test_notify_owner_duplication_is_gone():
    """Both services carried a byte-identical _notify_owner. The whole point of
    CafeNotifier is that there is now exactly one copy of this logic."""
    assert not hasattr(payment_service.PaymentService, "_notify_owner")
    assert not hasattr(booking_service.BookingService, "_notify_owner")


def test_every_confirm_path_passes_a_dedupe_key():
    """A confirm path without a dedupe key is a double-alert waiting for the
    next Razorpay webhook retry."""
    source = inspect.getsource(payment_service)
    notify_calls = source.count("notify_cafe(")
    assert notify_calls >= 3, f"expected >=3 notify_cafe calls, found {notify_calls}"
    assert source.count("dedupe_key=") >= 3
    assert "booking_confirmed:" in source
    assert "payment_failed:" in source

    booking_source = inspect.getsource(booking_service)
    assert "notify_cafe(" in booking_source
    assert "booking_cancelled:" in booking_source
