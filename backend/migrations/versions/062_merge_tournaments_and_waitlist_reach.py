"""merge tournaments and waitlist reach.

Joins the two heads that both follow 059: 060 (tournaments, already applied
on the dev site) and 061 (cafe_waitlist reach-me fields). No schema change.

Revision ID: 062
Revises: 060, 061
Create Date: 2026-10-15
"""

revision = '062'
down_revision = ('060', '061')
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
