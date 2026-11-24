from app.services import valorant_announce as va


def test_email_is_a_plain_personal_letter_that_follows_the_wording_rules():
    body, text = va.email_html("Asha"), va.email_text("Asha")
    low = (body + text + va.SUBJECT).lower()
    for banned in ("tournament", "prize", "cash", "ticket", "upi", "refund", "free", "₹", "reward", "register"):
        assert banned not in low
    assert "<img" not in low and "<button" not in low and "<table" not in low
    assert body.count("href=") == 1  # one link, no unsubscribe link in the body
    assert "Hi Asha," in body and "reply with the word stop" in text


def test_bell_follows_the_wording_rules():
    low = (va.BELL_TITLE + va.BELL_TEXT).lower()
    for banned in ("tournament", "prize", "cash", "ticket", "upi", "refund", "free"):
        assert banned not in low
