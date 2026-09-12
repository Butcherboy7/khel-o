"""clear the over-broad lead-listing backfill from 029

Revision ID: 030
Revises: 029
Create Date: 2026-09-12

029 backfilled `is_lead_listing = true` for every café whose email matched
'%@khel-o.com', on the assumption that such an address only ever belongs to a
café seeded by scripts/seed_lead_cafes.py -- i.e. a real venue KHEL-O listed
from public information that has never agreed to take bookings.

That assumption is false in production. Five cafés on those placeholder
addresses turned out to be genuinely onboarded and operating: they carry
detailed per-platform tiers at real prices (PS5, PS5 Pro, Xbox, racing sim,
specific RTX models) and three of them -- ASH Gaming Food Zone, A R Gaming Zone
and New zone gaming cafe -- have taken real bookings through the platform. The
café row's email was simply never changed away from the seeded placeholder
after onboarding, so the email is not evidence of anything.

Letting that backfill reach the new code would have made five operating cafés
unbookable and relabelled them "Booking soon", hiding prices they had actually
agreed to. Caught before the container cutover, while the running code still
ignored the column.

So the flag is cleared for every café that exists at this point. Lead-listing
status is not inferable from existing data and must be set explicitly: the only
thing that may set it is scripts/seed_real_cafes.py, which passes
is_lead_listing=True when it creates a café, and /owner/cafe/claim, which
clears it when the venue takes the account over.

029 is deliberately left as-is rather than rewritten, since it has already been
applied; on a fresh database the two run in sequence and land on the same
correct state.

NOTE for local/dev databases: if you seeded the real cafés before applying this,
this clears their flag too -- re-run `python -m scripts.seed_real_cafes --apply`
behaviour is not idempotent for the flag, so reset it by hand or reseed.
"""
from alembic import op

revision = '030'
down_revision = '029'
branch_labels = None
depends_on = None


def upgrade():
    # Unconditional: no predicate on this table distinguishes "we listed it" from
    # "they onboarded and kept the placeholder email", which is exactly the
    # mistake 029 made. Anything that genuinely is a lead listing sets the flag
    # explicitly at creation time.
    op.execute("UPDATE cafes SET is_lead_listing = false")


def downgrade():
    # Intentionally not reinstating 029's backfill -- it was wrong. Downgrading
    # leaves every café non-lead, which is the safe direction: a café that
    # wrongly takes bookings is recoverable by pausing it, a café wrongly shown
    # as "Booking soon" silently loses business.
    pass
