"""Tutorial / demo data isolation.

A demo owner and café exist on production for recording tutorials. They are
marked by reserved names (no schema change, so this ships ahead of other
migrations): café slug starts with ``khelo-demo-`` and demo user emails start
with ``khelo.demo.``. Everything platform-wide (public search, SEO, admin
stats, payouts, growth report) must exclude them; the owner's own dashboard
is keyed by owner id and is unaffected.
"""
from sqlalchemy import and_, or_, select

DEMO_SLUG_PREFIX = "khelo-demo-"
DEMO_EMAIL_PREFIX = "khelo.demo."


def demo_cafe_ids():
    from app.models.cafe import Cafe
    return select(Cafe.id).where(Cafe.slug.like(DEMO_SLUG_PREFIX + "%"))


def not_demo_cafe():
    from app.models.cafe import Cafe
    return or_(Cafe.slug.is_(None), ~Cafe.slug.like(DEMO_SLUG_PREFIX + "%"))


def not_demo_booking():
    from app.models.booking import Booking
    return Booking.cafe_id.not_in(demo_cafe_ids())


def not_demo_user():
    from app.models.user import User
    return ~User.email.like(DEMO_EMAIL_PREFIX + "%")
