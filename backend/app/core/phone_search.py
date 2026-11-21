"""Matching a typed phone number against stored ones, however either was written."""
from sqlalchemy import func


def phone_digits(query: str | None, minimum: int = 3) -> str | None:
    """'+91 98480 22338' -> '9848022338'; '098480' -> '098480'; 'abc' -> None.

    A full Indian number loses its +91 / 0 prefix so it still matches a number
    stored without one. Fewer than `minimum` digits is not a phone search."""
    digits = "".join(ch for ch in (query or "") if ch.isdigit())
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    elif len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]
    return digits if len(digits) >= minimum else None


def phone_column_digits(column):
    """SQL: the column with everything but digits removed (NULL -> '')."""
    return func.regexp_replace(func.coalesce(column, ""), "[^0-9]", "", "g")
