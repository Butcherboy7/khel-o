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
