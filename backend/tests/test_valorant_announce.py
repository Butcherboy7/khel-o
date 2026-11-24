import uuid

from app.services import valorant_announce as va


def test_email_is_plain_personal_and_follows_the_wording_rules():
    body = va.email_html("Asha", uuid.uuid4())
    low = (body + va.SUBJECT + va.BELL_TEXT).lower()
    for banned in ("tournament", "prize", "cash", "ticket", "upi", "refund", "free to play"):
        assert banned not in low
    assert "<img" not in low and "<button" not in low and "<table" not in low
    assert body.count("href=") == 2  # the sign-up link and the unsubscribe link
    assert "Hi Asha," in body and "₹250 per person" in body and "81421 28389" in body
    assert "unsubscribe" in body.lower() or "stop these emails" in body.lower()
