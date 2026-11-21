from app.core.phone_search import phone_digits


def test_phone_digits():
    assert phone_digits("+91 98480 22338") == "9848022338"
    assert phone_digits("09848022338") == "9848022338"
    assert phone_digits("98-48") == "9848"
    assert phone_digits("ab") is None
    assert phone_digits("12") is None
    assert phone_digits(None) is None
