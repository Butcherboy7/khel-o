from app.services.admin_search import Query


def test_phone_query():
    q = Query("+91 98480 22338")
    assert q.is_phone and q.digits == "9848022338"


def test_text_with_digits_is_not_phone():
    q = Query("PS5 2")
    assert not q.is_phone
    q = Query("KH8Q2")
    assert not q.is_phone


def test_email_and_payment():
    assert Query("ravi@gmail.com").is_email
    assert Query("pay_NxY12ab").is_payment_id
    assert not Query("rockstar").is_payment_id


def test_whitespace_collapsed():
    assert Query("  Adams   Den ").raw == "Adams Den"
