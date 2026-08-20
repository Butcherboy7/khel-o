"""KHEL-O is India-only. session_date + start_time/end_time are stored as
naive IST wall-clock values; they must be interpreted as IST, never as UTC.

Centralized here so booking_service.py and owner_service.py (and anything
else that needs "now, in IST" or "a session's start as an aware IST
datetime") can never define their own IST constant and drift apart.
"""
from datetime import datetime, date, time, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30))


def now_ist() -> datetime:
    return datetime.now(IST)


def session_start_ist(session_date: date, start_time: time) -> datetime:
    return datetime.combine(session_date, start_time).replace(tzinfo=IST)


def session_end_ist(session_date: date, start_time: time, end_time: time) -> datetime:
    """A session's end as an aware IST datetime, correctly rolled over to the
    next calendar day for overnight sessions (e.g. 22:30 -> 00:30). Without
    this, an overnight session's end_time (naive wall-clock, same
    session_date as start) computes to BEFORE its start — any comparison
    against "now" then thinks the session ended ~a day before it started.

    This is the one place that rollover math should live; every call site
    that needs a session's end (auto-expiry, auto-transition, check-in
    window) must go through this helper so they can never desynchronize."""
    start = session_start_ist(session_date, start_time)
    end = session_start_ist(session_date, end_time)
    if end <= start:
        end += timedelta(days=1)
    return end
